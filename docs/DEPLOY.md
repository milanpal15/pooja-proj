# Deploying the admin dashboard

Written for: whoever is putting `pooja-admin` on the internet for the first
time. Takes about 30 minutes, most of it waiting.

The dashboard is one Node service — Express serves both the API and the built
React UI — plus a MongoDB database and a disk for uploaded images. Target
here is **Render's free web service**, pointed at whatever MongoDB you
already run.

---

## Before you start

You need:

- the GitHub repo (`milanpal15/pooja-proj`) up to date,
- a [Render](https://render.com) account,
- a MongoDB connection string **for a database of this app's own** — see
  below, this is the step that goes wrong,
- the Firebase service-account JSON for project `pooja-app-aa462`
  (Firebase console → Project settings → Service accounts → Generate new
  private key). **This is a secret.** It never goes in the repo.

---

## 1. The database

### Give this app its own database

This matters more than it looks. The app's models write to collections named
`users`, `settings`, `events`, `visitors`, `payments`, `deities` and so on —
all unprefixed. Point it at a database another system already uses and the
two will share `users` and `settings` and quietly corrupt each other, and the
dashboard's "delete devotee" will delete the other system's rows.

The database name is the last path segment of the URI:

```
mongodb://USER:PASS@host:27019/pooja_admin
                               ^^^^^^^^^^^ its own, not shared
```

A separate database on a server you already run is fine — it costs nothing
and isolates the collections. Just make sure the user can create it, and that
the name is not already in use. Verify before deploying:

```bash
# Lists what is already in there. Expect an empty list.
mongosh "$MONGODB_URI" --eval 'db.getCollectionNames()'
```

If that prints another application's collections, **change the database
name** and run it again.

### Or use Atlas

If you do not already run MongoDB: [Atlas](https://cloud.mongodb.com) M0 is
free. Create a cluster near your devotees (Mumbai or Singapore), add a
database user under **Database Access**, and allow `0.0.0.0/0` under
**Network Access** — Render has no fixed egress IP on the lower plans, so
the password is what protects it; use a long one. Then **Connect → Drivers**
and append `/pooja_admin` to the string.

### A note on `mongodb://` vs `mongodb+srv://`

A plain `mongodb://` URI to a public IP is **unencrypted** — the password and
every document cross the internet in clear text. Atlas (`mongodb+srv://`)
forces TLS. If you are using your own server, either put it behind a VPN or
enable TLS on mongod and add `?tls=true`.

## 2. The services

Render → **New → Blueprint** → pick this repo. It reads
two Blueprint files — one per service, each in its own folder:
[`pooja-api/render.yaml`](../pooja-api/render.yaml) and
[`pooja-admin/render.yaml`](../pooja-admin/render.yaml). Render looks for
`render.yaml` at the repo root by default and neither is there, so set
**Blueprint Path** to the right file when you create each one.

They are separate because the two services have different lifecycles: the
dashboard is a static site that sometimes has to be deleted and recreated,
and that should never put the API at risk.

Between them they declare the API
(`pooja-api`, a Node process) and the dashboard (`pooja-admin`, a static
bundle) — along with their build commands, the health check, and the
non-secret environment.

> **Already have a service called `pooja-admin` running the API?**
> That is the pre-split one, from when the backend lived inside the
> dashboard folder. Render matches a blueprint to a service **by name**, so
> rename it to `pooja-api` in Settings *before* syncing; otherwise you get
> a second service and the old one keeps failing with
> `npm error Missing script: "serve"`.

> **A service's TYPE cannot be changed.** The dashboard is a *static site*;
> the pre-split `pooja-admin` was a *Node web service*. A sync adopts the
> old service by name and applies what it can — so its build command starts
> working and the deploy still dies on `npm run serve`, a script that moved
> to `pooja-api` long ago. Delete that web service in Render, then sync,
> and it comes back as a static site. Until then Render keeps the previous
> container serving, so the dashboard looks healthy while every deploy of
> it fails.

The dashboard's `VITE_API_BASE` is filled in from the API service, so it
is never typed. Render hands over a bare host with no scheme; the dashboard
prefixes `https://` itself.

The reverse — the API reading the dashboard's host — is **not** wired, on
purpose. Render refuses to sync a Blueprint whose `fromService` does not
resolve:

```
env var depends on non-existent service: {web pooja-admin}
```

and the dashboard is exactly the service that has to be deleted and
recreated, because a service's type cannot be changed. Pointing the API at
it made the two Blueprints a cycle, each refusing to sync until the other
existed. `CORS_ORIGIN` is typed once instead; one direction of dependency
is fine, a cycle is not.

You will be prompted for the three secrets marked `sync: false`:

| Variable | Value |
|---|---|
| `MONGODB_URI` | the string from step 1 — **its own database** |
| `ADMIN_PASSWORD` | bootstraps the first admin account — see Operators and roles |
| `FIREBASE_SERVICE_ACCOUNT` | the **entire** service-account JSON, on one line |

For the Firebase one, flatten the file first:

```bash
jq -c . firebase-service-account.json | pbcopy
```

Paste that as the value. `ADMIN_SESSION_SECRET` is generated for you.

First deploy takes a few minutes. When it is up you get two URLs, like
`https://pooja-api.onrender.com` and `https://pooja-admin.onrender.com`.

### Uploaded media

Artwork, alert tones and bhajan recordings go into **MongoDB (GridFS)**, not
onto the container's filesystem — Render wipes that on every deploy and the
free plan cannot mount a disk, so a file written there was gone by the next
release. There is nothing to configure: the same `MONGODB_URI` holds them,
and one backup covers documents and media together.

Two consequences:

- **Atlas M0 is 512MB total.** Media counts against the same budget as the
  documents. A few hundred images is fine; a library of full-length
  recordings is not. `db.stats()` or the Atlas metrics tab show the split.
- **`MAX_UPLOAD_MB`** (default 25) caps a single upload. Uploads are
  buffered in memory on the way to the database, so raising it on a free
  instance — 512MB of RAM — is not free.

Upgrading from a deploy that stored files on disk? Run it once, against the
production database:

```bash
cd pooja-api
MONGODB_URI='…' npm run migrate:media -- --dry-run   # preview
MONGODB_URI='…' npm run migrate:media                # do it
```

It copies each file into GridFS and rewrites every document that referenced
the old path. It is idempotent, so a second run stores nothing new.

### Deploy hooks

Both services have `autoDeploy: false` — CI ships them, so a commit that
fails the gate smoke test cannot reach production just because it was
pushed. That means **each service needs its deploy hook in GitHub**, or it
silently never ships:

| GitHub secret | From |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render → `pooja-api` → Settings → Deploy Hook |
| `RENDER_DASHBOARD_DEPLOY_HOOK_URL` | Render → `pooja-admin` → Settings → Deploy Hook |

Also set the repo **variable** `DEPLOY_URL` to the API's URL — CI polls
`$DEPLOY_URL/api/health` for the pushed commit before smoke-testing it.
Renaming a service does **not** change its deploy hook (the hook is keyed to
the service id), but it *does* change its URL, so `DEPLOY_URL` must be
updated after a rename.

> **The free plan sleeps after 15 minutes idle** and takes ~30–50s to wake.
> Fine for a dashboard you open a few times a day. Less fine for the phone
> app, which calls `/api/content` on launch — it falls back to the bundled
> catalogue while it waits, so nothing breaks, but a content change may not
> show on the first launch after a quiet spell. Upgrading to Starter removes
> the sleep and allows a disk; see Uploads.

## 3. Turn on the pipeline

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push
and pull request, and deploys from a green `main`. Both Blueprints set
`autoDeploy: false` precisely so that Render does not release anything this
has not checked.

What runs:

| Job | What it proves |
|---|---|
| **dashboard** | `npm ci`, UI builds, the server actually **boots** against a real MongoDB 7 service container, and `scripts/smoke.mjs` passes — public endpoints open, every admin route 401, sign-in works |
| **app** | `tsc --noEmit` and `expo lint` (needs no secrets — verified both pass without `.env`) |
| **deploy** | only on `main`, only if both passed: hits the deploy hook, waits for **this commit** to be live, then runs the same smoke test against the real URL |

Add these in **Settings → Secrets and variables → Actions**:

| | Name | Value |
|---|---|---|
| Secret | `RENDER_DEPLOY_HOOK_URL` | Render → the service → Settings → Deploy Hook |
| Variable | `DEPLOY_URL` | `https://pooja-admin.onrender.com` (no trailing slash) |
| Secret *(optional)* | `SMOKE_ADMIN_PASSWORD` | same as `ADMIN_PASSWORD`; makes the post-deploy check exercise sign-in too |

The deploy job waits for `/api/health` to report `github.sha`, not merely to
answer. Polling for "is it up" would pass instantly against the old container
still serving traffic during a release — Render sets `RENDER_GIT_COMMIT`, and
health reports it.

Two things this is designed to catch that a build cannot:

- **a route added above `requireAdmin`** in `index.js` — looks harmless in
  review, publishes `DELETE /api/users/:id` to the internet;
- **an environment variable set wrong in Render** — the build is perfect and
  the release still ships with no `ADMIN_PASSWORD`. The post-deploy smoke
  test is the only thing that looks.

Run the same check by hand any time:

```bash
cd pooja-admin
BASE=https://pooja-admin.onrender.com ADMIN_PASSWORD=… npm run smoke
```

If you want a human to approve releases, add required reviewers to the
`production` environment in repo settings — the deploy job already declares
it, so it will start waiting with no change here.

## 4. Point the app at it

In `poojaappclone/.env`:

```
EXPO_PUBLIC_ADMIN_API=https://pooja-admin.onrender.com
```

Then rebuild the app (`npx expo run:android`). This value is baked into the
JS bundle at build time, so changing it needs a new build, not a reload.

Check it reached the right place:

```bash
curl https://pooja-admin.onrender.com/api/health
curl https://pooja-admin.onrender.com/api/content | head -c 200
```

## 5. Seed the content

Nothing to do: a fresh database seeds itself with the bundled catalogue on
first boot (`db/seed.js` seeds only what is empty). Verified on a cold, empty
database — 8 deities, 5 temples, 6 aartis, 16 festivals, 5 sevas, 9 FAQs and
the settings table all appear. Sign in to the dashboard and adjust from
there.

---

## Operators and roles

Each person who uses the dashboard gets their own username, password and
role. `ADMIN_PASSWORD` (with optional `ADMIN_USERNAME`, default `admin`) now
only **bootstraps the first admin** on an empty database — after that,
accounts are managed in the **Operators** tab.

| Role | May do |
|---|---|
| **admin** | Everything: content, plus Operators, devotee Users, Feature Flags, Coin Orders, Visitors, Rules |
| **editor** | Content only — deities, temples, aartis, festivals, sevas, knowledge, FAQs, home slides, horoscope, panchang, announcements, settings |

The split that matters: whoever writes the daily horoscope cannot delete a
devotee's account — and deleting a devotee here deletes their Firebase
account too.

Enforcement is server-side, in `ADMIN_ONLY` in
[`src/middleware/access.js`](../pooja-api/src/middleware/access.js). The sidebar
hides tabs an editor cannot use, but that is only cosmetic: an editor who
calls `/api/users` directly gets 403.

A few deliberate refusals, all of which exist to prevent a lockout:

- you cannot demote, suspend or delete **yourself**;
- you cannot remove the **last active admin**;
- a suspended operator cannot sign in, and a demotion takes effect on their
  very next request rather than when their session happens to expire.

Passwords are stored as salted scrypt hashes and never leave the server —
the operator list does not include them. Sessions are a signed HttpOnly
`SameSite=Strict` cookie, good for 12 hours.

**Forgot the admin password?** There is no reset link. Connect to the
database and delete the operator record, then restart with `ADMIN_PASSWORD`
set — an empty operator collection bootstraps a fresh admin.

## The bootstrap password

`ADMIN_PASSWORD` creates that first admin. Everything under
`/api` that is not on the phone app's allowlist — all content CRUD, uploads,
feature flags, analytics, and the Users tab that can **delete devotees and
their Firebase accounts** — requires it.

- **Production refuses to start with no operators and no `ADMIN_PASSWORD`.**
  That is deliberate: there is no degraded mode where the admin API is open,
  because an open admin API is the entire problem.
- The allowlist of public endpoints lives in
  [`src/middleware/access.js`](../pooja-api/src/middleware/access.js) and is
  **fail-closed** — a route added later is private unless it is listed. When
  you add an endpoint the app needs, add it there too or the app will get 401.
- Sessions are a signed HttpOnly `SameSite=Strict` cookie, good for 12 hours.
- To change a password: use **Operators → Set password**. Changing
  `ADMIN_PASSWORD` after the first boot does nothing — it only ever seeds
  the first account.
- **Set `ADMIN_SESSION_SECRET`.** Without one a random key is generated per
  boot, which is safe but signs everyone out on every restart.

Locally, leave `ADMIN_PASSWORD` unset and the dashboard stays open with a
warning on boot — a password on localhost is friction with nothing behind it.

## Uploads

**On the free plan, uploaded images are deleted on every deploy.** The
container filesystem is rebuilt each release and the free plan cannot mount a
disk, so artwork uploaded through the dashboard disappears — silently, with
nothing in the logs to say why. Three ways out, in order of effort:

1. **Paste URLs instead of uploading.** Every image field accepts an absolute
   URL as well as an upload. Host the artwork anywhere stable.
2. **Upgrade to Starter** and give it a disk. Add this back to
   `pooja-api/render.yaml`, alongside `plan: starter`:

   ```yaml
       disk:
         name: uploads
         mountPath: /var/data
         sizeGB: 1
   ```

   and the env var that points multer at it:

   ```yaml
         - key: UPLOAD_DIR
           value: /var/data/uploads
   ```

3. **Move to object storage.** Swap the multer disk storage in
   `pooja-api/src/modules/media/files.js` for an S3 or Cloudinary client. Nothing else
   changes — the stored value is just a URL, and both clients already resolve
   absolute URLs.

## Operating it

- **Logs**: Render → the service → Logs.
- **Health**: `GET /api/health`, which is also what Render polls.
- **Backups**: nothing is automatic. `mongodump` against the `MONGODB_URI`
  on a schedule if the content matters.
- **Redeploy**: push to `main`. CI checks it and deploys if green; Render's
  own auto-deploy is off on purpose. To re-release without a commit, run the
  workflow manually (Actions → CI → Run workflow).
- **A deploy that fails the post-deploy smoke test** leaves the new version
  running — the pipeline reports, it does not roll back. Use Render's
  "Rollback" button, then fix forward.

## Known gaps

- **No HTTPS redirect or HSTS** is configured in the app; Render terminates
  TLS and does not serve the service over plain HTTP, so this has not
  mattered. It would behind your own proxy.
- **No rate limiting** on `/api/admin/login`. The password is checked in
  constant time, but nothing slows a determined guesser down — use a long
  password, or put Cloudflare in front.
- **`CORS_ORIGIN` is `*`.** Fine while the only browser client is the
  same-origin dashboard; narrow it if you ever host the UI separately.
- **Uploads are ephemeral on the free plan** — see Uploads above.
