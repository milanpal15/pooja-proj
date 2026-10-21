# Cutover runbook — from the monolith to the microservices stack

Written for: the owner, doing this once, on Render + Atlas. Read the whole thing first; the order matters and
nothing here is irreversible until the "do not do yet" list. Architecture and every phase's behaviour are in
[`MICROSERVICES.md`](MICROSERVICES.md); the monolith's own deploy is still [`DEPLOY.md`](DEPLOY.md) and stays valid.

> **Status of this runbook: written, not rehearsed on Render.** The stack was verified as plain Node processes on a
> throwaway MongoDB (see `MICROSERVICES.md`, "What was verified"). Docker, Render itself, GitHub Actions, real Firebase /
> Razorpay / Agora / Expo, and an Atlas cutover have **not** been run. Treat every Render-specific line below as
> "should work, confirm on screen", and do the rehearsal in step 5 before you move any user.

## 0. What you are building

```
 phone app ──► bhakti-mobile-bff ─┐                    ┌─► bhakti-identity   (db identity)
 dashboard ──► bhakti-admin-bff  ─┤  service JWT       ├─► bhakti-catalog    (db catalog)
                                  ├──► private network ┼─► bhakti-wallet     (db wallet)
   pooja-api (monolith, kept) ◄───┘  (only /api/health)├─► bhakti-orders     (db orders)
                                                       ├─► bhakti-calls      (db calls)
                                                       └─► bhakti-engagement (db engagement)
```

* One Blueprint, [`backend/render.yaml`](../backend/render.yaml): 6 private services + 2 public BFFs, all
  `autoDeploy: false`, region `singapore` (same as `pooja-api`, so the monolith can reach the private services).
* **The monolith stays.** With every `*_URL` set it serves only `GET /api/health`, which both BFFs use as their
  readiness probe — so it must keep running (it is also your rollback). It is not deleted by this runbook.
* Two clients move: the **dashboard** (`VITE_API_BASE` → admin BFF, a rebuild) and the **app**
  (`EXPO_PUBLIC_API_URL` → mobile BFF, a rebuild + store release). Until you rebuild them they keep talking to the
  monolith, which is why steps 1–7 are risk-free for users.

## 1. Prerequisites

* A Render workspace where `pooja-api` already runs, in region **singapore**. Private services (`pserv`) have **no free
  plan**: expect 8 × Starter ≈ 8 × $7/month on top of the monolith. See "Free plan" at the end if you refuse that.
* GitHub repo admin (secrets and variables), the Render dashboard, the Atlas console.
* **Atlas user** that can read the monolith's database and create new ones on the cluster (`readWriteAnyDatabase`, or
  `readWrite` on `identity, catalog, wallet, orders, calls, engagement` plus read on the monolith's database). Network
  access `0.0.0.0/0` as for the monolith (Render has no fixed egress IP on these plans).
* **A backup, before anything else.** Atlas M0/M2/M5 have no cloud snapshots; take a dump:
  ```bash
  mongodump --uri "$MONGODB_URI" --out ./backup-$(date +%F)     # MONGODB_URI = pooja-api's, includes the db name
  ```
  Paid tiers: also take an Atlas snapshot (Cluster → Backup → Take snapshot now). Keep the dump until step 12.
  Restore check (do it once, on a local `mongod`, not on Atlas): `mongorestore --uri mongodb://127.0.0.1:27017 ./backup-…`.
* **Disk budget.** Atlas free is **512 MB for all databases together**. The split *copies* (it never deletes), so until
  the old collections are dropped (a "do not do yet" item) you hold the data **twice**. Check `db.stats()` on the
  monolith's database: if it is above ~200 MB, move to a paid tier first (GridFS media is the usual bulk).
* The values you will copy between systems — collect them now:

  | Value | Where it is today |
  |---|---|
  | monolith `MONGODB_URI` (with db name) | Render → `pooja-api` → Environment |
  | monolith `ADMIN_SESSION_SECRET` | same page |
  | monolith `ADMIN_PASSWORD` | same page |
  | `FIREBASE_SERVICE_ACCOUNT` (JSON) | same page |
  | `RAZORPAY_KEY_ID` / `_KEY_SECRET` / `_WEBHOOK_SECRET` | same page |
  | `AGORA_APP_ID` / `_APP_CERTIFICATE`, `YOUTUBE_API_KEY` | same page |
  | the dashboard URL | Render → `pooja-admin` |

