# Backend as microservices — architecture and migration plan

Decisions (made with the owner): **6 domain services**, **2 BFFs** (mobile, admin), **one MongoDB database per
service on the same Atlas cluster**, **local Docker Compose first, Render later**. The phone app and the
dashboard keep calling the same `/api/...` contract, so neither needs a rebuild until a BFF deliberately changes
a route.

```
 phone app ──► mobile-bff ─┐                     ┌─► identity    (db: identity)
                           ├──► internal HTTP ──┼─► catalog     (db: catalog)
 dashboard ──► admin-bff ──┘   (service JWT)    ├─► wallet      (db: wallet)
                                                 ├─► orders      (db: orders)
                                                 ├─► calls       (db: calls)
                                                 └─► engagement  (db: engagement)
```
Only the two BFFs are reachable from the internet. The six services listen on an internal network and refuse
any request without a valid service token.

## 1. Services and what each owns

| Service | Modules today | Owns (collections) | Why together |
|---|---|---|---|
| **identity** | `auth`, `users`, `operators`, `policies` | `users`, `operators`, `auditlogs`, `policies`, policy acceptances | Who a person is: devotee profiles, astrologer invites/claim, dashboard operators, roles/permissions, audit log |
| **catalog** | `content`, `home`, `live`, `poojas` (definitions), `chadhava` (listings+categories), `panchang`, `horoscope`, `media` | deities, temples, aartis, festivals, sevas, knowledge, faqs, hero slides, tones, wallpaper styles, reminders, home sections, live streams/categories, poojas, chadhava listings/categories, panchang, horoscope, GridFS `media` | Everything a devotee reads. Read-heavy, rarely changes, cacheable |
| **wallet** | `wallet`, `coins` | wallets, wallet ledger (`WalletTxn`), coin packs, coin orders, provider webhooks | The ONLY code that changes a balance, and the only code that talks to Razorpay |
| **orders** | `bookings`, `chadhava` (orders), `poojas` (reviews) | pooja bookings, chadhava orders, pooja reviews | Spending coins on a thing: a booking/order is a saga over wallet debit |
| **calls** | `astrologers`, `calls`, `payouts` | astrologers, calls, per-minute earnings, payout records, the call-refund intents (`callintents`) | Real-time astrologer calls and their per-minute billing + earnings; owns the audio provider (`RTC_PROVIDER`, `AGORA_*`) and the billing ticker |
| **engagement** | `flags`, `analytics`, `announcements`, settings | flags, visitors/events, announcements, `settings` key/value | Operational config and telemetry that every other service reads |

`Setting` (prasad fee, support contacts, coin rate) moves out of content into **engagement**, because wallet, orders
and catalog all read it.

## 2. Who may call whom (the only allowed edges)

