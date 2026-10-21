# Bhakti backend (microservices migration, phases 0-7 complete)

Plan and architecture contract: [`../docs/MICROSERVICES.md`](../docs/MICROSERVICES.md). This folder is the
foundation (rollout step 0): the shared package and two BFFs that are **thin gateways in front of the
existing monolith** (`../pooja-api`, untouched). The public contract the phone app and dashboard see is
unchanged; later phases move modules out of the monolith behind the same BFFs.

```
backend/
  packages/common   @bhakti/common  service JWT, service HTTP client (timeout/retry/breaker), express helpers,
                                    logger, loadEnv, CORS policy, streaming proxy
  services/engagement  flags, analytics, announcements, settings (default :4030, db `engagement`)  [phase 1]
  services/identity    devotee accounts + auth sync, operators/roles/audit log, policies (default :4040, db `identity`)  [phase 2]
  services/catalog     content, Home layout, live darshan, pooja + chadhava definitions, panchang, horoscope, GridFS media (default :4050, db `catalog`)  [phase 3]
  services/wallet      coin balances + the append-only ledger, coin packs, coin purchases (Razorpay / mock), the payment webhook (default :4060, db `wallet`)  [phase 4]
  services/orders      pooja bookings, chadhava orders, pooja reviews + the money saga over the wallet (default :4070, db `orders`)  [phase 5]
  services/calls       astrologers, voice calls with per-minute billing over the wallet, earnings + payouts, the audio provider (default :4080, db `calls`)  [phase 6]
  bff/mobile        phone-app gateway   (default :4010)
  bff/admin         dashboard gateway   (default :4020)
  tools/dev-all.mjs one-command local stack
  tools/stack.sh    boot the whole stack with the Render blueprint's start commands, no .env (CI + cutover rehearsal)
  render.yaml       the Render Blueprint: 6 private services + 2 public BFFs (docs/MICROSERVICES_CUTOVER.md)
  tools/split-db.mjs  idempotent copy-only DB split (engagement, identity, catalog, wallet, orders and calls entries implemented)
  docker-compose.yml, services/*/Dockerfile, bff/*/Dockerfile, docker/monolith.Dockerfile   (NOT verified, see below)
```

## Run

Node >= 20.19.4 (`PATH=/opt/homebrew/bin:$PATH` on this machine).

```bash
cd backend && npm install
npm run dev:all        # engagement :4030 + identity :4040 + catalog :4050 + wallet :4060 + orders :4070 + calls :4080 + monolith :4100 (from ../pooja-api) + mobile-bff :4010 + admin-bff :4020
                       # USE_ENGAGEMENT=0 / USE_IDENTITY=0 / USE_CATALOG=0 leave that service out (the monolith keeps its data;
                       # the catalog needs engagement and identity, so USE_CATALOG=1 with either off is refused;
                       # USE_WALLET=0 leaves the wallet out - it needs engagement and identity too;
                       # USE_ORDERS=0 leaves orders out - it needs engagement, identity, catalog and wallet;
                       # USE_CALLS=0 leaves calls out - it needs engagement, identity and wallet)
TEST_MONGODB_URI=mongodb://127.0.0.1:27141/x npm test   # needs a local mongod (engagement + split-db tests)
```
`dev:all` runs the monolith with whatever `pooja-api/.env` says (including its `MONGODB_URI`, which may be
Atlas) - set `MONGODB_URI` in your shell to use a throwaway database. Override ports with `MONOLITH_PORT`,
`MOBILE_BFF_PORT`, `ADMIN_BFF_PORT`. Ctrl-C stops all three.

Run one BFF alone: `cd bff/mobile && cp .env.example .env && npm start`.