## 2. Environment, per service (the complete matrix)

`render.yaml` declares all of this. **S** = secret (`sync: false`, you type it), **G** = from the `bhakti-shared`
group (one value for everything), **W** = wired by Render (`fromService`, nothing to type), **V** = fixed value in the
file. Optional tuning knobs (timeouts, sweep intervals…) are not in the file; their defaults are in each
`backend/services/<service>/.env.example` and `backend/bff/<bff>/.env.example`.

| Variable | engagement | identity | catalog | wallet | orders | calls | mobile-bff | admin-bff |
|---|---|---|---|---|---|---|---|---|
| `NODE_ENV=production`, `NODE_VERSION=20.19.4` | V | V | V | V | V | V | V | V |
| `INTERNAL_JWT_SECRET` (≥16, **same everywhere, incl. the monolith**) | G | G | G | G | G | G | G | G |
| `ADMIN_SESSION_SECRET` (≥16, **same as the monolith's current one**) | – | – | – | G | G | G | G* | G |
| `MONGODB_URI` (Atlas server URI, **no db name**) | S | S | S | S | S | S | – | – |
| `DB_NAME` | V `engagement` | V `identity` | V `catalog` | V `wallet` | V `orders` | V `calls` | – | – |
| `ENGAGEMENT_URL` | – | – | W | W | W | W | W | W |
| `IDENTITY_URL` | – | – | – | W | W | W | W | W |
| `CATALOG_URL` | – | – | – | – | W | – | W | W |
| `WALLET_URL` | – | – | – | – | W | W | W | W |
| `ORDERS_URL` | – | – | W (aggregates) | – | – | – | W | W |
| `CALLS_URL` | – | W | – | – | – | – | W | W |
| `MONOLITH_URL` (`https://pooja-api.onrender.com`) | – | S (only for rollback) | – | – | – | – | S | S |
| `FIREBASE_PROJECT_ID` (`pooja-app-aa462`) | – | – | – | – | – | – | V | – |
| `FIREBASE_SERVICE_ACCOUNT` (JSON, one line) | – | S | – | – | – | – | – | – |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | – | V / S | – | – | – | – | – | – |
| `RAZORPAY_KEY_ID`, `_KEY_SECRET`, `_WEBHOOK_SECRET` | – | – | – | S | – | – | – | – |
| `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | – | – | – | – | – | S | – | – |
| `YOUTUBE_API_KEY`, `MAX_UPLOAD_MB=25` | – | – | S / V | – | – | – | – | – |
| `CORS_ORIGIN` (the dashboard's exact URL; never `*`) | – | – | – | – | – | – | S | S |
| `SESSION_SAMESITE=None` | – | – | – | – | – | – | – | V |

\* the mobile BFF does not read `ADMIN_SESSION_SECRET`; the group simply delivers it.

Rules that have bitten before:

* **`INTERNAL_JWT_SECRET`** — Render generates it once for the group. **Copy that value into `pooja-api`** (a
  different blueprint cannot read the group). A service with a different value answers 401 to everyone.
* **`ADMIN_SESSION_SECRET`** — type the *monolith's current* value into the group so operators stay signed in and the
  "Devotee ••4821" pseudonyms do not change. A different/short/unset value is not fatal (random per boot) but signs
  everyone out on every restart.
* **Firebase.** The **service account goes to identity only** (it revokes tokens on block and deletes the Firebase
  account when the dashboard deletes a devotee). The **mobile BFF needs only the project id** (verified in
  `bff/mobile/src/firebase.js`: with no key, `FIREBASE_PROJECT_ID` alone initialises token verification — signature, expiry and
  audience checked against Google's public certs); it must be the project of the app's `google-services.json`. The
  admin BFF holds no Firebase key, deliberately.
* **Razorpay.** Keys and the webhook secret move from `pooja-api` to the **wallet** (the monolith stops reading them
  once `WALLET_URL` is set). The webhook **secret stays the same value**, so nothing changes in Razorpay except the URL
  (step 9). Never set `PAYMENTS_PROVIDER=mock`: production refuses it and purchases answer 503.
* **Agora.** `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` move to the **calls** service. Neither set = calls answer
  503 `calls_unavailable`, never a fake connection.
* **Push (Firebase Cloud Messaging).** No new variable: **identity** sends through the service account it already holds (`FIREBASE_SERVICE_ACCOUNT`), and its `ALLOWED_ISSUERS`
  default now also lists `engagement` (the `push/send` allowlist is `calls`, `orders`, `engagement`; if you set `ALLOWED_ISSUERS` explicitly on identity, add `calls`/`orders` yourself). Owner steps, once
  per Firebase project: (1) Google Cloud console for `pooja-app-aa462` -> APIs & Services -> enable **Firebase Cloud Messaging API (V1)** (Firebase console -> Project settings -> Cloud Messaging shows its
  status; "Cloud Messaging API (Legacy)" is NOT what is used and may stay disabled). (2) The service account must hold a role that may send: the default `firebase-adminsdk-…` account has
  *Firebase Admin SDK Administrator Service Agent* / Editor, which includes it; a custom account needs **Firebase Cloud Messaging API Admin** (`roles/firebasecloudmessaging.admin`). (3) The app build must be the one
  that registers its token and creates the Android channels `incoming-calls` and `default`. **Verify with a test send** (identity logs `Firebase Admin ready (project "…")` at boot; no credentials = sends return
  `{sent:0}` silently): sign in on the phone as the astrologer (the app POSTs `/api/push/register`), then from a machine that knows `INTERNAL_JWT_SECRET` mint a service token
  `{iss:'calls', sub:null}` (`signServiceToken` in `@bhakti/common`) and `POST <identity>/internal/identity/push/send` with `{uid:'<astrologer firebase uid>', title:'Test', body:'Hello', channelId:'default'}`;
  `{sent:1,devices:1}` and a notification on the phone with the app closed = done. `{sent:0,devices:1}` means FCM refused it (API not enabled / role missing: see identity's log line `push to … not delivered (…)`);
  `devices:0` means that account has no registered token. See `docs/MICROSERVICES.md` section 10 for the design and the limits (no ringing UI, default sound, no iOS).
* **Expo.** The backend reads no Expo credential; pushes go to Expo's public push API (`EXPO_PUSH_URL`, default
  already right). The only Expo-side change is the app rebuild with the new `EXPO_PUBLIC_API_URL` (step 10).
* **Internal URLs.** `fromService … property: hostport` delivers `bhakti-wallet:10000` (no scheme). Every service's
  `config.js` turns that into `http://bhakti-wallet:10000` (`serviceUrl` in `@bhakti/common`: no dot / localhost / IPv4 →
  `http://`, a public host name → `https://`; tested). **The monolith does not do this** — type full URLs there (step 7).
  `MONOLITH_URL` on the BFFs is typed with `https://`; a bare `pooja-api.onrender.com` also works (normalised).