```
mobile-bff / admin-bff  →  every service
orders   → wallet (debit/refund), catalog (pricing + temple/pooja/listing facts), identity (user name, push device, push/send), engagement (push token; no setting is read today)
calls    → wallet (per-minute debit/credit), identity (user, astrologer claim, push/send + push/reachable), engagement (settings)
wallet   → engagement (settings, flags), identity (blocked?)
catalog  → orders (booking counts, review aggregates — read-only, cached), engagement (settings)
identity → calls (astrologer invite lookup/claim)
```
(Phase 6 as built: identity → calls is `POST /internal/calls/directory/astrologers/claim` and `GET .../active?uid=`, issuer `identity` only; calls → identity is the devotee directory (name, push device) and the best-effort role write; calls → engagement is the billing rules and the push token; calls → wallet is every minute's debit and every refund.)
No other edges. **No service reads another service's database.** No cycles beyond the two read-only
`catalog ⇄ orders` lookups, which are cached and degrade to "absent" (a rating or count simply disappears) — never
an error.

## 3. Calling convention (shared package `@bhakti/common`)

- **Transport:** JSON over HTTP, paths under `/internal/<service>/...` on each service.
- **Service auth:** the BFF verifies the end user (Firebase ID token for mobile; operator session cookie for
  admin), then calls services with `Authorization: Bearer <service JWT>` signed (HS256, `INTERNAL_JWT_SECRET`,
  60 s expiry) with claims `{ iss, sub: uid|operatorId, role, perms: [...], reqId }`. Services verify the JWT and
  trust only its claims. Services never see a Firebase token or a cookie. A service-to-service call re-signs with
  `iss` = its own name and the original `sub`/`reqId`. An optional signed `ctx` object carries facts the edge already
  verified so nobody has to ask identity again: a devotee's profile `name`/`role` and the verified token fields
  (`tok`), an operator's `username`, or a verdict (`ctx.authError` = `blocked|invalid|unavailable|no_operators`) that lets
  the monolith answer exactly the 401/403/503 its own auth used to. **Who trusts whom (phase 2):** every route family is
  bound to the BFF that authenticates its caller - devotee routes accept only `mobile-bff` tokens, operator routes only
  `admin-bff` tokens (the monolith in `lib/trusted-claims.js`, identity per route in `lib/perms.js onlyFrom`); a valid
  token from the wrong BFF is as good as none.
- **Errors:** the existing `{ error, code, ...extra }` shape (e.g. `402 insufficient_coins`) is preserved and
  passed through by the BFF unchanged.
- **Resilience (in the shared HTTP client):** per-call timeout (default 5 s), 1 retry on connection errors and 502/503/504
  for idempotent GETs only, a small circuit breaker, request id propagated as `x-request-id` and logged by every service.
- **Idempotency:** every money-moving call carries a client-chosen key (already the case: `requestId`). Wallet
  stores it; a retry returns the first result.
- **Health:** every service exposes `GET /health` (200 only when its DB is connected and seeded; 503 while booting,
  same as `pooja-api` today) and `GET /health/deps` for the BFFs' readiness.
- **Config:** each service reads its environment in ONE file (`src/config.js`), per the project convention; each has
  a `.env.example` listing every variable.

## 4. Money sagas (no cross-service transactions)

Spend (booking / chadhava / call minute):
1. **orders** inserts the order as `pending` with the client `requestId`.
2. **orders → wallet** `POST /internal/wallet/debit { uid, amount, key: requestId, ref }` (idempotent).
3. On `200` orders marks `booked`; on `402/409` marks `failed` (and returns the error to the caller).
4. If orders crashes between 2 and 3, a **sweeper** re-asks wallet `GET /internal/wallet/txn?key=…` and completes
   or fails the order. Retrying the same `requestId` is always safe.
Cancel/refund: orders marks `cancelled`, then `POST /internal/wallet/refund { key: <order key>:refund, ofKey: <the debit's key> }`. **(Phase 5)** the wallet
verifies `ofKey`: that debit must exist, be `posted`, be a spend, belong to the same uid, be at least as large as the refund, and not have been refunded under
another key (a unique index makes that race-proof); the one exemption is the monolith's operator goodwill refund on a call (`reason`, refType `call`).
**As built, the saga is not pending-then-confirm**: the durable note is an *intent* (`orderintents`, in the orders database) written BEFORE the debit, holding everything
the order is made from; see phase 5 in section 8.
Calls billing ticker: calls service debits per started minute with key `call:<id>:min:<n>` (**phase 6**: the same key on every retry; the wallet being unable to answer defers the minute, it never ends or bills a call on a guess; refunds go through a durable intent in `callintents`; see phase 6 in section 8).
Buy coins: wallet owns packs, creates the Razorpay order, verifies signature/webhook, credits — unchanged logic, moved.

## 5. The two BFFs

**mobile-bff** (public; phone app). Verifies the Firebase ID token (`firebase-admin`), blocks `blocked` users
(asks identity), forwards `/api/...` exactly as the app calls them today, and **composes**:
- `GET /api/content` = catalog content + engagement settings/announcement + home sections (today `public/`; built in phase 3).
- `GET /api/flags` = engagement.
- `POST /api/auth/sync` = identity (sync + astrologer claim), `GET /api/wallet*`, `/api/wallet/orders`, webhooks → wallet,
  `/api/poojas*` `/api/chadhava/listings*` `/api/live*` → catalog, `/api/bookings*` `/api/chadhava/orders*` → orders,
  `/api/astrologers*` `/api/calls*` → calls, `/api/ingest/*` → engagement, `/uploads/*` → catalog media (streamed,
  Range-aware, immutable cache headers kept).
- Keeps the PUBLIC allowlist fail-closed: a route the BFF does not list does not exist.
- **Phase 2 (built):** the device auth edge. It verifies the Firebase ID token with `firebase-admin` (project id alone
  suffices; no secret needed), asks identity "blocked?" on EVERY authenticated request (cached 10 s per uid, **fail closed**:
  identity unreachable = 503 `auth unavailable`, never an open door), serves `/api/auth/*` and the policy routes from
  identity, and forwards everything else to the monolith with a signed token (`iss mobile-bff`, `sub` uid, `ctx` name/role)
  instead of the Firebase token. A bad/blocked/unavailable verdict is signed into the token so the monolith's `requireAuth`
  answers it itself. Operator routes **left** this BFF.

**admin-bff** (public; dashboard). Owns the operator **session cookie** (cookie signing, SameSite/CORS rules, login
throttle) — credential checks and operator CRUD stay in identity. Applies the role/area gate (`access/routes.js`,
`access/permissions.js` move here), masks devotee PII for roles without access, forwards `/api/admin/*` as today,
and records the audit log through identity. A new admin route needs an area entry or it answers admin-only.
- **Phase 2 (built), with two deliberate differences from the paragraph above:** (1) the BFF applies the area gate to the
  routes **it serves** (identity and engagement operator routes); for routes still **owned by the monolith** it only
  authenticates and signs `{sub, role, perms}`, and the monolith stays the authority for the area gate - some of its routes
  are open to the phone app without any session (the `public`/`devotee` module routers answer before its gate) and a BFF
  that gated by path would wrongly 401/403 them. The gate moves into the BFF for good when those modules leave the monolith.
  (2) **Masking of devotee PII stays where the rows are serialised** (`pooja-api/src/access/redact.js`, driven by the signed
  permissions and `ADMIN_SESSION_SECRET` for the pseudonyms), because wallet/booking/call rows are still the monolith's;
  identity only returns real names to services, and its own admin routes (`devotees`, `operators`) are admin-only so they
  carry nothing to mask. The BFF records an audit entry for EVERY successful operator write it lets through (its own routes
  and proxied ones) via identity; the monolith's `auditWrites` is off in this mode.

Both BFFs: CORS policy (`CORS_ORIGIN`, never `*` with credentials), `trust proxy`, security headers, request ids,
the `/api/health` the CI deploy job polls (reports `commit`), and a smoke test equal to today's `scripts/smoke.mjs`.

## 6. Data: one database per service on the same Atlas cluster

Databases `identity`, `catalog`, `wallet`, `orders`, `calls`, `engagement` (cluster stays within the free 512 MB;
GridFS media lives in `catalog`). A one-time, **idempotent, copy-only** script `tools/split-db.mjs [--dry-run]`
copies each collection from the existing `bhakti` database into its owner's database and prints counts; it never
deletes from `bhakti`, so rollback is "point the monolith back". Collections: `identity` = `users`, `operators`,
`auditlogs`, `policies` (policy acceptances are the `acceptedPolicies` map on each `users` document, not a collection).
**Run the copy BEFORE the identity service's first start on real data**: it seeds the default policy and, with an empty
operators collection, creates a first admin from `ADMIN_PASSWORD` - both would then collide with the copied rows
(unique `policies.key`, `operators.username`).
`wallet` = `wallets`, `wallettxns`, `coinpacks`, `coinorders` (`--service wallet`; copy before its first start, then check `verifyWallet`; see phase 4 in section 8).
`calls` = `astrologers`, `callsessions`, `astrologerearnings`, `payouts` and the call-refund intents (`--service calls`: the monolith's `walletintents` FILTERED to kind `refund` / refType `call` and copied as `callintents`, `_id` and field order intact, unfinished rows included; the booking / chadhava intents are orders'; see phase 6).
`orders` = `bookings`, `chadhavaorders`, `poojareviews` and the saga's intents (`--service orders`: the monolith's `walletintents` copied as `orderintents`, FILTERED to the booking / chadhava
debits and their refunds, `_id` and field order intact, unfinished rows included; the call refunds stay behind; see phase 5).

Cross-service references are by **stable slug or uid** (`templeSlug`, `poojaSlug`, `listingSlug`, `uid`), never an
ObjectId from another service. Needed facts are fetched or denormalised at write time (an order stores the pooja
title and package name it was bought as — it already should, so a later edit does not rewrite history).

## 7. Repository layout

```
backend/                       (new; npm workspaces)
  packages/common/             service JWT, http client (timeout/retry/breaker), errors, logger, health, config helpers,
                               plus (phase 0) the shared CORS policy, streaming proxy and gateway-app builder both BFFs use
  services/{identity,catalog,wallet,orders,calls,engagement}/
  bff/{mobile,admin}/
  tools/split-db.mjs
  docker-compose.yml           mongo + 6 services + 2 BFFs, one command
  README.md
pooja-api/                     the existing monolith, UNTOUCHED until its last route is moved (strangler)
```
Each service: `src/{config.js,server.js,app.js,routes/,modules/…}`, its own `package.json`, tests (`node --test`) that
need a local `mongod` like today's, and a `Dockerfile`.

## 8. Rollout — strangler, never a big bang

Every step ends with: all existing tests green, the smoke test green **through the BFF**, the phone app/dashboard
unchanged.

0. **Foundation (done):** `@bhakti/common`, both BFFs as thin gateways in front of the existing monolith (contract unchanged,
   still one backend behind them), Docker Compose with the monolith + BFFs.