## Environment (each BFF: `.env.example`, read only in `src/config.js`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 4010 mobile / 4020 admin | listen port |
| `MONOLITH_URL` | `http://127.0.0.1:4000` | upstream monolith (a bare host is accepted: `serviceUrl()` adds the scheme) |
| `CORS_ORIGIN` | `*` | dashboard origin(s), comma-separated; **never `*` in production** (credentials are then refused) |
| `PROXY_TIMEOUT_MS` | 30000 | idle timeout on an upstream request (504 `upstream_timeout`) |
| `ENGAGEMENT_URL` | unset | engagement service; unset = phase-0 pure gateway (then no secret needed) |
| `IDENTITY_URL` | unset | identity service; unset = phase-1 behaviour (the monolith authenticates). Set = the BFFs authenticate (below) |
| `CATALOG_URL` | unset | catalog service; unset = the monolith serves content / Home / live / poojas / chadhava listings / panchang / horoscope / media. Set = the BFFs do, from catalog (needs `ENGAGEMENT_URL`; the mobile BFF also needs `IDENTITY_URL`) |
| `WALLET_URL` | unset | wallet service; unset = the monolith owns wallets, the coin ledger, packs and purchases and talks to Razorpay. Set = the BFFs serve `/api/wallet*`, `/api/coins/packs`, the Razorpay webhook and the dashboard's coin/wallet/billing-rule routes from it (the mobile BFF also needs `IDENTITY_URL`) |
| `ORDERS_URL` | unset | orders service; unset = the monolith owns pooja bookings, chadhava orders, reviews and the money saga around them. Set = the BFFs serve `/api/bookings*`, `/api/chadhava/orders*`, `POST /api/chadhava` (410), `/api/poojas/:slug/reviews` and the dashboard's bookings / reviews / chadhava-orders screens from it (the mobile BFF also needs `IDENTITY_URL`; the monolith additionally needs `CATALOG_URL`, `WALLET_URL`, `IDENTITY_URL`, `ENGAGEMENT_URL` and refuses to boot without them) |
| `ORDERS_TIMEOUT_MS` | 15000 | both BFFs: how long a purchase (booking / chadhava order / cancel) may take through orders |
| `CALLS_URL` | unset | calls service; unset = the monolith owns astrologers, calls (with the billing ticker and the audio provider) and payouts. Set = the BFFs serve `/api/astrologers*`, `/api/astrologer/me/*`, `/api/calls*` and the dashboard's astrologers / calls / payouts screens from it; **identity** asks it (not the monolith) for the sign-in claim (`CALLS_URL` on identity); the monolith additionally needs `WALLET_URL`, `IDENTITY_URL`, `ENGAGEMENT_URL` and refuses to boot without them; the mobile BFF also needs `IDENTITY_URL` |
| `CALLS_TIMEOUT_MS` | 15000 | both BFFs: how long placing / answering a call may take through calls |
| `INTERNAL_JWT_SECRET` | - | >= 16 chars; required when `ENGAGEMENT_URL`, `IDENTITY_URL`, `CATALOG_URL`, `WALLET_URL`, `ORDERS_URL` or `CALLS_URL` is set |
| `ADMIN_SESSION_SECRET` | random per boot | admin BFF, with `IDENTITY_URL`: signs the operator cookie (use the SAME value on the monolith, which derives the devotee pseudonyms from it) |
| `SESSION_SAMESITE` | `Strict` | admin BFF, with `IDENTITY_URL`: `Strict`/`Lax`/`None` (`None` forces `Secure`; needs HTTPS and `CORS_ORIGIN` = the dashboard's exact URL) |
| `FIREBASE_PROJECT_ID` / `FIREBASE_SERVICE_ACCOUNT[_PATH]` | - | mobile BFF, with `IDENTITY_URL`: verifies Firebase ID tokens (the project id alone is enough; same project as the app's `google-services.json`) |
| `SERVICE_TIMEOUT_MS` | 5000 | per call to a service |
| `NODE_ENV` | - | `production` enables `trust proxy` and the CORS credential rule |
| `RENDER_GIT_COMMIT` / `GIT_COMMIT` | - | reported as `commit` by `/api/health` |

`INTERNAL_JWT_SECRET` is used from phase 1 on (see the table).
Session-cookie settings (`SESSION_SAMESITE`, `ADMIN_SESSION_SECRET`) stay **on the monolith** until `IDENTITY_URL` is set (phase 0/1: the admin BFF passes `Set-Cookie` through untouched); with it set the admin BFF owns them.

## Behaviour

- `/api/*` and `/uploads/*` are streamed to the monolith unchanged (body, query, method, status, Range/206, ETag,
  Cache-Control, Content-Type, multiple `Set-Cookie`, `Authorization`, `Cookie`). The BFF's CORS middleware answers
  preflights and replaces the upstream's `Access-Control-*` headers (same policy as `pooja-api/src/config/cors.js`).
- `GET /api/health`: monolith-shaped (`ok`, `uptime`, `commit`), 503 until the monolith's `/api/health` is 200.
  `GET /health` and `/health/deps` are extra ops endpoints.
- Monolith unreachable: 502 `{"error":"upstream_unavailable","code":"upstream_unavailable"}`; timeout: 504 `upstream_timeout`.
- No `GET /` handler, as in the monolith.
- The BFF sets `X-Forwarded-For` to the client address it saw (overwriting any client value) so the monolith's login throttle keeps working
  (set `NODE_ENV=production` on both so each trusts one proxy hop).

## Pointing clients at the BFFs

- **Dashboard (dev)**: `pooja-admin/.env` -> `API_ORIGIN=http://127.0.0.1:4020`, restart `npm run dev`.
  **Dashboard (build)**: `VITE_API_BASE=https://<admin-bff-host>` (baked in; rebuild), and set `CORS_ORIGIN` on the admin BFF to the dashboard URL
  and `SESSION_SAMESITE=None` on the monolith.
- **App**: `poojaappclone/.env` -> `EXPO_PUBLIC_API_URL=http://127.0.0.1:4010` (USB: `adb reverse tcp:4010 tcp:4010`), restart Metro.

## Phase 1: the engagement service

Owns flags, analytics (visitors/events + the two public ingest routes + push token registration), announcements
(+ Expo push fan-out) and the `settings` key/value table, in its own database `engagement`
(`MONGODB_URI` base + `DB_NAME`). Routes live under `/internal/engagement/...` and need a service JWT
(`INTERNAL_JWT_SECRET`, `ALLOWED_ISSUERS`); `/health` is 503 until the DB is connected and seeded. Variables: `services/engagement/.env.example`.
Tests: `cd services/engagement && TEST_MONGODB_URI=... npm test`.

**Switch.** Everything is controlled by `ENGAGEMENT_URL` (+ `INTERNAL_JWT_SECRET`) on the monolith and on both BFFs.
Unset = exactly phase 0 (the monolith owns the data and serves the routes). Set = the monolith retires those routes
(404), reads settings/announcement through `src/lib/engagement-client.js` (5 s timeout, 15 s cache, stale-on-error,
bundled defaults), and the BFFs serve them. **Rollback = unset the variable** (the monolith's own collections are never deleted; data written to
engagement while it was on stays there, so split back by hand if you need it).

**Cutover.** Run `node tools/split-db.mjs --source mongodb://.../bhakti --dry-run`, then without `--dry-run`, then start the stack with the variable set.
Insert-only and idempotent; `--overwrite` refreshes existing ids.

**BFF behaviour.** Both BFFs serve the public routes (`/api/flags`, `/api/announcements`, `/api/ingest/session|screen`, `/api/push/register`) and the
operator routes (`/api/flags/full`, `/api/flags/:key`, `/api/analytics/*`, `/api/visitors`, `/api/content/settings*`, `/api/content/announcements*`,
`/api/admin/announcements/:id/push`); the list is `ENGAGEMENT_ADMIN_ROUTES` in `packages/common/src/operator/engagement-routes.js` and a test fails if a
route has no area. Operator auth is TRANSITIONAL: the monolith still issues the cookie, so the BFF asks `GET /api/admin/session` (cached 30 s per cookie hash), applies the copied area gate
(`packages/common/src/operator/access/*`, parity-tested against `pooja-api/src/access`), and calls engagement with a JWT carrying the operator's role and permissions
(engagement re-checks: an editor cannot touch money setting rows; push tokens are hidden below `overview:edit`). Audit entries for those writes go to the monolith's `POST /internal/audit`.
Degraded mode when engagement is down: `/api/flags` = documented defaults (200), `/api/announcements` = `[]`, ingest/register = 503 `engagement_unavailable`, `/api/content` keeps the last good settings/announcement;
operator routes answer 502; `/api/health` stays 200 with `degraded:["engagement"]`, `/health/deps` is 503.

## Phase 2: the identity service

Owns devotee accounts (`POST /api/auth/sync`, profile, saved temples, blocking), dashboard operators (credentials, roles, the
lockout refusals), the audit log, and policies with their acceptances, in its own database `identity` (collections `users`,
`operators`, `auditlogs`, `policies`; acceptances are `users.acceptedPolicies`). Routes live under `/internal/identity/...`, need a
service JWT, and each route family accepts ONE caller: devotee routes `mobile-bff`, operator routes `admin-bff`, the `directory/*`
lookups the other services. `/health` is 503 until seeded (default policy; first admin from `ADMIN_USERNAME`/`ADMIN_PASSWORD` when the
operators collection is EMPTY - production refuses to run with none). Variables: `services/identity/.env.example`.
Tests: `cd services/identity && TEST_MONGODB_URI=... npm test`.

**Switch.** `IDENTITY_URL` (+ `INTERNAL_JWT_SECRET`) on the monolith AND both BFFs. Unset = phase 1 exactly. Set:

| Concern | Who does it now |
|---|---|
| Verify the Firebase ID token, 401/403/503 as `require-auth.js` did, project-mismatch log | **mobile-bff** (`firebase-admin`, project id is enough). Blocked check = identity, per request, 10 s cache, **fail closed** (503 `auth unavailable`) |
| Sign the devotee into the monolith | mobile-bff signs `{iss mobile-bff, sub uid, ctx name/role}`; the monolith trusts only that, only from `mobile-bff` (`lib/trusted-claims.js`). A raw Firebase token sent to the monolith is refused |
| Operator cookie, login throttle (10/user, 40/client per 15 min -> 429, password <= 256) | **admin-bff** |
| Credentials, operator CRUD, lockout refusals, audit log | identity; the admin BFF audits every successful operator write it lets through (its own routes and proxied ones) |
| Area gate | admin-bff for the routes it serves (identity, engagement); the **monolith** for its own routes, from the signed `perms` (it also serves routes that are open to the app without a session, which a path-based BFF gate cannot know) |
| Background push (FCM): the phone's token registry + the send edge | **identity** (`/internal/identity/push/{register,send,reachable}`; the BFF's `POST|DELETE /api/push/register`; `send`/`reachable` only for issuers `calls`, `orders`, `engagement`). Design, presence rule, limits: `docs/MICROSERVICES.md` section 10 |
| Revoke refresh tokens on block, delete the Firebase account on delete | **identity** (the admin BFF never holds a key that can delete accounts) |
| Astrologer invite claim at sign-in | identity -> the calls service's `POST /internal/calls/directory/astrologers/claim` when `CALLS_URL` is set (phase 6), else the monolith's `POST /internal/astrologers/claim` (issuer `identity` only either way) |
| User names / device ids / wallet search / role writes inside the monolith | `lib/user-directory.js` -> `lib/identity-client.js` (5 s timeout, 15 s cache, degrade to "absent"; wallet search = clear 503). The astrologer role write is the calls service's best-effort `PUT /internal/identity/directory/users/:uid/role` (phase 6) |

The monolith then answers 404 for `/api/auth/*`, `/api/users*`, `/api/admin/operators|audit-log|policies|login|logout|session`,
`/api/policy/*` and `/internal/audit`; the mobile BFF serves no operator route. `POST /api/users` stays 410 (now from identity).
**Rollback = unset `IDENTITY_URL` everywhere** (the monolith's own `users`/`operators` collections are never touched meanwhile, so
users created or changes made while identity was on are NOT in them: copy back by hand if that matters). Operators' cookies
signed by the monolith keep working after the switch IF `ADMIN_SESSION_SECRET` is the same value (same HMAC format, parity-tested).

**Cutover.** `node tools/split-db.mjs --source mongodb://.../bhakti --service identity --dry-run`, then without `--dry-run`, **then** start
identity (first start seeds a default policy and, if the copied operators exist, creates nothing), then switch the variable on.

**Degraded mode.** Identity down: devotee routes that need auth = 503 `auth unavailable` (never open); public routes (content, flags,
panchang, poojas, coins/packs, astrologers, live ...) keep working; `/api/health` = 200 with `degraded:["identity"]`, `/health/deps` = 503;
the dashboard = 503 `identity_unavailable` (not a sign-out, not open); an astrologer's profile = 503, a plain devotee still signs in
(the invite claim is skipped until the monolith answers).

## Phase 3: the catalog service

Owns everything a devotee reads: deities, temples, aartis, festivals, sevas, knowledge, FAQs, hero slides, reminders, tones, wallpaper styles
(`/api/content/<resource>` for the dashboard), the Home layout (`home-sections`), live darshan (streams, categories, the Jai counters, the
60 s probe job, the `Temple.liveUrl` -> stream migration), pooja and chadhava **definitions** (listings, categories, the old flat catalogue; not
their bookings/orders), panchang, horoscope and the GridFS media bucket, in its own database `catalog`. Its internal paths mirror the monolith's
`/api` paths under `/internal/catalog/...` (plus `public/content`, `pricing/*`, `media/*`) and need a service JWT; each route family accepts only its own callers
(public reads: either BFF or the monolith; operator routes: `admin-bff`; Jai: `mobile-bff`; the priced snapshot: the monolith/orders; media: the BFFs).
`/health` is 503 until seeded (every seed fills EMPTY collections only). Variables: `services/catalog/.env.example`
(`ENGAGEMENT_URL` required, `ORDERS_URL` optional, `MAX_UPLOAD_MB`, `UPLOAD_DIR`, `YOUTUBE_API_KEY`, `LIVE_PROBE`).
Tests: `cd services/catalog && TEST_MONGODB_URI=... npm test` (needs a local `mongod`).

**Switch.** `CATALOG_URL` (+ `INTERNAL_JWT_SECRET`) on the monolith AND both BFFs. Unset = phase 2 exactly. Set:

| Concern | Who does it now |
|---|---|
| `GET /api/content` (catalog bundle + engagement settings + announcement, the monolith's exact key order) | **both BFFs** (`catalog-mount.js`); last good body served with `x-degraded: catalog` for up to 60 min if catalog is down |
| horoscope, panchang, live, poojas, chadhava listings/offerings reads | both BFFs from catalog; stale-while-error per URL (60 min; live 2 min) |
| `POST /api/live/:slug/jai` | **mobile BFF** (identity edge) -> catalog, uid = signed `sub` |
| `/uploads/*` | both BFFs stream from catalog (Range, ETag, immutable, nosniff, CSP sandbox); catalog down = 503 `catalog_unavailable` |
| content CRUD, poojas, chadhava listings/categories/offerings, Home layout, live streams (+ `/check`) and categories, horoscope day editor, media delete | admin BFF: area gate -> catalog; audit through identity; `POST /api/content/upload` is gated, audited and **streamed** |
| Pricing a booking / chadhava order | the monolith, from catalog's priced snapshot **read fresh per purchase, fail closed** (503 `catalog_unavailable` before any coin moves) |
| Booking count + rating on poojas | catalog <- `GET /internal/orders/pooja-stats` (issuer `catalog` only, 30 s cache, failure = count 0 / rating hidden): answered by the orders service once it exists, else the monolith (same path, same shape) |
| Bookings, reviews, chadhava orders, `GET /api/poojas/:slug/reviews`, the `POST /api/chadhava` 410 | the monolith until `ORDERS_URL` is set (phase 5), then the orders service |

The monolith answers 404 for everything catalog owns and stops seeding it. **Rollback = unset `CATALOG_URL` everywhere** (the monolith's own
collections are never touched meanwhile, so edits made in catalog are NOT in them: copy back by hand if that matters).

**Cutover.** `node tools/split-db.mjs --source mongodb://.../bhakti --service catalog --dry-run`, then without `--dry-run` (copies the catalog collections and the GridFS bucket,
field order preserved), **then** start catalog, then set the variable. `GET /api/health` on both BFFs reports `degraded:["catalog"]` when it is down; `/health/deps` is 503.

## Phase 4: the wallet service

Owns coin balances and the append-only ledger (`wallets`, `wallettxns`), coin packs and purchases (`coinpacks`, `coinorders`), Razorpay (order creation, checkout
signature, the webhook) and the billing-rules screen (the values themselves stay in engagement), in its own database `wallet`. `wallet.service` is still the ONLY code
that changes a balance (atomic conditional update, idempotency keys, reopenable failed debits - moved unchanged, its tests came with it). Routes live under
`/internal/wallet/...`: the ledger API the order side moves coins through (`POST /debit|/refund|/credit|/reconcile`, `GET /txn?key=`, `GET /balance/:uid`; monolith / orders /
calls only), the monolith's own `/api` paths for the rest (`/wallet*` mobile-bff only, `/coins/packs` + `/webhooks/razorpay` either BFF, `/admin/...` admin-bff only). `/health` is 503 until
seeded (the six starter packs, only into an EMPTY list). Variables: `services/wallet/.env.example` (`ENGAGEMENT_URL` + `IDENTITY_URL` required; `PAYMENTS_PROVIDER`, `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` live here now; `ADMIN_SESSION_SECRET` must equal the admin BFF's so the pseudonyms agree). Tests:
`cd services/wallet && TEST_MONGODB_URI=... npm test` (needs a local `mongod`).

**Switch.** `WALLET_URL` (+ `INTERNAL_JWT_SECRET`) on the monolith AND both BFFs. Unset = phase 3 exactly. Set:

| Concern | Who does it now |
|---|---|
| Balance, ledger list, coin packs, buying coins (create + verify) | **mobile BFF** -> wallet (uid = the signed `sub`). Wallet unreachable = `503 {error, code: "wallet_unavailable"}` (never an empty balance); wallet's own answers (402/400/404/503 payments_unavailable/502 payments_failed) pass through unchanged |
| `POST /api/webhooks/razorpay` | **both BFFs**, STREAMED byte for byte with `x-razorpay-signature` and every other header; wallet checks the HMAC over the raw bytes, then credits through the same key as verify (`order:<id>`), so a replay or verify + webhook credits once. The URL on Razorpay stays the BFF's |
| Dashboard: wallet search, ledger, adjust (reason mandatory), coin packs, coin orders / stats, billing rules | **admin BFF**: area gate (`money`, `wallets` (+ `devotees:view` for the search), `orders`) -> wallet, audited through identity. Editors/viewers read but never write money; the masking of devotee names is done by the wallet (`lib/redact.js`) |
| Booking / chadhava / call spends and refunds | the **monolith**, through `lib/wallet-client.js` / `lib/wallet-ledger.js`: signed `iss monolith`, 5 s, no cache, no retry, same idempotency keys, **fail closed** (503 `wallet_unavailable`). A durable intent is written BEFORE a purchase's debit and a sweeper (the billing ticker) finishes any whose answer was lost; refunds are queued the same way. See `docs/MICROSERVICES.md` section 8, phase 4 |
| Coin rate / billing rules | engagement owns them; wallet reads the rate **fresh** and refuses (503 `settings_unavailable`) rather than guess |

The monolith then answers 404 for every wallet/coins route, stops seeding them, stops reading `PAYMENTS_PROVIDER` / `RAZORPAY_*`, and **refuses to boot with `WALLET_URL` but no `ENGAGEMENT_URL`**.
**Rollback = unset `WALLET_URL` everywhere** (the monolith's own `wallets` / `wallettxns` are never touched meanwhile, so what the wallet recorded since is NOT in them: copy back by hand if that matters).

**Cutover.** `node tools/split-db.mjs --source mongodb://.../bhakti --service wallet --dry-run`, then without `--dry-run`, **then** start the wallet (its seed only fills an EMPTY pack list), then set the
variable. Check a sample with `verifyWallet(uid)` (balance equals the sum of posted ledger rows). Move `PAYMENTS_PROVIDER` / `RAZORPAY_*` from `pooja-api/.env` to `services/wallet/.env`.

**Degraded mode.** Wallet down: purchases, cancels, the balance and buying coins answer 503 `wallet_unavailable` and change nothing; the webhook answers 503 (Razorpay retries); coin packs are served stale (`x-degraded: wallet`,
up to an hour); a call stays connected and its minutes are billed when the wallet answers; `/api/health` = 200 with `degraded:["wallet"]`, `/health/deps` = 503; dashboard wallet routes = 502.

## Phase 5: the orders service

Owns pooja bookings, chadhava ORDERS (the listings are catalog's) and pooja reviews, and **the money saga** that used to live in the monolith's `lib/wallet-saga.js`, in its own database `orders` (collections
`bookings`, `chadhavaorders`, `poojareviews`, `orderintents`). Routes live under `/internal/orders/...` at the monolith's own `/api` paths (devotee routes: mobile-bff only; operator routes: admin-bff only, area `orders`;
`GET /pooja-stats`: catalog only). `/health` is 503 until the indexes (the unique ones the idempotency rests on) are built. Variables: `services/orders/.env.example` (`WALLET_URL`, `CATALOG_URL`, `IDENTITY_URL`,
`ENGAGEMENT_URL` required; `SWEEP_EVERY_MS`, `INTENT_*`, `PRUNE_EVERY_MS`). Tests: `cd services/orders && TEST_MONGODB_URI=... npm test` (needs a local `mongod`; the wallet and catalog are in-process HTTP stand-ins with a real ledger).

**Switch.** `ORDERS_URL` (+ `INTERNAL_JWT_SECRET`) on the monolith AND both BFFs (and catalog's `ORDERS_URL` -> the orders service). Unset = phase 4 exactly. Set: the monolith answers 404 for the booking / chadhava-order / review routes and for
`/internal/orders/pooja-stats`, its saga sweeper ignores booking / chadhava intents, and it refuses to boot without the four services orders needs. **Rollback = unset it everywhere** (orders' data is not copied back).

| Concern | How |
|---|---|
| Price of a purchase | catalog's snapshot, read fresh, never cached, fail closed (`503 catalog_unavailable` before any intent or coin) |
| Coins | wallet only, signed `iss orders`, 5 s, fail closed (`503 wallet_unavailable`); the SAME idempotency key on every retry; a durable **intent** is written first; the sweeper finishes anything whose answer was lost |
| Refunds | every refund carries `ofKey` = the debit it reverses; the wallet verifies it (exists, posted, same uid, <= the charge, not refunded already) - see `docs/MICROSERVICES.md` phase 5 for the exact list of codes and the one goodwill exemption |
| Old intents | terminal ones are pruned after `INTENT_RETENTION_DAYS` (30); pending ones never |
| History | bookings / orders copy titles, names and prices when bought; a later catalog edit never rewrites them |
| Push | booking status / "chadhava offered": identity `push/send` (FCM, channel `default`) AND identity (device) -> engagement (token) -> Expo, both best effort |

**Cutover.** `node tools/split-db.mjs --source mongodb://.../bhakti --service orders --dry-run`, then without `--dry-run` (copies bookings, chadhava orders, reviews and the booking / chadhava saga intents - renamed
`walletintents` -> `orderintents`, unfinished ones included), **then** start orders, then set the variable everywhere. The first sweep resolves the copied pending intents.
**Degraded mode.** Orders down: bookings / orders / cancels / reviews 503 `orders_unavailable` (the public review list is served stale for an hour with `x-degraded: orders`), catalog shows no counts or ratings, `/api/health` = 200 with `degraded:["orders"]`.

## Phase 6: the calls service

Owns astrologers (the dashboard CRUD, invite / suspend / reactivate, the public list and profile, presence), calls (request / accept / decline / cancel / end / rating, the **billing ticker**, silence and ring
timeouts, the audio provider and the incoming-call push), earnings and payouts, in its own database `calls` (collections `astrologers`, `callsessions`, `astrologerearnings`, `payouts`, `callintents`).
Routes live under `/internal/calls/...` at the monolith's own `/api` paths (devotee / astrologer routes: mobile-bff only; operator routes: admin-bff only, areas `astrologers` / `calls` / `payouts`; the public
astrologer list: either BFF; `/directory/astrologers/claim|active`: **identity only**). Whether a caller is an astrologer is decided from the service's own table by the verified uid - never from a claim in a
token. `/health` is 503 until the indexes (the unique ones the rules rest on) are built. Variables: `services/calls/.env.example` (`WALLET_URL`, `IDENTITY_URL`, `ENGAGEMENT_URL` required; `RTC_PROVIDER`,
`AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` live here now; `TICK_EVERY_MS`, `SILENCE_MS`, `SWEEP_EVERY_MS`, `INTENT_*`, `PRUNE_EVERY_MS`). Tests: `cd services/calls && TEST_MONGODB_URI=... npm test` (needs a local `mongod`;
the wallet is an in-process HTTP stand-in with a real ledger).

**Switch.** `CALLS_URL` (+ `INTERNAL_JWT_SECRET`) on the monolith, both BFFs **and identity**. Unset = phase 5 exactly. Set: the monolith answers 404 for the astrologer / call / payout routes and for its internal
`/internal/astrologers/claim|active`, stops seeding them and stops its billing ticker, and refuses to boot without `WALLET_URL`, `IDENTITY_URL` and `ENGAGEMENT_URL`. **Rollback = unset it everywhere** (what the calls
service recorded meanwhile is NOT copied back). **Cut over with no call live**: switch `callsEnabled` off (billing rules), wait until the call log shows no live call, `node tools/split-db.mjs --source <uri>/<monolith db>
--service calls --dry-run`, then for real, start the service, set the variable everywhere, switch calls back on. Pending call-refund intents cross as they are and the service's sweeper resolves them.

| Concern | How |
|---|---|
| Coins | wallet only, signed `iss calls`, 5 s, **fail closed** (`503 wallet_unavailable`); the SAME key `call:<id>:min:<n>` on every retry. A wallet that cannot answer never ends a call and never bills one on a guess: the call stays connected and the ticker asks again |
| Refunds | a connect-failure refund is `call:<id>:refund:<n>` with `ofKey` = `call:<id>:min:<n>`; an operator's goodwill refund is paid per minute, `call:<id>:gw:<requestId>:<minute>` with `ofKey` = that minute's debit (so a minute can be refunded once - see MICROSERVICES.md). All through a durable intent (`callintents`) + sweeper, pruned after `INTENT_RETENTION_DAYS` |
| Rules | engagement, read **fresh** and failing closed (`503 settings_unavailable`) for `minMinutes`, `callsEnabled`, `defaultSharePct`, `payoutPaisePerCoin`; `ringTimeoutSec` falls back to its default |
| Ticker | every `TICK_EVERY_MS`, single-flight per instance, safe beside another instance (atomic conditional updates + idempotent keys + unique earning row); a restart picks up whatever fell due |
| Payouts | bookkeeping rows only (the wallet is never asked); two simultaneous payouts cannot both fit - a lease on the astrologer's row, so it holds across instances |
| Presence | soft state: online only while a heartbeat / poll is < 45 s old |
| Audio | `RTC_PROVIDER` / `AGORA_*` here; mock refused in production; anything unusable = `503 calls_unavailable` |

**Degraded mode.** Calls down: every call / astrologer route answers `503 calls_unavailable` (no stale list: a presence list that is old is wrong), the dashboard's astrologer / call / payout screens 502, a devotee still signs in
(identity skips the claim; an astrologer's own profile is 503), `/api/health` = 200 with `degraded:["calls"]`. Wallet down: requests refused 503 `wallet_unavailable`; live calls keep running and are billed when it is back.
Engagement down: requests refused 503 `settings_unavailable`; the ticker defers (no minute is charged on a guess).

## Deploying (Render) and CI

* `render.yaml` here is ONE Blueprint for all eight deployables (**Blueprint Path** = `backend/render.yaml`): `fromService`
  references only resolve inside a file, which is why this one is not split per service like `pooja-api/` and `pooja-admin/`.
  Only the two BFFs are public; the six services are private services (`type: pserv`, no free plan). Every service is
  `autoDeploy: false`, builds with `npm ci --omit=dev --ignore-scripts` from `backend/` (the one lockfile) and starts with
  `node <dir>/src/server.js`. Internal URLs come from `fromService ... hostport` as a bare `host:port`; every `config.js`
  normalises it with `serviceUrl()` from `@bhakti/common` (no dot / localhost / IPv4 -> `http://`, a public name -> `https://`).
  Check the file against the code with `ruby scripts/check-render-stack.rb` (run from the repo root; CI does).
* The full environment matrix (which variable on which service, shared vs secret) and the step-by-step cutover with the
  rollback of each phase are in [`../docs/MICROSERVICES_CUTOVER.md`](../docs/MICROSERVICES_CUTOVER.md).
* `tools/stack.sh start|status|stop` boots every service, the monolith shell and both BFFs the way the Blueprint does (clean
  environment, no `.env`); `STACK_NODE_ENV=production` rehearses the production configuration. CI's `stack` job runs it and then
  `pooja-api/scripts/smoke.mjs` through both BFFs.
* CI (`.github/workflows/ci.yml`): `backend` (lockfile guard, install, `npm test`), `stack` (boot + smoke), and `deploy-microservices`,
  which only runs when the repo variable `DEPLOY_MICROSERVICES` is `true`.
* `MONEY_SETTING_KEYS` (`@bhakti/common`) is the one list of settings that need `money:edit`; `tools/money-keys-parity.test.mjs`
  fails if the wallet's or the monolith's billing rules drift from it.

## Docker (NOT verified)

`docker-compose.yml` (mongo + engagement + identity + catalog + wallet + orders + calls + monolith + two BFFs), every `Dockerfile` and `docker/monolith.Dockerfile` were written but **never built or run** (the Render Blueprint uses the Node runtime, not these):
Docker is not installed where this was authored. Everything above was verified with plain Node processes only.

## Phase plan

See `../docs/MICROSERVICES.md` section 8: phases 0-7 are done (7 = deployment, CI and the cutover runbook). **The monolith is deliberately kept** (rollback + the BFFs' readiness probe); deleting it is a later, separate change.