## 3. Which services need which (the true dependency order)

Derived from each service's *required* URLs (`config.js` refuses to boot without them — it checks the variable is set,
not that the other service is reachable, so Render may start them in any order and they converge):

```
engagement                      (nothing)
identity                        (nothing required; asks calls, if CALLS_URL, at sign-in)
catalog        → engagement     (ORDERS_URL optional: counts/ratings)
wallet         → engagement, identity
orders         → engagement, identity, catalog, wallet
calls          → engagement, identity, wallet
BFFs           → CATALOG_URL needs ENGAGEMENT_URL (+ IDENTITY_URL on mobile); WALLET/ORDERS/CALLS_URL need IDENTITY_URL on mobile
monolith       → WALLET_URL needs ENGAGEMENT_URL; ORDERS_URL needs CATALOG+WALLET+IDENTITY+ENGAGEMENT; CALLS_URL needs WALLET+IDENTITY+ENGAGEMENT
```

Cutover order = engagement → identity → catalog → wallet → orders → calls. **Rollback is the reverse**: you cannot unset
`ENGAGEMENT_URL` while `CATALOG_URL` is set (the BFF/monolith refuses to boot) — unset the later ones first.

## 4. Redeploy the monolith with the call-index fix (do this first, alone)

The monolith used to allow **only one live call on the whole platform**: a unique index on `{devoteeLive: 1}` with a
value of `true` for every live call, so a second devotee's request was refused with `409 already_in_call`. It is fixed
in `pooja-api` (the index is now `{devoteeUid: 1, devoteeLive: 1}`, plus a boot migration `dropStaleDevoteeLiveIndex` that
drops the old `devoteeLive_1`; test: `pooja-api/src/modules/calls/call-index.test.mjs`) and in the calls service
(which never had the bad index).