1. **engagement** (leaf, no money): flags, analytics, announcements, settings. BFFs route to it; monolith routes retired.
   **STATUS: built and verified locally (plain Node, not Docker).** Retirement is feature-flagged: `ENGAGEMENT_URL` unset keeps the
   monolith serving everything; set retires the routes there. Transitional deviations from section 5: the admin BFF does not yet own the
   session (it asks the monolith's `/api/admin/session`, 30 s cache), audit entries go through the monolith's `POST /internal/audit`, and
   BOTH BFFs serve the operator routes (the smoke test runs through both). `tools/split-db.mjs` has the engagement entry.
   Phase 0 status: done.
2. **identity**: users, auth sync, operators, policies, audit.
   **STATUS: built and verified locally (plain Node, not Docker).** Switch: `IDENTITY_URL` (+ `INTERNAL_JWT_SECRET`) on the
   monolith and both BFFs; unset = phase 1 exactly (the monolith authenticates and owns users/operators/policies), set = the
   BFFs authenticate, identity owns the data, the monolith trusts the BFFs' signed tokens and retires `/api/auth`,
   `/api/users`, `/api/admin/operators|audit-log|policies|login|logout|session` and `/internal/audit` (404). Rollback = unset
   it (identity's collections are never deleted; copy back by hand if you need what it took meanwhile). What identity
   needs from the monolith: `POST /internal/astrologers/claim` and `GET /internal/astrologers/active` (issuer `identity`
   only), because astrologers stay there until phase 6; what the monolith needs from identity: `lib/identity-client.js`
   + `lib/user-directory.js` (names, device ids, wallet search, role writes - 5 s timeout, 15 s cache, non-critical reads
   degrade to "absent", the wallet search is a clear 503). Firebase split: the **mobile BFF verifies** ID tokens (needs
   no secret), **identity revokes refresh tokens and deletes Firebase accounts** (the dashboard actions that need a key
   that can delete accounts - so the internet-facing admin edge never holds one). `tools/split-db.mjs` has the identity entry.
   Phase-1 stopgaps removed in this mode: the admin BFF no longer asks the monolith for `/api/admin/session` nor posts to its
   `/internal/audit` (both stay only for `IDENTITY_URL` unset); the mobile BFF serves no operator route.
3. **catalog**: content, home, live, poojas, chadhava listings, panchang, horoscope, media.
   **STATUS: built and verified locally (plain Node, not Docker).** Switch: `CATALOG_URL` (+ `INTERNAL_JWT_SECRET`) on the monolith and
   both BFFs; unset = phase 2 exactly (the monolith owns and serves all of it), set = the catalog owns the data and the routes, the
   BFFs serve them, and the monolith answers **404** for: `GET /api/content`, `/api/horoscope`, `/api/panchang`, `/api/live*`,
   `/api/poojas` and `/api/poojas/:slug`, `/api/chadhava/offerings|listings*`, `/uploads/*`, `/api/content/<resource>` (deities ...
   wallpaper-styles, horoscopes, panchangs, hero) and `/api/content/upload`, `/api/horoscope/day/:date`, `/api/admin/home-sections|poojas|offerings|
   chadhava-listings|chadhava-categories|live-streams|live-categories`. It stops seeding those collections and running the live probe.
   Rollback = unset it everywhere (catalog's data is not copied back). Catalog also needs `ENGAGEMENT_URL` (settings: prasad fee,
   chadhava fee/minimum), and **both BFFs refuse to boot with `CATALOG_URL` but no `ENGAGEMENT_URL`** (`/api/content` carries
   engagement's settings + announcement); the **mobile BFF also needs `IDENTITY_URL`** (see deviations).
   - **What stayed in the monolith until phase 5** (now the orders service's, see below): `Booking`, `PoojaReview`, `ChadhavaOrder`, `GET /api/poojas/:slug/reviews`, the
     `POST /api/chadhava` 410, all `/api/bookings*`, `/api/chadhava/orders*`, `/api/admin/bookings|reviews|chadhava-orders`.
   - **The monolith still needs catalog facts - the priced snapshot.** `pooja-api/src/lib/catalog-client.js` (signed `iss monolith`, 5 s
     timeout). A booking / chadhava order reads `GET /internal/catalog/pricing/pooja/:slug` / `.../chadhava/:slug` **fresh for that
     purchase - never cached, never stale, fail CLOSED**: catalog unreachable / slow / refusing = `503 {code:'catalog_unavailable'}` before
     any coin moves (a retry of an already-succeeded `requestId` returns the first result and needs no catalog). The total is still
     computed server-side in the monolith's own code from the snapshot's packages/offerings; a client price is never an input. The one
     non-critical read (the reviews route asking "does this pooja exist?") is cached 15 s and degrades to "assume yes".
   - **catalog -> orders (section 2), implemented as `GET /internal/orders/pooja-stats`** on the monolith (service JWT, issuer `catalog`
     only, mounted only while `CATALOG_URL` is set): `{stats:{<poojaSlug>:{bookingCount, rating:{avg,count}|null}}}`. Catalog caches it 30 s
     (`ORDERS_URL` names the orders side - the monolith for now) and any failure means *absent*: booking count 0, rating `null` (hidden) - never
     an error, and stale numbers are dropped, not kept. Live <-> chadhava/pooja links are now intra-catalog.
   - **`GET /api/content` is assembled in the BFFs** (`packages/common/src/catalog-content.js` + `catalog-mount.js`): catalog's
     `/internal/catalog/public/content` + engagement's settings map + current announcement, key order identical to the monolith's
     (`deities, temples, aartis, festivals, sevas, knowledge, faqs, hero, home, reminders, tones, wallpaperStyles, settings, announcement`).
     Catalog down: the last good body is served with `x-degraded: catalog` for up to 60 min (then 503 `catalog_unavailable`; the app falls
     back to its bundle). The other app reads (`horoscope`, `panchang`, `live*`, `poojas*`, `chadhava/offerings|listings*`) get the same
     stale-while-error per request URL (60 min; **live: 2 min**, because "on air" goes stale fast). Engagement down: settings/announcement fall
     back to the documented defaults, as before.
   - **Media**: `/uploads/<id>.<ext>` is streamed by both BFFs from `GET /internal/catalog/media/:file` (Range 206/416, ETag/304, `immutable`,
     `nosniff`, `Content-Security-Policy: sandbox`, type from the extension - the monolith's code, verified byte for byte including 100-199 and
     suffix ranges); catalog down = `503 catalog_unavailable`. Uploads: the admin BFF gates (area `content`), audits and **streams** the multipart
     body to catalog (never parsed at the edge); catalog parses it with the same size limit (`MAX_UPLOAD_MB`) and extension allowlist.
     `DELETE /api/content/upload` (orphan delete) is a normal JSON operator route. GridFS `media.files` / `media.chunks` move with the DB split.
   - **Admin**: the dashboard -> admin-bff -> catalog. The BFF applies the area gate to these routes itself
     (`packages/common/src/catalog-routes.js` is the single table; `operator/access-parity.test.mjs` checks every entry against the monolith's
     `access/routes.js`, and the catalog's own test walks its router stack so a new route without a table entry fails), forwards
     `{sub, role, perms, ctx.username}` in the service token, and catalog re-checks the area from the token (defence in depth). Audit entries go to
     identity (or the monolith in legacy mode) for every successful write, the streamed upload included. **No money guard exists on catalog data in
     the monolith** (an editor may change pooja/chadhava prices today; only `settings` rows are money-guarded, and those are engagement's), so none
     was added: behaviour preserved exactly. `POST /api/admin/poojas/import-sevas` reads the prasad fee STRICTLY from engagement (refuses rather than
     guessing it).
   - **Cutover**: `node tools/split-db.mjs --source <uri>/<monolith db> --service catalog --dry-run`, then for real (copies the 22 catalog collections +
     GridFS; field order is preserved, since it is the key order of every response), **then** start catalog (its seeds only fill EMPTY collections),
     then set `CATALOG_URL`.
   - **Degraded mode summary**: catalog down -> purchases 503, content/reads stale-while-error with `x-degraded: catalog`, `/uploads` 503,
     dashboard catalog routes 502 / uploads 503, `/api/health` stays 200 with `degraded:["catalog"]`, `/health/deps` 503.
   - **Deviations from the plan above**: (1) Jai (`POST /api/live/:slug/jai`) is served only by the **mobile BFF** and needs its identity edge, hence
     the config rule; through the admin BFF it falls to the monolith (404). (2) The monolith's token issuer is `monolith`, like its engagement/identity
     clients (catalog accepts `monolith` and `pooja-api`). (3) The public reviews route stays with the reviews (monolith) rather than moving to catalog,
     and asks catalog only whether the pooja exists. (4) Catalog serves `/internal/catalog/<the monolith's /api path>` (so `to == path` in the BFF
     tables) plus `public/content`, `pricing/*` and `media/*`.
4. **wallet**: wallet + coins + Razorpay + webhooks (cut over with the webhook URL unchanged — the BFF forwards it).
   **STATUS: built and verified locally (plain Node, not Docker).** Switch: `WALLET_URL` (+ `INTERNAL_JWT_SECRET`) on the monolith and both BFFs;
   unset = phase 3 exactly (the monolith owns wallets, the ledger, packs and purchases and talks to Razorpay), set = the wallet service owns them
   (db `wallet`: `wallets`, `wallettxns`, `coinpacks`, `coinorders`), the BFFs serve the routes and the monolith answers **404** for `GET /api/wallet`,
   `/api/wallet/transactions`, `/api/coins/packs`, `POST /api/wallet/orders`, `POST /api/wallet/orders/:id/verify`, `POST /api/webhooks/razorpay`,
   `/api/admin/wallets|wallet-transactions|wallet/adjust|coin-packs|coin-orders|coin-stats|billing/rules`. It stops seeding the two modules and **no longer
   reads `PAYMENTS_PROVIDER` / `RAZORPAY_*`** (they are the wallet service's `config.js`; mock refused in production, keys trimmed, exactly as before).
   Rollback = unset it everywhere (the wallet's data is not copied back). The monolith **refuses to boot** with `WALLET_URL` but no `ENGAGEMENT_URL`
   (the billing rules the wallet writes live in engagement, and calls/bookings read them there); the wallet service requires `ENGAGEMENT_URL` and
   `IDENTITY_URL`; the mobile BFF requires `IDENTITY_URL` (its device auth edge supplies the uid).
   - **Who calls what on the wallet** (`lib/perms.js`, one caller kind per route family; a valid token from the wrong issuer is a 403): the ledger API
     (`POST /internal/wallet/debit|refund|credit|reconcile`, `GET /txn?key=`, `GET /balance/:uid`) - monolith / orders / calls only; the devotee routes
     (`/wallet`, `/wallet/transactions`, `/wallet/orders`, `/wallet/orders/:id/verify`) - mobile-bff only (uid = signed `sub`); `/coins/packs` and the
     webhook - either BFF; `/admin/...` - admin-bff only, behind the area gate (re-checked in wallet from the signed perms). Debit types are an allow-list
     (`booking_debit|chadhava_debit|call_debit`); `credit` accepts `bonus` only (purchases are credited by verify/webhook inside the service).
   - **Money fails CLOSED in the monolith** (`lib/wallet-client.js`, signed `iss monolith`, 5 s timeout, no cache, no retry): timeout / refused / 5xx /
     unreadable / a token wallet rejects = `503 {code:'wallet_unavailable'}`, never success and never a 0 balance; the wallet's business answers (402
     `insufficient_coins` + `needed|balance|shortfall|type`, 400, 409 `key_reused`) are rethrown as the same `HttpError`. Every call carries the SAME idempotency
     key as before (`booking:<uid>:<requestId>`, `chadhava:<uid>:<requestId>`, `call:<id>:min:<n>`, `<order key>:refund`, `order:<coinOrderId>`).
   - **The saga (section 4) as built** (`lib/wallet-saga.js`, `lib/wallet-ledger.js`; only when `WALLET_URL` is set). The monolith's bookings / chadhava orders are
     still debit-then-write (not pending-then-confirm), so the durable note is a `WalletIntent` (collection `walletintents`, in the monolith's database; it moves
     to the orders service in phase 5) written BEFORE the money moves, holding everything the order is made from. Answered -> write the order, close the intent;
     402 -> close `failed`; AMBIGUOUS (the debit may have landed) -> 503 and the intent stays `pending`. The sweeper (run by the billing ticker every 5 s, for intents
     older than 10 s) asks `GET /internal/wallet/txn?key=`: `posted` -> write the order (idempotent on `(uid, requestId)`), `failed` -> close, `pending` -> wait (the
     wallet's own reconciler settles it), unknown -> after 120 s close `expired` (the request never arrived; the user's retry with the same requestId then
     charges normally). Refunds are intents too: written first, re-sent with the same key until the wallet answers (cancel flags the order, then 503 + queued
     refund; a failed save closes the debit intent as `refunded` so the sweeper can never resurrect an order whose coins went back). Calls need no intent: the
     ticker re-asks the same `call:<id>:min:<n>` key (`nextBillAt` only advances after the wallet answers), a wallet that cannot answer at accept leaves the call
     connected and unbilled until it can (never ended on a guess, never billed twice), and a connect-failure refund is queued.
   - **Reads for display** (the balance next to a repeated booking, the call view) degrade to *absent*; the gate reads (is there enough to start a call) fail closed.
     The BFF's `GET /api/coins/packs` serves the last good list for up to an hour with `x-degraded: wallet`; the balance chip (`GET /api/wallet`) is 503.
   - **Razorpay**: order creation, the checkout signature and the webhook signature moved unchanged. The webhook is **streamed** by both BFFs (`createProxy`, no parser in
     front) with every header as received, so the HMAC over the raw bytes holds; the wallet reads it with `express.raw`, checks the signature BEFORE parsing, and credits through
     the same idempotency key as verify (`order:<id>`), so verify + webhook + replays credit once. Keep Razorpay's webhook URL on the BFF.
   - **Settings (fail closed)**: engagement is the settings table; the wallet reads the coin rate **fresh** (<= 15 s) for every pack create/edit and the billing-rules screen and
     answers `503 settings_unavailable` instead of guessing; only the pack LIST's sale labels may use the last answer of any age (credited coins never depend on the rate).
   - **Masking** of devotee names in the admin ledger / coin orders stays where the rows are serialised: `services/wallet/src/lib/redact.js` is a copy of the monolith's (same
     pseudonyms for the same `ADMIN_SESSION_SECRET`; parity-tested). `lib/coin-pack.js` is now copied in three places (API, dashboard, wallet); the dashboard's parity test covers all three.
   - **Cutover**: `node tools/split-db.mjs --source <uri>/<monolith db> --service wallet --dry-run`, then for real, **then** start wallet (its seed only fills an EMPTY pack list), then set `WALLET_URL`
     everywhere. Check with `verifyWallet(uid)` (balance == sum of posted ledger rows). A `pending` row is copied as pending and finished once by the wallet's reconciler.
   - **Degraded mode summary**: wallet down -> every purchase / cancel / balance / buy-coins / webhook is 503 `wallet_unavailable` (the webhook 503 makes Razorpay retry), no balance changes,
     orders left pending are finished by the sweeper when it returns, `/api/health` stays 200 with `degraded:["wallet"]`, `/health/deps` is 503, dashboard wallet routes 502.
   - **Known limits**: the ledger API trusts its order-side callers (a `refund` is not checked against the debit it reverses - a compromised monolith could mint coins; checking `ofKey` is a phase-5
     hardening - **DONE in phase 5**, see there). The wallet does not ask identity "is this uid blocked?": the mobile BFF does that on every devotee request, and a blocked devotee's in-flight call minutes still bill.
     `WalletIntent` rows are kept (small); nothing prunes them yet - **phase 5**: the booking / chadhava intents moved to the orders service, which prunes terminal ones after 30 days; the monolith's own sweep prunes the call-refund ones.
5. **orders**: bookings, chadhava orders, reviews (sagas over wallet).
   **STATUS: built and verified locally (plain Node, not Docker).** Switch: `ORDERS_URL` (+ `INTERNAL_JWT_SECRET`) on the monolith and both BFFs; unset = phase 4 exactly (the
   monolith owns bookings, chadhava orders, reviews and the saga around them), set = the orders service owns them (db `orders`: `bookings`, `chadhavaorders`, `poojareviews`,
   `orderintents`), the BFFs serve the routes and the monolith answers **404** for `/api/bookings*`, `/api/chadhava/orders*`, `POST /api/chadhava` (the 410), `GET /api/poojas/:slug/reviews`,
   `/api/admin/bookings|reviews|chadhava-orders`, and for `GET /internal/orders/pooja-stats` (the orders service answers the SAME path with the same shape, so catalog's client did not change:
   point catalog's `ORDERS_URL` at the orders service). Rollback = unset it everywhere (what orders recorded meanwhile is NOT copied back). The monolith **refuses to boot** with `ORDERS_URL` but not
   `CATALOG_URL`, `WALLET_URL`, `IDENTITY_URL` and `ENGAGEMENT_URL`; the orders service requires all four URLs; the mobile BFF requires `IDENTITY_URL`.
   - **Who calls what** (`lib/perms.js`): devotee routes - `mobile-bff` only (uid = signed `sub`, profile name = `ctx.name`); `POST /chadhava` (410) - mobile BFF; the public review list - either BFF;
     operator routes - `admin-bff` only, behind the area gate (area `orders`: everyone with the dashboard reads, a status change / review hide / "mark offered" needs `orders:edit`; re-checked in orders from the
     signed perms; `operator/access-parity.test.mjs` checks every table entry against the monolith's `access/routes.js` and that the tables cover every route the monolith's modules registered); `GET /pooja-stats` - `catalog` only.
     The tables are `packages/common/src/orders-routes.js`; the BFF side is `orders-mount.js` (a purchase gets a 15 s timeout, `ORDERS_TIMEOUT_MS`; 201-vs-200 and every business answer are relayed unchanged;
     orders unreachable = `503 orders_unavailable`, a purchase is never reported as made; the review list is stale-while-error for an hour). The shared client gained `full: true` (resolve `{status, data}`) and
     `codedErrorsAreAnswers` (a 503 carrying a business code - orders saying `wallet_unavailable` - is an answer: not retried, not counted against the circuit breaker).
   - **The saga lives here now** (`services/orders/src/modules/saga/`, collection `orderintents`) with the phase-4 semantics unchanged: an intent is written BEFORE the debit; the SAME key on every retry; a timeout / refused / 5xx
     after the call was sent is AMBIGUOUS (503 `wallet_unavailable`, intent stays `pending`); the sweeper (every 5 s, intents older than 10 s) asks `GET /txn?key=` and completes (`posted`), closes (`failed`), waits (`pending`)
     or after 120 s closes `expired` (unknown key); cancel flags the order in one conditional write then refunds under `<booking|chadhava>:<id>:refund` (repeats add nothing); a failed save refunds durably and quietly under
     `<debit key>:failed` and closes the debit intent `refunded` so the sweeper can never resurrect the order. A retry with the same `requestId` returns the same order and needs neither catalog nor wallet.
     **Pruning**: terminal intents (done / failed / expired / refunded) older than `INTENT_RETENTION_DAYS` (30) are deleted hourly (`PRUNE_EVERY_MS`); a pending intent is never deleted. The monolith's own sweep does the same for the
     call-refund intents it keeps. **Legacy refunds**: a refund queued before the wallet checked `ofKey` carries none; both sweepers derive it from the key (`...:failed`, `<kind>:<id>:refund` via the order row, `call:<id>:refund:<n>`;
     a goodwill row sends its note as `reason`), and one that cannot be derived is closed `failed` loudly rather than paid on a guess.
   - **Refund hardening (wallet service)**: `POST /internal/wallet/refund` requires `ofKey` (the idempotency key of the debit it reverses) and checks, in this order: the debit exists (409 `refund_no_debit`), is the same uid's (409
     `refund_wrong_account`), is `posted` (409 `refund_debit_not_posted`), is one of the three spend types (409 `refund_not_a_debit`), is at least the refund's size (400 `refund_exceeds_debit`), and was not refunded under another key
     (409 `already_refunded`; a unique partial index on `ofKey` makes parallel refunds safe). The same key again is still the idempotent first result. **Exactly which paths may omit `ofKey`**: only the monolith's (`monolith` / `pooja-api`)
     operator **goodwill refund on a call** (`POST /api/admin/calls/:id/refund`), which has many per-minute debits behind it and sends an explicit non-empty `reason` with `refType: call` (the monolith bounds it itself:
     `coinsRefunded <= coinsCharged`); anything else without `ofKey` - orders, calls, a missing reason, another refType - is 400 `ofkey_required`. The monolith sends `ofKey` everywhere it can (booking / chadhava cancel and failed save, call
     connect-failure refund `call:<id>:refund:<n>` of `call:<id>:min:<n>`), so mixed modes work. **(Phase 6)** the goodwill path moved with calls, narrowed: the calls service issues goodwill refunds WITH `ofKey` (one refund per minute's debit), and the wallet accepts the `reason` exemption from `calls` only for the monolith's own key shape `call:<id>:goodwill:<requestId>` (to finish a refund the monolith queued before the cut-over); see phase 6.
   - **Prices come from catalog**: `lib/catalog.js` (port of the monolith's client, `iss orders`): the priced snapshot is read fresh for each purchase, never cached, **fails closed** (`503 catalog_unavailable` BEFORE any intent or coin; an
     unreadable 200 counts as unavailable too); the total is computed in orders and a client price is ignored; the one non-critical read (does the pooja exist, for the review list) is cached 15 s and degrades to "assume yes". Bookings and
     orders copy titles / package and item names / prices, temple name and place when bought, so a later catalog edit never rewrites history (tested).
   - **Identity and push**: a review is published under the first name from the signed token's `ctx.name`, else the identity directory, else the typed name, else "Devotee". The admin `who` column comes from identity's directory
     (cached 15 s, absent when identity is down). Booking-status / chadhava-offered pushes go identity (device id) -> engagement (push token) -> Expo, best effort, never awaited, never throwing into the operator's request.
   - **Reads flowing the other way**: the monolith's calls / astrologer code does not use bookings (checked by grep), so the monolith needs nothing from orders (no orders-client). Catalog gets booking counts / rating aggregates from
     `GET /internal/orders/pooja-stats` (30 s cache, failure = count 0 / no rating) - now answered by orders.
   - **Cutover**: `node tools/split-db.mjs --source <uri>/<monolith db> --service orders --dry-run`, then for real, **then** start orders, then set `ORDERS_URL` everywhere (catalog's too). Unfinished (`pending`) intents cross as they are and
     orders' sweeper resolves them against the wallet after it starts; the monolith's sweeper ignores booking / chadhava intents once `ORDERS_URL` is set.
   - **Degraded mode summary**: orders down -> bookings / chadhava orders / cancels / reviews 503 `orders_unavailable` (the review list stale for an hour, `x-degraded: orders`), catalog shows no counts or ratings, `/api/health` stays 200 with
     `degraded:["orders"]`, `/health/deps` 503, dashboard bookings screens 502; wallet down -> purchases and cancels 503 `wallet_unavailable` (intents wait for the sweeper); catalog down -> purchases 503 `catalog_unavailable` before a coin moves.
   - **Deviations from the plan above**: (1) the saga is intent-then-debit-then-write, not the section-4 "pending order then confirm" (kept from phase 4: the order row only exists once paid). (2) Orders reads no setting today, so it holds no settings client;
     its engagement edge is the push token only. (3) `POST /api/chadhava` (410) is served by both BFFs without a session (found by `scripts/smoke.mjs`, which asserts it through each). (4) The reviews "edit" in the brief is the operator's text moderation
     (`PUT /api/admin/reviews/:id`), which is what the monolith always had - a devotee never edits a review. (5) The orders sweep cadence and retention are configurable (`SWEEP_EVERY_MS`, `INTENT_*`, `PRUNE_EVERY_MS`), defaults = the phase-4 values.
   - **Known limits**: a booking row with no `requestId` (cannot be created by this code, only by hand) cannot be cancelled with a refund - the wallet requires `ofKey`; the orders review-list `poojaExists` answer is per-instance.
6. **calls**: astrologers, calls, payouts.
   **STATUS: built and verified locally (plain Node, not Docker).** Switch: `CALLS_URL` (+ `INTERNAL_JWT_SECRET`) on the monolith, both BFFs **and identity**; unset = phase 5 exactly (the monolith owns astrologers, calls with their billing
   ticker and audio provider, earnings and payouts, and answers identity's claim endpoints), set = the calls service owns them (db `calls`: `astrologers`, `callsessions`, `astrologerearnings`, `payouts`, `callintents`), the BFFs serve the routes and
   the monolith answers **404** for `GET /api/astrologers[/:id]`, `/api/astrologer/me/*`, `/api/calls*`, `/api/admin/astrologers|calls|payouts` and for its internal `POST /internal/astrologers/claim` / `GET .../active`. It stops seeding the three modules
   and **stops its billing ticker** (the calls service runs it); it no longer reads `RTC_PROVIDER` / `AGORA_*` (they are the calls service's `config.js`, resolved exactly as before). Rollback = unset it everywhere (what calls recorded meanwhile is NOT copied back).
   The monolith **refuses to boot** with `CALLS_URL` but not `WALLET_URL`, `IDENTITY_URL` and `ENGAGEMENT_URL`; the calls service requires those three; the mobile BFF requires `IDENTITY_URL`. (A monolith with `CALLS_URL` but no `ORDERS_URL` keeps a small
   job that sweeps the booking / chadhava saga intents, since the ticker that used to run the sweep is gone.)
   - **Who calls what** (`lib/perms.js`): devotee / astrologer routes - `mobile-bff` only (uid = signed `sub`, profile name = `ctx.name`); operator routes - `admin-bff` only, behind the area gate (areas `astrologers`, `calls`, `payouts`; re-checked in calls from
     the signed perms; `operator/access-parity.test.mjs` checks every table entry against the monolith's `access/routes.js` and that the tables cover exactly the routes the monolith's three modules register); the public list - either BFF;
     `/directory/astrologers/claim|active` - **identity only**. The tables are `packages/common/src/calls-routes.js`; the BFF side is `calls-mount.js` (placing / answering a call gets a 15 s timeout, `CALLS_TIMEOUT_MS`; every status and body is relayed
     unchanged; calls unreachable = `503 calls_unavailable`, the code the app already maps to "calls are unavailable"; no stale copy of the public list - presence is soft state).
   - **`requireAstrologer` is a check inside the calls service** on the verified uid against ITS astrologers (`status: active`). Nothing a client sends, and not the signed token's `role`, grants it (tested: a token claiming `astrologer` for a stranger is a 403).
   - **Money, as built**: coins move only through the wallet (`lib/wallet.js`, `iss calls`, 5 s, fail closed). Request = a balance gate (`503 wallet_unavailable` if unknown). Accept bills minute 1 with `call:<id>:min:1`; the ticker bills each started minute with
     `call:<id>:min:<n>`, the SAME key on every retry, and `nextBillAt` only advances after the wallet answered. A wallet that cannot answer (down, frozen, a lost answer) leaves the call **connected and unbilled** - never ended on a guess, never billed
     twice - and the minute is billed once it can (tested by killing, freezing and losing answers). Before any coin moves the payout rate is read (a billed minute is always earned). Connect-failure refunds, and goodwill refunds, are durable intents
     (`callintents`, written first) re-sent by a sweeper with the same key; terminal intents are pruned after 30 days, pending ones never. A crash between "ended `failed`" and "refunded" is healed by the ticker (only for calls whose refund intents were never written).
   - **Refunds name their debit (`ofKey`) - the phase-5 exemption, migrated.** Connect failures send `ofKey` = `call:<id>:min:<n>`. A **goodwill refund** used to be ONE refund with no `ofKey` under the wallet's single exemption (`reason` + refType `call`, from the
     monolith). The calls service now pays it **per minute**: the amount is taken from the call's not-yet-refunded minutes (lowest first, each part at most that minute's charge) and each part is `call:<id>:gw:<requestId>:<minute>` with `ofKey` =
     `call:<id>:min:<minute>`; the reservation on the call (`coinsRefunded <= coinsCharged`, the minutes claimed in the same write) is what keeps two operators from taking the same minute; every part's intent is written before the first is sent. **The one behavioural
     consequence**: the wallet lets a debit be refunded once, so a minute that has had a partial goodwill refund cannot take another; a request that fits under the charge but not in the unrefunded minutes answers `409 refund_minutes_used` (new code) instead of 200
     (example: a 2-minute call at 10 coins/min, 4 refunded from minute 1, then 16 more: the monolith paid it, the service cannot, as minute 1 is already refunded). **What the wallet still exempts**: the `reason` path, from the monolith (unchanged while `CALLS_URL` is
     unset) and from `calls` ONLY for the key shape `call:<id>:goodwill:<requestId>` - the monolith's own - so a goodwill refund queued before the cut-over still completes under its own key (a different key would double-refund if the first send had landed). The calls service's
     own refunds never use it. "Exemption only for a call with no debit": a call that charged nothing has nothing to refund (`refund_exceeds_charge`, tested), so no new refund needs it.
   - **Settings fail closed** (`lib/settings.js`, read fresh from engagement, 15 s cache): `minMinutes` (the gate), `callsEnabled` (the kill switch), `defaultSharePct` (an astrologer created without a share) and `payoutPaisePerCoin` (what a minute earns) answer
     `503 settings_unavailable` when engagement cannot answer, instead of the monolith's "use the default" (a booking or a ticker minute is **deferred**, not guessed). `ringTimeoutSec` is a timing rule that moves no money: last known value of any age, else 25.
   - **Presence and real time, unchanged**: presence is soft state (45 s), a poll counts as "still here", silence ends a call after `SILENCE_MS` (90 s; `failed` + refund if the first minute was charged and the party never pinged, else `completed`, measured from the later of the last
     ping and this instance's start), ring timeout from the settings. The ticker is **single-flight per instance** and **safe beside another instance** on the same database (atomic conditional updates, the unique `(callId, minute)` earning row - a collision on it
     is swallowed - and idempotent debit keys): 6 calls x 7 minutes raced by two instances were charged and earned exactly once each.
   - **Payouts** are bookkeeping rows only (the wallet is never called - verified). "Two simultaneous payouts cannot both fit" was an in-memory chain in the monolith (one process); it is now a **lease on the astrologer's row** (`payoutLock`, 10 s, taken with one conditional
     update), so it holds across instances (8 payouts split over two instances: exactly one recorded).
   - **A bug found in the monolith's model and fixed only here**: its unique index `{ devoteeLive: 1 }` (partial on `true`) makes `true` unique across ALL devotees, so **only one call can be live on the whole platform at a time** (a second devotee's request is `409
     already_in_call` - seen in the phase-5 stack). The service's index is `{ devoteeUid: 1, devoteeLive: 1 }`, which is what the model's own comment says. The monolith is left alone (rollback target "exactly as today"); drop its `devoteeLive_1` index by hand if you
     stay on the monolith and want concurrent calls. This is the one place the service is more permissive than the monolith.
   - **Identity**: sign-in claim and role re-derivation call `CALLS_URL`'s `/internal/calls/directory/astrologers/claim|active` (same request / response shapes as the monolith's, `iss identity`); `CALLS_URL` unset = the monolith's endpoints, as before. Roles are written back to identity by calls
     (`PUT /internal/identity/directory/users/:uid/role`, best effort, logged on failure and re-derived at the next sign-in). A devotee's name on a call is the signed token's `ctx.name`, else the identity directory, else blank (the monolith took the token's name even when blank).
   - **Cutover**: with no call live (switch `callsEnabled` off, wait for an empty live list), `node tools/split-db.mjs --source <uri>/<monolith db> --service calls --dry-run`, then for real, **then** start calls, then set `CALLS_URL` everywhere (identity too), then switch calls back on. Pending call-refund intents cross as
     they are and the service's sweeper resolves them (a legacy `call:<id>:refund:<n>` is upgraded with `ofKey` = `call:<id>:min:<n>`; a goodwill one is re-sent with its reason under its own key).
   - **Degraded mode summary**: calls down -> every call / astrologer route 503 `calls_unavailable`, the dashboard's astrologer / call / payout screens 502, `/api/health` stays 200 with `degraded:["calls"]`, `/health/deps` 503; wallet down -> new calls refused 503
     `wallet_unavailable`, live calls stay connected and are billed later; identity down -> authenticated devotee routes 503 `auth unavailable` (BFF, fail closed), the public list still answers, the dashboard 503 `identity_unavailable`; engagement down -> new calls 503 `settings_unavailable`, running calls' minutes deferred.
   - **What is left in the monolith with every `*_URL` set** (probed route by route on a running stack): only `GET /api/health` (its own liveness and the BFFs' readiness probe) - plus the proxy target the BFFs still fall back to (every other path 404s). Its database is empty and it seeds nothing.
     It is now a shell. Phase 7 **keeps** it (rollback + the BFFs' readiness probe); a later, separate change can delete it together with the BFFs' `MONOLITH_URL` proxy and probe.
   - **Deviations from the plan above**: (1) the ticker lives in the service with the money (the plan's "calls service debits per started minute" is unchanged; what moved is who runs the sweeper). (2) Goodwill refunds are per minute (above). (3) Settings fail closed. (4) The devotee index fix. (5) A blank
     name in the token falls back to the directory. (6) Public astrologer GETs are not served stale.
   - **Known limits**: a debit whose answer was lost, for a call that is then ended (`completed` / `failed`) before the ticker re-asks, is not recorded on the call row (identical to the monolith; the wallet row exists and is findable by key). The monolith's `User.role` copy of
     `astrologer` is re-derived at sign-in, not rewritten on a missed best-effort write. Presence needs a heartbeat or a poll: the astrologer app only heartbeats while foregrounded - *except* for an astrologer with a push-registered phone, see **Push notifications** below.
7. **Deployment, CI and the cutover runbook** (done) - and the monolith is **deliberately kept**.
   **STATUS: written and verified locally (plain Node, throwaway MongoDB); not run on Render, Docker, GitHub Actions or Atlas.**
   - `backend/render.yaml`: ONE Blueprint for all eight (the repo's other two are split by lifecycle - a static site that gets recreated; these eight are all Node
     with one lifecycle and have to be wired to each other, and `fromService` only resolves inside one file, which is also what `pooja-api/render.yaml` warns about).
     Six private services (`type: pserv`, paid, no public URL) + the two public BFFs, `autoDeploy: false`, region `singapore` (with the monolith), `npm ci --omit=dev
     --ignore-scripts` at `backend/`, `node <dir>/src/server.js`, a `bhakti-shared` env group for `INTERNAL_JWT_SECRET` / `ADMIN_SESSION_SECRET`. BFF health check `/api/health`
     (a `pserv` cannot be health-checked from outside). `scripts/check-render-stack.rb` cross-checks the file against every `config.js` (a REQUIRED variable that is missing, an
     unresolved `fromService`, `autoDeploy`, mock providers, wildcard CORS) and runs in CI.
   - **Bare hosts.** Render hands `fromService` over as `host:port`, not a URL. `serviceUrl()` (`@bhakti/common`) is now the URL parser of every service and BFF `config.js`
     (no dot / localhost / IPv4 -> `http://`, a public name -> `https://`, a full URL untouched, empty stays "not set"); unit-tested, and the whole stack was booted with bare `127.0.0.1:port` values.
     The **monolith's** own `*_URL` parsers were left alone (no scheme is added there): type full `http://` values on `pooja-api`.
   - CI: `backend` (lockfile guard `npm ci --dry-run`, install, `npm test`), `stack` (`backend/tools/stack.sh` boots the whole stack with the blueprint's start commands and no `.env`, development
     AND `NODE_ENV=production` configurations, `scripts/smoke.mjs` through both BFFs, the media round trip), and `deploy-microservices` (hooks `RENDER_DEPLOY_HOOK_<SERVICE>`, only on a green
     `main` and only when the repo variable `DEPLOY_MICROSERVICES` is `true`; polls both BFFs for the pushed SHA, `/health/deps`, `degraded`, smoke). The monolith deploy job is unchanged.
   - `docs/MICROSERVICES_CUTOVER.md` is the owner's runbook (backup, data copy, deploy order, per-phase switch and rollback, Razorpay / Firebase / Agora / Expo, client rebuilds, "do not do yet").
   - **Why the monolith is kept**: both BFFs probe its `/api/health` for readiness and it is the rollback for every phase. Deleting it means removing `MONOLITH_URL`/the probe from the BFFs, a separate change.
   - Hardening: **one** list of money-moving settings (`MONEY_SETTING_KEYS` in `@bhakti/common`, used by engagement; `tools/money-keys-parity.test.mjs` fails if the wallet's `RULES` or the
     monolith's `RULE_KEYS` drift - the monolith cannot import a workspace package). The three `coin-pack.js` copies' parity test passes. The monolith's **one-live-call-platform-wide** index bug
     (unique `{devoteeLive:1}`) is fixed there too (compound index + boot migration dropping `devoteeLive_1`, `call-index.test.mjs`); it takes effect when the monolith is redeployed.

### Phase status

| Phase | What | Status |
|---|---|---|
| 0 | `@bhakti/common`, both BFFs as gateways in front of the monolith | done |
| 1 | engagement | done |
| 2 | identity | done |
| 3 | catalog | done |
| 4 | wallet | done |
| 5 | orders | done |
| 6 | calls | done |
| 7 | Render Blueprint, CI, cutover runbook, housekeeping (monolith kept) | done |

### What was verified, and what was not

Verified (plain Node processes, throwaway `mongod`, never Atlas): the backend workspace suites (824 tests, 0 failing, under Node 25 and Node 20.19.4) and the monolith's (386, one file at a time); the whole stack booted with the
Blueprint's start commands (no `.env`, clean environment, every `*_URL` set, bare `host:port` addresses too) in development and in `NODE_ENV=production` configuration; `scripts/smoke.mjs` through the
mobile BFF (89 PASS, no password) and the admin BFF (126 PASS, with the first admin from `ADMIN_PASSWORD`), 0 FAIL in both configurations; the media round trip through the admin BFF into
catalog's GridFS; `/health/deps` all green; the workflow file with `actionlint` 1.7.12; `backend/render.yaml` parsed (Ruby YAML) and cross-checked by `check-render-stack.rb`.

**Not verified**: Docker (`docker-compose.yml` and every `Dockerfile` have never been built); Render itself (the Blueprint has never been synced - field names such as `fromService.property: hostport`,
`fromGroup`, `generateValue` in a group and `pserv` health checks are from the docs, not from a successful sync; private-service reachability from the free-plan monolith is assumed); GitHub Actions
(the jobs were reproduced step by step locally, never run by GitHub); real Firebase (the authed devotee path is covered by fixture verifiers, no real ID token was verified), Razorpay (mock provider only),
Agora (mock only), Expo push; an Atlas cutover (`split-db` against Atlas, the 512 MB budget); more than one instance of any service on Render (two instances against one database were tested locally
for the calls ticker and the sagas); real devices (the app was not pointed at the BFFs); cold-start behaviour on Render free instances.

Steps 1–6 each include: the service, its tests, the BFF routes, the DB split for its collections, removal of the
corresponding monolith module.

## 9. Known costs (read before deploying to Render)

- **Identity is now on the critical path of every authenticated request** (phase 2). The mobile BFF asks it "is this uid
  blocked?" once per uid per 10 s, so a block made in the dashboard bites within 10 s (the dashboard also revokes the Firebase
  refresh tokens), and when identity is down every authenticated devotee request answers 503 `auth unavailable` (fail closed)
  while public routes (content, flags, panchang, poojas, ...) keep working. The admin BFF re-reads the operator record at most
  every 5 s (immediately after an operator write made through the same instance), so a demotion through *another* admin-bff
  instance can reach a session 5 s late; identity down = 503 `identity_unavailable` for the dashboard (never a sign-out).
- **The login throttle is per admin-bff instance** (in memory), as it was per monolith instance: several instances loosen it.

- **Free plan:** each of the 8 web services sleeps after 15 min idle; a cold request can chain several wake-ups.
  Production should use paid instances, or at least keep the two BFFs and wallet/catalog warm.
- **Latency and failure modes** go up: every devotee request becomes 1–3 internal hops. The shared client's timeout,
  retry and circuit breaker, plus degrade-to-absent for the optional `catalog ⇄ orders` lookups, exist for this.
- **Operational load** goes up: 8 deployables, 8 `.env` sets, 8 health checks. Docker Compose and one blueprint set are
  how that is kept manageable.
- **Webhook URL (Razorpay)** must keep pointing at the BFF; do not point it at the wallet service.
- **Money (phase 7):** the Blueprint needs six private services (no free plan) and two BFFs: eight paid instances, plus the monolith, which stays. Atlas free is 512 MB for the original data AND the
  copy until the old collections are dropped. See `docs/MICROSERVICES_CUTOVER.md` for the free-plan variant and what it gives up (the network boundary).

## 10. Push notifications (background push, Firebase Cloud Messaging)

Goal: an astrologer whose app is in the background or closed gets an "Incoming call" notification and can still be called. Built in the **microservices only** (the
monolith is untouched and has no FCM).

```
phone ──POST /api/push/register {token, platform}──► mobile-bff ──(signed sub = uid)──► identity  push registry (db identity, collection `pushdevices`)
calls  ──POST push/send {uid, title, body, data, channelId, ttlSeconds, tag}──► identity ──► FCM ──► the phone(s)
orders ──(same, channel `default`)──────────────────► identity
calls  ──GET push/reachable?uid=──► identity          (is there a phone to push to?)
```

* **identity owns the registry and the FCM edge**, because it already holds the Firebase service account (nobody else gets it). `PushDevice {uid, token (unique), platform, lastSeenAt}`: one
  account has several phones (at most 10, oldest dropped), one token belongs to ONE account (a shared phone's token moves to the next account that registers it; sign-out `DELETE` removes only
  your own row). The account is the verified service-JWT `sub`, never the body. `POST /internal/identity/push/send` and `GET .../reachable` accept only the issuers `calls`, `orders`, `engagement`
  (403 otherwise); register / unregister only `mobile-bff`. `send` never throws into its caller (always `{sent, devices}`), sends an Android **high-priority** message with a **notification
  payload** (so the OS shows it with the app closed), string-only `data`, a TTL, a collapse tag and the Android channel id; a token FCM reports as unregistered / invalid is deleted.
  These are service-to-service routes: they are in no dashboard route table or area map.
* **mobile-bff**: `POST /api/push/register {token, platform}` -> 201 `{ok:true}`, 400 `{error, code:'bad_token'}` for a missing / blank / over-4096 token; `DELETE` -> 200. Both need the devotee /
  astrologer auth edge (401 without a valid Firebase token). The path is **shared with the older anonymous Expo registration** (`{deviceId, pushToken}`, engagement; public in the monolith's
  allowlist, so both BFFs serve it): a request with no `Authorization` header and a `deviceId` / `pushToken` body still goes to engagement exactly as before; anything else is the FCM contract.
  The admin BFF answers 404 to the FCM contract (any DELETE, or anything with an `Authorization` header) and leaves the old anonymous POST alone.
* **Incoming call** (calls -> identity `push/send`): title `Incoming call`, body `<first name> is calling` (else `A devotee is calling`), data `{type:'incoming_call', callId}`, channel
  `incoming-calls`, TTL 30 s (a call that rang 30 s ago is already missed), collapse tag `incoming_call`. Fire-and-forget: it never delays or fails the call request, and the old Expo path still runs
  beside it (harmless when no Expo token exists). **Booking status** pushes (orders) take the same road on channel `default`.
* **The presence rule, and why.** The astrologer app only heartbeats while it is open, and presence used to read `offline` 45 s after the last heartbeat - so an astrologer who put the app
  in the background simply could not be called, and a push would have had nobody to ring. `Astrologer.pushReachable` (calls db, default false) changes `effectivePresence`: *busy stays busy; a
  deliberate offline always wins; `online` is online if the heartbeat is younger than 45 s, **or** if `pushReachable` and it is younger than 4 h* (`PUSH_REACHABLE_MS`). The flag is set from
  identity's `reachable` when the astrologer goes Online and on **every heartbeat** (answer cached ~60 s per uid; if identity cannot answer, the previous value is kept, never flipped). The public
  list, the call-request availability check and the astrologer's own `/astrologer/me` use the same function. The 4 h bound exists so a phone that died or lost its network is not listed as available
  all day; opening the app refreshes it. `calls/src/parity.test.mjs` names `pushReachable` as the one deliberate difference from the monolith's astrologer model.
* **Not done**: no full-screen ringing UI (the call arrives as a heads-up notification on the `incoming-calls` channel; the astrologer taps it to open the app, which then polls and shows the
  existing incoming-call screen); default notification sound only (no looping ringtone); **iOS is not wired** (no APNs key / entitlement; `platform: 'ios'` is stored but nothing is verified);
  no per-device mute; a devotee call placed to an astrologer whose phone is offline still rings for the usual ring timeout and is then missed. If an astrologer signs out of the app while Online without
  going Offline first, they stay listed (up to 4 h) with no phone to ring until the next heartbeat re-reads the registry - the app should go Offline before sign-out.
* **Verified**: with a fake FCM sender (identity, calls, orders and both BFFs under test; an end-to-end run on a throwaway stack). **Not verified**: real FCM delivery to a real phone.