**It takes effect when the monolith is redeployed** — merging to `main` and letting the normal CI deploy run is enough.
It is safe on every boot (a missing index is the normal case afterwards). Do this before everything else so that, whatever
you decide about the rest, calls are no longer limited to one at a time.

## 5. Rehearse locally first (30 minutes, recommended)

On your machine, with a **throwaway** mongod (not Atlas) holding a restore of your dump:

```bash
export PATH=/opt/homebrew/bin:$PATH
mongod --port 27301 --dbpath /tmp/rehearsal-db &
mongorestore --uri mongodb://127.0.0.1:27301 ./backup-…          # the monolith's database comes back under its own name
cd backend && npm ci
for s in engagement identity catalog wallet orders calls; do
  node tools/split-db.mjs --source mongodb://127.0.0.1:27301/<monolith-db> --service $s --dry-run
done                                                           # then without --dry-run
MONGO_BASE=mongodb://127.0.0.1:27301 BASE_PORT=4300 tools/stack.sh start
BASE=http://127.0.0.1:4310 node ../pooja-api/scripts/smoke.mjs                              # mobile BFF
BASE=http://127.0.0.1:4311 ADMIN_PASSWORD=… node ../pooja-api/scripts/smoke.mjs             # admin BFF
tools/stack.sh stop
```

(`tools/stack.sh` starts the six services, the monolith shell and both BFFs with exactly the blueprint's start commands
and no `.env`; its ports are `BASE_PORT + 2…11`.) Point a *local* dashboard at `:4311` to click through.

## 6. Copy the data (before any service is started on real data)

Run from your machine (or any box with the repo and network access to Atlas). `SRC` is the monolith's URI **including
its database name**; `TARGET` is the same cluster's server URI (the tool picks each service's database).

```bash
cd backend && npm ci
SRC='mongodb+srv://USER:PASS@cluster.mongodb.net/<monolith-db>?retryWrites=true&w=majority'
for s in engagement identity catalog wallet orders; do
  node tools/split-db.mjs --source "$SRC" --service $s --dry-run     # read and count only; compare with the Atlas collection counts
done
for s in engagement identity catalog wallet orders; do
  node tools/split-db.mjs --source "$SRC" --service $s              # insert-only, idempotent, never touches the source
done
```

**`calls` last, and only with no call live:** dashboard → Billing rules → switch *Astrologer calls enabled* **off**
(no new calls), wait until Calls shows nothing live (or force-end it), then
`node tools/split-db.mjs --source "$SRC" --service calls --dry-run` and for real.

Why before the first start: identity's first start seeds a default policy and, with an empty operators collection,
creates a first admin from `ADMIN_PASSWORD` — both would collide with the copied rows. Catalog and wallet seeds fill only
*empty* collections, so a copy first keeps your rows alone. A `pending` wallet row is copied as pending; the wallet's
reconciler finishes it once. Unfinished saga intents cross as they are; the orders/calls sweepers resolve them.

Re-running is safe (insert-only). To refresh a copy that is stale (see "dual running" below) add `--overwrite` — that
**replaces** same-`_id` documents in the target, so use it only before the services have taken real writes.

## 7. Create the Blueprint and the services

1. Render → **New → Blueprint** → this repo → **Blueprint Path** `backend/render.yaml`.
2. Fill the `sync: false` values from the matrix in §2: `MONGODB_URI` (×6, the server URI without a database),
   `ADMIN_PASSWORD`, `FIREBASE_SERVICE_ACCOUNT` (flatten: `jq -c . firebase-service-account.json | pbcopy`),
   Razorpay ×3, Agora ×2, `YOUTUBE_API_KEY`, `MONOLITH_URL`, `CORS_ORIGIN` (dashboard URL) and the group's
   `ADMIN_SESSION_SECRET`. Empty is allowed for the optional provider keys.
3. Copy the group's generated `INTERNAL_JWT_SECRET` into `pooja-api`'s environment (same name).
4. Services are created and **not auto-deployed**; trigger the first deploy of each from Render (Manual Deploy), in the
   order of §3. Watch each log for `listening` and, for catalog, the seeds finishing.
5. Add these deploy hooks to GitHub (Settings → Secrets → Actions), from each service's Settings → Deploy Hook:
   `RENDER_DEPLOY_HOOK_ENGAGEMENT`, `_IDENTITY`, `_CATALOG`, `_WALLET`, `_ORDERS`, `_CALLS`, `_MOBILE_BFF`, `_ADMIN_BFF`;
   variables `MOBILE_BFF_URL`, `ADMIN_BFF_URL`; optional secret `SMOKE_ADMIN_PASSWORD`. **Do not** set the variable
   `DEPLOY_MICROSERVICES=true` yet — see step 11.

The monolith's URL variables (typed, full `http://` form — its config does not add a scheme; confirm each host in the
service's Render page under "Internal address"):

```
ENGAGEMENT_URL=http://bhakti-engagement:10000   IDENTITY_URL=http://bhakti-identity:10000
CATALOG_URL=http://bhakti-catalog:10000         WALLET_URL=http://bhakti-wallet:10000
ORDERS_URL=http://bhakti-orders:10000           CALLS_URL=http://bhakti-calls:10000
INTERNAL_JWT_SECRET=<the group's value>
```

You set them in step 8, one phase at a time.

## 8. Switch phase by phase (each step: switch → verify → keep or roll back)

The BFFs are created with **every** URL set (that is what the blueprint wires). While the app and dashboard still talk
to the monolith that is harmless: nobody is using the BFFs yet. Two ways to go from here:

* **A — rehearse, then switch everything once (recommended for a small user base).** Verify the BFFs (step 8.0), freeze
  writes briefly, refresh the copy, set all monolith URLs in §3 order, rebuild clients (steps 9–10). Rollback = unset
  the URLs in reverse order and keep/restore the clients on the monolith.
* **B — strangler.** Before step 7.4 remove (from `render.yaml`, commit, sync) the BFF `*_URL` lines for services not yet
  cut over, then add them back one per phase. Deleting a blueprint-managed variable in the dashboard only is reverted by
  the next sync — change the file, not just the dashboard.

**8.0 BFF check (no monolith URL set yet):**
```bash
BASE=https://<mobile-bff-host> node pooja-api/scripts/smoke.mjs                       # 0 FAIL expected
BASE=https://<admin-bff-host>  ADMIN_PASSWORD=… node pooja-api/scripts/smoke.mjs
curl -s https://<mobile-bff-host>/health/deps        # every service {ok:true}; any {ok:false} = that service is down or its URL/secret is wrong
curl -s https://<mobile-bff-host>/api/health         # {"ok":true,…,"commit":"<sha>"}; a "degraded":[…] array names a service that is down
```
`/api/health` stays 200 with `degraded:["wallet"]` when a soft dependency is down; `/health/deps` is 503 then. Watch
both for the whole cutover.

| # | Switch (set on the **monolith**; the BFFs already have it) | Before | Verify after | Rollback |
|---|---|---|---|---|
| 1 | `ENGAGEMENT_URL` + `INTERNAL_JWT_SECRET` | `split-db --service engagement` done, service up | flags toggle in the dashboard shows in the app; `/api/flags` 200 | unset `ENGAGEMENT_URL` (monolith, BFFs) |
| 2 | `IDENTITY_URL` | `--service identity` done; service up (do **not** start it before the copy) | sign in on the app; dashboard login with the same operator; a block/unblock round trip | unset `IDENTITY_URL`. Users/operators created meanwhile are only in identity |
| 3 | `CATALOG_URL` | `--service catalog` done (includes GridFS) | `/api/content` identical key order; an `/uploads/<id>` image loads with Range; edit a deity in the dashboard | unset `CATALOG_URL` (edits made meanwhile stay in catalog) |
| 4 | `WALLET_URL` | `--service wallet` done; Razorpay vars on the wallet | balance of a sample user matches; buy a pack (Razorpay test mode first); then change the **webhook URL (§9)** | unset `WALLET_URL`, point the webhook back |
| 5 | `ORDERS_URL` (+ catalog's `ORDERS_URL` already wired) | `--service orders` done | book a pooja; cancel it (refund appears once); a review list loads | unset `ORDERS_URL` |
| 6 | `CALLS_URL` on the monolith **and identity** | `--service calls` done with no live call; Agora vars on calls | astrologer signs in (invite claim), a test call connects and bills per minute; switch *calls enabled* back **on** | unset `CALLS_URL` (monolith, BFFs, identity) |

Rolling back means everything recorded by the new service since the switch is **not** copied back (a deliberate,
documented limit). If that matters, stop writes, run the reverse copy by hand, then unset.

After each row, wait for the next `degraded` poll to be empty and run both smoke commands again.

**Dual running / the freeze.** From the day the copy was taken until the clients move, anything written through the
monolith is not in the new databases. For path A: pick a quiet hour, put the dashboard in "read only" use (don't edit),
re-run `split-db` (insert-only picks up new documents; add `--overwrite` only for rows you know changed and that the
new services have not written), then do rows 1–6 back to back.

## 9. Razorpay webhook

Razorpay Dashboard → Settings → Webhooks → edit the existing one:

* **URL:** `https://<mobile-bff-host>/api/webhooks/razorpay` (the BFF streams the body byte for byte to the wallet; **never
  point Razorpay at the wallet service** — it is private, and the HMAC is over the raw bytes).
* **Secret:** unchanged — the same value as `RAZORPAY_WEBHOOK_SECRET` on the wallet.
* Events: unchanged.

Change it right after row 4. Anything that hits the old monolith URL after `WALLET_URL` is set gets 404 and Razorpay
retries for up to 24 hours, so the window is harmless; coins are credited once either way (the verify call and the
webhook share the key `order:<id>`).

## 10. Point the clients at the BFFs

* **Dashboard:** `VITE_API_BASE=https://<admin-bff-host>` on `pooja-admin` (Render → Environment) → **rebuild** (not restart;
  it is baked in at build time) → CI deploy hook or Manual Deploy. The admin BFF's `CORS_ORIGIN` must equal the dashboard's
  exact URL and `SESSION_SAMESITE=None` (already in the blueprint). Sign out/in once.
* **App:** `poojaappclone/.env` → `EXPO_PUBLIC_API_URL=https://<mobile-bff-host>`; restart Metro; **rebuild the app**
  (`EXPO_PUBLIC_*` is embedded at bundle time) and release it. Old installs keep calling the monolith, which — with the
  URLs set — answers 404 to almost everything, so **keep the monolith's URLs unset until the old app versions have aged
  out, or accept that they break** (path B avoids this: the BFFs front the monolith first). This is the one irreversible-ish
  step of the whole plan — a store release cannot be recalled.

## 11. CI deploys for the new stack (opt-in)

When the stack is healthy and you want pushes to `main` to ship it: set the repo variable
`DEPLOY_MICROSERVICES` = `true`. The `deploy-microservices` job (in `.github/workflows/ci.yml`) then runs after the
monolith's `deploy` job: the six service hooks, then the two BFF hooks, then it polls both BFFs' `/api/health` for the
pushed commit SHA, requires `/health/deps` = 200 and no `degraded`, and smoke-tests both BFFs. The six services are
private, so their own commit is not visible from outside; a stale one shows up in `/health/deps`. Unset the variable and
the monolith deploy continues exactly as before.

## 12. What to watch, and the cold-start warning

* **Health:** `https://<bff>/api/health` (200, `commit`, optional `degraded:[…]`) and `/health/deps` (per-service
  `{ok, ms}`; 503 if any is down). Each service's own `/health` is 503 until its seeds/indexes finish.
* **Degraded behaviour you should expect, by design:** identity down → authenticated devotee routes 503 `auth unavailable`
  (fail closed; public content keeps working); wallet down → purchases/balance 503 `wallet_unavailable` and no coin
  moves (the Razorpay webhook 503s so Razorpay retries); catalog down → content served stale up to 60 min with
  `x-degraded: catalog`; purchases 503 before any coin moves; orders/calls down → their routes 503
  `orders_unavailable` / `calls_unavailable`.
* **Render free plan:** a free web service sleeps after 15 minutes idle and takes ~30–60 s to wake. In this stack one request
  is 1–3 internal hops, so a cold stack chains wake-ups and the first request times out (the shared client times out at 5 s
  and the breaker opens). This is why every service in the blueprint is paid. If you run any piece on free, keep **both BFFs,
  identity, wallet and catalog** warm at the very least.
* **Atlas free tier (512 MB):** the copy doubles your data until you drop the old collections (not yet). Watch Atlas
  Metrics → Storage; GridFS media in `catalog` is the bulk.
* Orphaned GridFS files and `orderintents`/`callintents` pruning: unchanged from `MICROSERVICES.md`.

## 13. Do **not** do yet

* **Do not delete `pooja-api/`** (the repo folder) or the Render service `pooja-api`: it is the rollback and the BFFs' readiness
  probe. Removing it needs a BFF change (drop `MONOLITH_URL`/the probe) that is deliberately not part of this release.
* **Do not drop the old collections** in the monolith's database (users, wallets, wallettxns, bookings, …). They are your
  rollback data. Drop them only after weeks of running on the new stack and a fresh `mongodump`.
* Do not set `DEPLOY_MICROSERVICES=true` before the Blueprint is synced and the hooks exist.
* Do not run `split-db --overwrite` against a service that has taken real writes.
* Do not run more than one `bhakti-calls` instance until you have load-tested it (it is built to tolerate two, and tested
  with two on one database, never on Render).
* Do not point Razorpay, the app or the dashboard at a private service; they have no public URL by design.

## Free plan / no private services (what changes, and the honest limit)

If you will not pay for private services, change, **for each of the six services** in `backend/render.yaml`:
`type: pserv` → `type: web`, `plan: starter` → `plan: free`, add `healthCheckPath: /health`, and every `fromService`
that points at it: `type: pserv` → `type: web`, `property: hostport` → `property: host` (a public host name; the services
add `https://`). Update `scripts/check-render-stack.rb` accordingly or it will (rightly) object.

What you lose: **the network boundary.** The six services become reachable from the internet. The only control left is the
bearer service token — every `/internal/…` route needs a JWT signed with `INTERNAL_JWT_SECRET` (HS256, 60 s expiry) whose
issuer is in the service's `ALLOWED_ISSUERS`, and each route family accepts only its own issuer. That is a real check, but
**anyone who learns `INTERNAL_JWT_SECRET` can mint any identity** (admin role included) against every service, there is no
second factor and no rate limit beyond Render's. `/health` stays unauthenticated (status + commit only). Mitigations, all
env-only: a long random `INTERNAL_JWT_SECRET` (rotate by changing the group value and redeploying everything together);
`ALLOWED_ISSUERS` narrowed per service to the callers that exist (e.g. `mobile-bff,admin-bff,orders,calls` on the wallet — only after
a day of logs shows no 401s for `monolith`/`pooja-api`); never log tokens. And the free plan's sleep makes the stack unusable in
practice (§12). Treat this as a demo configuration, not production.
