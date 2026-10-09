# Pooja Project — Agent Handoff

Monorepo for a **Sri Mandir–style Hindu devotional mobile app** plus its **admin
dashboard**. Two independently-runnable projects that talk over HTTP.

```
pooja proj/
├── poojaappclone/     Expo / React Native app (the phone app)
├── pooja-api/         The backend — Express + Mongoose over MongoDB
├── pooja-admin/       Admin dashboard — a React/Vite static site on that API
├── docs/              FIREBASE_SETUP.md (auth setup — read before debugging sign-in)
└── CLAUDE.md          includes this file via @AGENTS.md
```

> **UI and code structure follow [`DESIGN.md`](DESIGN.md)** — design tokens, the
> shared component kit, and the folder/decomposition rules for the app, the API
> and the dashboard. Read it before adding a screen, component or API route.
> **Dashboard roles (admin / editor / viewer) and what each may see and edit are
> specified in `DESIGN.md` §21** — a new dashboard screen or admin route must be
> given an area there.

> The app has its own `poojaappclone/AGENTS.md` with one hard rule:
> **Expo SDK 57 — read https://docs.expo.dev/versions/v57.0.0/ before writing app code.**

---

## 1. The mobile app — `poojaappclone/`

**Stack:** Expo SDK 57, expo-router (file-based), React Native 0.86, TypeScript
(strict), React Compiler **disabled**. Path alias `@/*` → `src/*`.

> **No Expo Go.** Auth uses `@react-native-firebase/*` and
> `@react-native-google-signin/google-signin`, which are native modules. The
> app only runs from a development build. See `docs/FIREBASE_SETUP.md`.

**Run:**
```bash
cd poojaappclone
npx expo prebuild --clean   # after changing app.json / native deps
npx expo run:android        # development build; Expo Go will not work
npm run lint                # expo lint
npx tsc --noEmit            # typecheck
```

**Routing** — `src/app/`:
- `_layout.tsx` — provider tree + `RootGate` (language → login → app) + a custom
  `ErrorBoundary` export (recoverable error screen; see §4). Providers, outer→inner:
  `GestureHandlerRootView > ThemeProvider > LanguageProvider > AuthProvider >
  AdminProvider > ContentProvider > RootGate`.
- `(tabs)/` — the 5 tabs: `index` (Home), `pooja` (aarti experience), `temples`,
  `bhajan`, `profile`. Tab bar is the custom `src/components/app-tabs.tsx`.
- Root stack sub-screens: `chadhava`, `darshan`, `journal`, `temples-map`,
  `alarm`, `ringtone`, `wallpaper`, `gallery`, `knowledge`, `booking`.

**Structure** (DESIGN.md §13): `src/app/` is **route shims only** (each file imports
a `*Screen` from `src/features/<name>/`); every screen lives in its feature folder
with `components/`, `hooks/`, `lib/`, `constants/` as it needs. Features: alarm,
astrologer-mode, astrologers, auth, bhajan, booking, call, chadhava, darshan, festivals,
gallery, help-support, home, horoscope, journal, knowledge, my-poojas, panchang, pooja,
profile, ringtone, saved-temples, temples, temples-map, wallet, wallpaper.
Shared: `components/ui/` (the kit), `components/illustrations/` (murti, thali, scenes),
`theme/` (tokens — the only theme), `providers/`, `i18n/`, `lib/`, `hooks/`,
`constants/` (config + defaults). Notable splits: `features/auth` (AuthGate →
LanguageScreen / LoginScreen / CreateProfileScreen; derived-step, DOB-overlay and
SMS-Retriever rules are in its hooks' docblocks; pure logic in `lib/` with tests),
`lib/api/` (client + one file per domain, `index.ts` re-exports everything so
`@/lib/api` is unchanged), `components/ui/card/` (one file per component) and
`components/ui/icon-glyphs.tsx` (the 31-glyph drawing table behind `Icon`).
**A feature may not deep-import another feature**
(ESLint `no-restricted-imports` enforces it; import its `index.ts`).

**Providers** — `src/providers/` (and `src/i18n/`; the old `src/context/` is gone):
- `i18n/` — EN/Hindi. `t()` + `STRINGS.{en,hi}`, each split into 14 topic files with
  identical names; `i18n.test.mjs` fails if the two trees' key sets differ.
  **Add keys to BOTH.**
- `providers/auth` — **Firebase Auth** session. Driven by `onAuthStateChanged`; on
  every sign-in it POSTs the ID token to `/api/auth/sync` and keeps the
  returned profile (now with `role` and `astrologer`). Shows the cached profile
  first and reconciles in the background, so a cold start never waits on the
  network. Exposes `needsProfile` (verified but unnamed → Create Profile; never
  true for an astrologer) and `authError` (`err_blocked`). Providers live in
  `src/lib/firebase-auth.ts` (OTP + Google) and `src/lib/api/` (`authedFetch`,
  which attaches the token and retries once on 401 with a fresh one).
- `providers/admin` — **feature flags** + local analytics. Loads cached flags, then
  `GET /api/flags` and merges (known keys, coerced to bool); flags fall back to
  `DEFAULT_FLAGS` (all `true`) when the backend is unreachable. (The old payment
  analytics event was removed with the dummy checkout.)
- `providers/content` — fetches `GET /api/content` and exposes remote deities/temples/
  aartis/**festivals** + `upcomingFestivals(n)` (admin calendar first, bundled
  list as fallback), `templeRating(slug)` (undefined unless a real rating is
  entered), `deityImage(id)` / `deityArt(id)` (dashboard artwork; no upload
  means the procedural murti) and `toneSound(slug)`. `assetUrl()` resolves
  host-relative `/uploads/..` paths. Per-resource logic is in `providers/content/resources/`.
- `providers/wallet` — the live coin balance (`useWallet()`).

**Backend URL:** `src/constants/config.ts` → `ADMIN_API`. See §3 for the
reachability rules — this is the #1 source of "it doesn't work on the phone".

---

## 2. The backend — `pooja-api/`, and the dashboard — `pooja-admin/`

**Three projects, not two.** The server used to live inside `pooja-admin/`,
which made the phone app's backend a subfolder of the admin tool: the app
could not be served unless the dashboard was running, and locking the
dashboard down locked the app out. They are separate concerns over one
MongoDB, and now separate deployables.

- `pooja-api/` — Express + Mongoose. Serves BOTH surfaces, gated: the app's
  endpoints are the allowlist in `middleware/access.js`, everything else needs an
  operator session. This is the only thing that talks to MongoDB.
- `pooja-admin/` — a static React/Vite site that calls that API. It serves
  nothing itself.

**Cross-origin is the catch.** In dev Vite proxies `/api`, so the two share
an origin and the default `SameSite=Strict` session cookie works. Deployed,
the dashboard is its own site, and Strict means the browser never sends the
cookie — sign-in looks fine and every call after it 401s. Production needs
`SESSION_SAMESITE=None` (which forces `Secure`, so HTTPS) and `CORS_ORIGIN`
set to the dashboard's exact URL, never `*`: the browser refuses a wildcard
origin on a credentialed request.

**Stack:** Express + Mongoose + MongoDB, React + Vite, multer for uploads.
ESM throughout.

```
pooja-admin/
├── package.json        one package for both halves
├── vite.config.js      builds src/client → dist/, proxies /api in dev
├── index.html          Vite entry
├── src/client/         the dashboard UI
├── scripts/            check-deps.mjs (runs in `npm run build`)
└── dist/               built static site (gitignored)
```

**Run (needs MongoDB on `:27017`) — two terminals:**
```bash
cd pooja-api   && cp .env.example .env && npm install && npm run dev   # :4000
cd pooja-admin && npm install && npm run dev                           # :5173, proxies /api
```
The dashboard is at http://localhost:5173. Building it for a deploy needs
`VITE_API_BASE` — it is baked in at build time, so changing the API's URL
is a rebuild, not a restart.

`npm start` is the one to use unless you are editing the dashboard UI. In dev,
Vite proxies `/api` and `/uploads` to :4000, so the client always calls its own
origin — `api.js` has no absolute base URL any more.

**Server** — `pooja-api/src/` (DESIGN.md §14; one folder per feature):
- `index.js` is a 2-line entry (`render.yaml` runs `node src/index.js`); `server.js`
  boots (connect → seed → listen); `app.js` assembles Express in a fixed order
  (CORS → body parser → `/uploads` → `/api/auth` → open feature modules → **the gate**
  → admin routers → error handler). There is deliberately **no `GET /` handler**.
- `config/env.js` reads and normalises the environment once; `config/cors.js` holds
  the origin policy (never reflect an arbitrary origin AND allow credentials in prod).
- `middleware/require-auth.js` — verifies the Bearer Firebase ID token (503 if no key,
  403 if blocked) and attaches `req.token`, `req.user`, `req.role`.
  `middleware/access.js` — **the gate**: `PUBLIC` allowlist (fail-closed) + role
  permissions (`access/permissions.js`, `access/routes.js`: every admin path maps to an
  *area*; GET needs `<area>:view`, writes need `<area>:edit`; an unmapped path is
  admin-only). A new `/api` route is private unless added to `PUBLIC`; a new admin route
  needs an entry in `access/routes.js` (a test enumerates every route and fails without).
- `models.js` is a 27-line **barrel** over per-module `*.model.js` files (so
  `import {…} from '../models.js'` still works) plus `DEFAULT_FLAGS`.
- `modules/<feature>/` — `auth` (+`firebase.js`), `operators` (login/session/CRUD,
  lockout refusals), `users` (devotee admin; the old `POST /users` answers 410),
  `flags`, `analytics`, `announcements`, `policies`, `content` (generic CRUD factory
  + `resources/*`, `seed-content.json`), `horoscope`, `panchang`, `media` (GridFS in
  `files.js`), `public` (`GET /content`), and the coin/astrologer modules in §4b.
  Each exports `routers(...)`/`seed()`/`start()` where it has them (`modules/index.js`).
- `db/connect.js` + `db/seed.js` (runs each module's idempotent seed; never overwrites
  operators' edits). `lib/` — `http-error`, `settings`, `coin-pack`, `async-handler`.
  `health.js` — `/api/health` (reports `commit`).

**Client** — `pooja-admin/src/client/` (DESIGN.md §15):
- `main.jsx` mounts the providers; `app/` = `App` (session gate → `Login` or
  `AdminShell`), `AdminShell`, `Sidebar`, `NavItem`, `ApiStatus`, `providers`
  (Toast + Confirm), and **`tabs.js`**, the single ordered tab registry
  (`tabsFor(isAdmin)`; add a tab by adding one object).
- `features/<name>/` — overview, flags, coin-orders, visitors, operators, users, policies,
  login, horoscope, content, offerings, astrologers, coins, calls, bookings, poojas, chadhava, home-layout, home-slider (the "Home slider" tab: slides under Home's search bar; docs/POOJA_AND_HOME.md §1b). Each has a
  `*Page.jsx` container, `components/`, `hooks/`, `lib/`, `index.js`.
  - `features/content/` — `ContentManager` (container) with `components/` (toolbar,
    table, row, row actions, edit modal, `fields/*` registry), `useContentResource`, and
    `resources/*` (the per-resource field configs). **The modal is the only place content
    is written.**
  - `features/horoscope/` — twelve rashi cards for one day, 7-day strip, **Copy previous
    day**; its modal is the only place a reading is written; "Show all dates" falls back to
    the content table.
  - `features/operators` is **dashboard** accounts (admin-only), distinct from
    `features/users` = **devotees** (they sign in to the app with Firebase; no access here).
- `ui/` — the kit, **used by every screen** (Button, IconButton, Switch, Badge, Modal,
  ConfirmDialog, Toast, Field/FileField/ReadoutField, Card, StatCard, DataTable,
  EmptyState/ErrorState, Banner, Skeleton, ProgressBar, ViewOnly pieces). One look: maroon
  primary, 44px controls, kit modals (`md` 720 / `sm` 440). `styles/` — `tokens.css` (roles),
  `ui.css` (`ui-*` kit classes), `features.css` (feature layout: horoscope tiles, markdown
  split, flags, coins…), `shell.css`; `styles.css` holds only the shell/sidebar, login and
  the Overview chart. There is no `.btn`/`.modal`/`.pill`/`.toggle`/`.panel` any more; new
  screens compose the kit. Native `confirm()`/`alert()` are not used.
- `lib/api/` (`client.js` req + credentials + `Unauthorized`; `resources.js`; `index.js`;
  `src/client/api.js` is a re-export shim), `lib/hooks/`, `lib/dates.js`, `lib/money.js`.
  **Same-origin by default**; `api.asset(url)` resolves relative upload paths.
- **`npm run build` runs `scripts/check-deps.mjs` first**: `ui/` and `lib/` may not import
  `features/` or `app/`, `features/` may not import `app/`, and one feature may reach
  another only through its `index.js`.

## 3. How the two connect (READ THIS before debugging "flags/content don't apply")

The app calls the admin backend at `ADMIN_API`:
- `GET /api/flags` → `{flags:{key:bool}}` — drives which Home feature cards show.
- `GET /api/content` → `{deities,temples,aartis}` — remote content + deity images.
- `POST /api/auth/sync` — creates/refreshes the account. **Authenticated**
  (`Authorization: Bearer <Firebase ID token>`), and the only way an account
  comes into being. Identity is read from the verified token; the body only
  carries `name`, `bio`, `deviceId`.
- `POST /api/ingest/*` — analytics.

**The flags/content/analytics calls are best-effort.** If the backend is unreachable, the app silently
falls back to defaults (**all flags on**) / bundled content. So the classic bug
"I disabled a flag in the admin but the app still shows it" is almost always
**the phone can't reach the backend**, not a logic bug. Verified end-to-end: when
the app *can* reach the backend, flags apply correctly (a disabled flag hides its
Home card via `FEATURES.filter(f => flags[f.flag])`).

**Reachability — two modes:**
1. **USB (most reliable, current default).** `ADMIN_API = http://127.0.0.1:4000`
   plus, once per session:
   ```bash
   adb reverse tcp:4000 tcp:4000   # backend
   adb reverse tcp:8081 tcp:8081   # Metro
   ```
   Works regardless of Wi-Fi/cellular.
2. **Wi-Fi.** Set `ADMIN_API` to the Mac's LAN IP (`ipconfig getifaddr en0`),
   phone on the SAME network. Breaks if the phone drops to cellular.

**Auth is the exception to the best-effort rule.** Sign-in needs both Firebase
(to verify the credential) and the backend (to create the row). If the backend
is unreachable *after* Firebase succeeded, the app still lets the devotee in on
a cached profile — but a brand-new account cannot be created offline.

Uploads are stored **host-relative** (`/uploads/x.png`); both clients resolve them
against their own base (`assetUrl()` in the app, `api.asset()` in the dashboard),
so the same stored value works from any host.

**Note:** disabling the `bhajan` flag hides the Home *card* but NOT the Bhajan
*tab* — the tab bar in `app-tabs.tsx` is not flag-gated.

---

## 4. What was done in the most recent work

**The app is called Bhakti.** `expo.name`, the Android `app_name`, the
dashboard's masthead and the policy preamble. The `slug` and `scheme` moved
to `bhakti` with it; the Android **package stays `com.poojaapp.poojaapp`**,
because `google-services.json` and the registered SHA-1 are keyed to it and
changing it would break sign-in for no gain.

**Its icon is a gold ॐ on a maroon plate**, generated rather than sourced:
the glyph is Noto Sans Devanagari (SIL OFL 1.1, which places no restriction
on rendered output) and the plate is a gradient, so there is nothing to
attribute and nothing to license. The generator and the measured glyph
metrics are in the session scratchpad, not the repo — regenerating is a
matter of re-rendering one `<text>` element, and the ink of ॐ sits high and
left of its em box, so it has to be centred by its **rasterised bounds**,
not by font metrics.

**All bundled media is gone** — see the rules in §5. The sanctum bell, the
aarti ambience, every bhajan and every murti now come from the dashboard,
and `modules/expo-alarm` streams a tone URL instead of looking up a raw
resource.

**Everything the devotee reads or pays is now admin-managed.** Sevas and
prices, FAQs, deity lore, Home carousel slides, temple palettes and map pins,
and a key/value Settings table (prasad fee, support contacts). Each falls
back to the bundled catalogue when the backend is unreachable, and each is
seeded from what the app used to hardcode, so a fresh database matches the
bundle exactly. The darshan banner now reads the live `Announcement` the
backend already had, instead of one i18n string shown on every temple forever.
Verified end to end: changing Archana from ₹251 to ₹333 in the dashboard
showed ₹333 in the app on next launch, no rebuild.

**Config moved to `.env`** — `EXPO_PUBLIC_ADMIN_API` and the
`EXPO_PUBLIC_SUPPORT_*` set join the Google client id. The literals in
`constants/` are now development defaults only.

### Earlier in this session
**Wallpapers set the wallpaper.** The screen used to save a PNG to the gallery
and tell the devotee to finish the job in Settings. `modules/expo-wallpaper`
is a local Expo module (≈70 lines of Kotlin on `WallpaperManager`) exposing
home / lock / both; every community package for this was last published in
2022–23, before the New Architecture. Saving to the gallery remains as the
secondary action.

**Toasts replaced `Alert` for anything without a choice.** 18 alerts drew the
platform's grey Material dialog over a sanctum-themed app, modal, for messages
nobody needed to acknowledge. `components/ui/toast.tsx` is the in-app
replacement — themed, queued, self-dismissing, screen-reader announced, and
positioned **top** because nearly every screen here ends in a full-width CTA
that a bottom toast landed on. `Alert` still handles the three real questions
(cancel a booking, booking confirmed → where next, the logout menu).

**Live darshan actually streams.** `liveUrl` on a temple, set from the
dashboard. A YouTube link plays through the IFrame API in a WebView; anything
else (HLS `.m3u8`, mp4) plays natively via `expo-video`. No URL means no
stream: still artwork, no LIVE badge.

**Admin server and client merged into one app** — see §2.

**Hardcoded content swept out.** Darshan claimed "LIVE" over a still with
"15.4K views / 2.1K likes / 950 shares", all invented, and hardcoded "Kashi
Vishwanath" regardless of the dashboard. Support contacts were
`support@shrimandir.devotee` (not a real TLD — every message bounced) and a
dialable vanity number somebody else may own; both are now configured via
`constants/support.ts` and the action is hidden when unset.

**Deity artwork replaced.** The bundled renders carried a visible "pngtree"
watermark the project had no licence to. Now public-domain Ravi Varma Press
oleographs from Wikimedia Commons, plus the two deities that were missing
entirely. Screens read them through `useContent().deityArt(id)`, so
dashboard-uploaded art wins and the bundle is the offline fallback.

### Earlier in this session
**App-wide audit and fixes** (on top of the Firebase work below).

- **Journal was losing everything.** Count, gratitude and notes were plain
  `useState`; Save only raised an alert. Now persisted per day in
  `src/lib/journal.ts` (AsyncStorage, local-date keys, debounced autosave).
  The week strip was decorative too — the month read a hardcoded `OCT 2023`,
  and the arrows, day cells and calendar button had no handlers. All live now;
  dots mark days that actually have an entry, future days are disabled, and
  the counter starts at 0 instead of a demo 108.
- **Festivals had expired.** Every bundled date fell before the current day,
  so `upcomingFestivals()` returned nothing and Home's "Upcoming Vrat &
  Festivals" rendered blank. Festivals are now a content type managed from the
  dashboard (`Festival` model, `/api/content/festivals`, served in
  `/api/content`), the app prefers that over the bundled list, and both the
  section and the new `/festivals` screen show an empty state. "See all dates"
  had `footerLabel` but no `onFooter` — a dead tap target — and now opens that
  screen.
- **`ArchImage` drew nothing on Android.** It filled itself with an absolutely
  positioned `<Image>` inside a view combining `overflow:'hidden'` with a large
  corner radius, which Android clips away entirely. Deity art was missing on
  Home, Knowledge, Gallery and Darshan. Fixed by laying the image out normally.
- **Invented social proof.** Every temple card printed the same hardcoded
  "4.9 stars (25k reviews)" from a single i18n string. Rating and review count
  are now per-temple fields on the dashboard, and the row is hidden entirely
  unless a real one is set.

### Firebase Authentication
**Replaced the dummy sign-in with Firebase Authentication.**

- **App:** phone **OTP is real** — Firebase sends the SMS and verifies the code
  server-side; the app never sees it. The old on-device `demoOtp` (and the red
  "Demo OTP" hint) is gone, and with it the hole where anyone could type a
  stranger's number and read the code the app had just shown them. The Email
  button became **Continue with Google** (native account picker), since Google
  already supplies a verified email and name. Codes are now **6 digits**.
- **Backend:** `requireAuth` verifies the ID token with `firebase-admin` on
  every authenticated call — signature and expiry, locally, against cached
  Google certs. `POST /api/users` (which accepted any `{contact, name}` from
  anyone) answers **410 Gone**.
- **User model:** keyed by Firebase `uid` (unique, sparse) with `contact` kept
  as the human-readable handle. A pre-Firebase row is **adopted** by `contact`
  the first time its owner signs in for real, rather than colliding with it.
- **Blocking works now.** It used to be a flag nothing read. Blocking returns
  403 on every authenticated call (the app signs out with "This account has
  been blocked") *and* revokes the Firebase refresh tokens; deleting a devotee
  deletes the Firebase account too.
- **Secrets:** `.env` was tracked in git — untracked, and `.env`,
  `google-services.json` and `firebase-service-account.json` are now ignored.

**Setup is not optional:** without a Firebase project the app cannot sign
anyone in. See `docs/FIREBASE_SETUP.md`.

### Before that

- **Admin content management:** deity/temple/aarti CRUD with image/audio upload,
  seeded from the app's data. **User management:** list/block/delete; users appear
  after they sign in on the app.
- **App ↔ admin integration:** `ContentProvider` consumes `/api/content`;
  admin-managed **deity images override** the bundled murti (matched by slug =
  app deity id: `shiva, shani, vishnu, ganesh, hanuman, durga, lakshmi, krishna`).
- **Host-portable uploads:** switched from absolute (localhost-baked) to
  host-relative URLs + resolvers on both sides.
- **Robustness:** custom `ErrorBoundary` in `app/_layout.tsx` (Expo Router picks up
  the named export) turns any render crash into a recoverable screen instead of a
  white/blue fatal; hardened the remote-flags merge (known keys → booleans).
- **Diagnosed the "flags don't apply" report:** root cause was backend
  unreachability (phone on cellular), not app logic. Documented in §3.

## 4b. Coins and astrologer calls (built; read `docs/COINS_AND_ASTROLOGERS.md`)

**Coins are the only in-app currency.** Seva/pooja booking, e-Chadhava, the prasad
delivery fee and astrologer calls all spend coins; Razorpay is used only to *buy*
coins. 1 coin = ₹1 base value. The API is the authority: it prices every spend from
the database, debits the wallet and records the order in one step, with a
client-generated `requestId` so a retry never double-charges.

- **API modules** live in `pooja-api/src/modules/<name>/` (wallet, coins, bookings,
  chadhava, astrologers, calls, payouts), mounted by `modules/index.js` — open routes
  *before* the admin gate, dashboard routes after it under `/api/admin/...`.
  `wallet.service.js` is the **only** code that may change a balance (append-only
  `WalletTxn` ledger, atomic conditional update, no DB transactions needed).
  Errors are `{ error, code, ...extra }` (e.g. `402 insufficient_coins` + `shortfall`).
- **Coin packs**: an operator sets *coins* and *price*; extra coins and the "N% EXTRA"
  label are derived (`src/lib/coin-pack.js`, copied byte-for-byte to
  `pooja-admin/.../features/coins/lib/coin-pack.js`, parity-tested). Keep both in sync.
- **Astrologers** are added in the dashboard with a sign-in email or mobile; they sign
  in like any devotee and `POST /auth/sync` claims the invite (provider-verified
  identifier only), sets `role: 'astrologer'`, and the app shows the astrologer shell
  (no Create Profile). Calls bill per started minute via a restart-safe ticker.
- **Dev modes**: `PAYMENTS_PROVIDER=mock` and `RTC_PROVIDER=mock` work with no
  accounts and are **refused in production**. Real Razorpay / Agora need keys plus
  native modules in the app — see `docs/PAYMENTS_SETUP.md` and `docs/CALLS_SETUP.md`.
  **The app has no native payment/voice SDK installed**; installing them needs a
  prebuild and was not testable here.
- **Tests**: `node --test <file>` per module (`*.test.mjs`, need a local `mongod`;
  `--test-concurrency=1`; `node --test <dir>` finds nothing on Node 25). Use
  `PATH=/opt/homebrew/bin:$PATH` (default node is too old).
- **Not yet verified on a device**: real two-way audio, the Razorpay sheet, background
  incoming calls (the astrologer app only receives calls while foregrounded — no push).

## 4c. Pooja Seva, Chadhava and the dashboard-driven Home (built; read `docs/POOJA_AND_HOME.md`)

- **Home is data.** `GET /api/content` returns `home.sections` (ordered, schedule-filtered) and an extended
  `hero`; the app (`features/home`) dispatches on each section's `source` and falls back to a bundled default
  layout (`features/home/constants/default-layout.ts`) when the API is unreachable. A hero slide is a banner
  image **or sanitised HTML**: the API cleans it on save *and* on read (`modules/home/html-sanitizer.js`), the
  app shows it in a JS-off WebView and routes taps itself (`bhakti://route`, https only), the dashboard previews
  it in a sandboxed iframe. Never render stored HTML any other way.
- **Poojas replace sevas.** A `Pooja` (modules/poojas) carries embedded `packages[]` (persons + coins); a
  booking sends package key + one name/gotra per person and **never a price**. `import-sevas` migrates old
  sevas (blank temple = offered at every temple, so the temple filter includes them).
- **Chadhava is priced offerings** (`ChadhavaListing.offerings[]`, orders computed from the DB); the old
  free-amount `POST /api/chadhava` answers 410.
- **Reviews** exist only for performed bookings and can be hidden, never edited; ratings/counts show only
  when real.
- Dashboard tabs: Home layout (shelves only), Home slider, Poojas, Chadhava, Bookings (+ Reviews). Content tabs are
  `content` (editor writes); bookings/reviews are `orders` (status/hide need `orders:edit`).
- Testing the app against a local API: run the API on a throwaway mongod (`MONGODB_URI=… PORT=4400
  PAYMENTS_PROVIDER=mock`), `adb reverse tcp:4400 tcp:4400`, and start a **separate** Metro
  (`EXPO_PUBLIC_ADMIN_API=http://127.0.0.1:4400 npx expo start --dev-client --port 8082`) so the normal one on
  8081 is untouched; open it with `exp+bhakti://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082`.

## 5. Gotchas / conventions

- **Expo 57**: consult the versioned docs; APIs differ from older Expo.
- **No Expo Go** — auth is native. `npx expo prebuild --clean && npx expo run:android`.
  `android/` is generated and gitignored, so `--clean` is safe.
- **Firebase project is `pooja-app-aa462`; Android package is
  `com.poojaapp.poojaapp`.** The app's `google-services.json` and the server's
  service-account key must be from the same project — otherwise every token is
  rejected on `aud`. The API prints its project on boot and names both on a
  mismatch.
- **Google Sign-In wants the _web_ client id** (`client_type: 3`), not the
  Android one, and the debug **SHA-1 must be registered** in Firebase.
  No `client_type: 1` in `google-services.json` = no SHA-1 registered yet.
- **The debug keystore is `android/app/debug.keystore`, NOT
  `~/.android/debug.keystore`.** Expo's template ships its own and
  `app/build.gradle` signs with it. Registering the Android Studio keystore's
  fingerprint looks right in the console and still fails, with
  `[GetTokenResponseHandler] This android application is not registered to use
  OAuth2.0`. Verify against the APK itself:
  `apksigner verify --print-certs app-debug.apk | grep -i SHA-1`.
- **`prebuild --clean` deletes `android/local.properties`** — Gradle then
  fails with "SDK location not found". Export `ANDROID_HOME` or rewrite it.
- **Node ≥ 20.19.4 is required** (nvm default here is v20.1.0, too old).
  Reading `poojaappclone/.env` needs `util.parseEnv`, so an old Node makes
  prebuild die with `parseEnv is not a function`. Use `/opt/homebrew/bin`.
- **Reminders are a list the devotee owns, not a fixed five.** The bundled
  daily cycle lives in `constants/reminders.ts`, but `useReminders()` returns
  `reminders` — the bundle minus a `removed[]` tombstone list, plus the
  devotee's own `custom[]`, each with its time override already applied.
  Render and schedule from THAT, never from `REMINDERS`: `sync` reading the
  constant directly would keep firing a deleted reminder. Deleting a bundled
  one is a tombstone because it lives in code and would otherwise return on
  next launch, which is why "Restore the daily cycle" exists.
- **A stepper's granularity is the app's.** The alarm minute stepper moved by
  five and there was no other way in, so 4:33 was simply unreachable. It
  steps by one now and the hour/minute are typed into real fields with an
  AM/PM toggle. Reach for a text field before a finer stepper.
- **Android may auto-verify an OTP** (SMS Retriever) — the login screen can
  unmount mid-countdown without anyone typing. That is not a bug.
- **Never trust identity from a request body.** `uid`, phone and email come
  from the verified token; the body carries only `name`, `bio`, `deviceId`.
- **reanimated 4.5.1 must match react-native-worklets 0.10.1** — a mismatch causes
  a native `libworklets.so` SIGSEGV. Use `npx expo install --fix` to align.
- **i18n**: every user-facing string goes through `t()`; add keys to `en` AND `hi`.
- **Bottom-bar clearance**: screens pad content by `insets.bottom + 72` (safe area).
- **Device testing quirks**: `adb input swipe` is unreliable for RN gestures;
  headless Chrome can't advance the Reanimated timeline. Screenshot the device with
  `adb exec-out screencap -p > out.png`. Expo Go's deep-link launch
  (`am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent`)
  is ~50% reliable — retry until logcat shows `Running "main"`.
- **Content belongs in the dashboard, not the bundle.** Sevas and their
  prices, FAQs, deity lore, Home carousel slides, temple palettes/map pins
  and loose settings (fees, support contacts) are all admin-managed, each
  with the bundled catalogue as the offline fallback. A price that needs a
  store release to change is a liability, not a constant.
- **Config belongs in `.env`.** `EXPO_PUBLIC_ADMIN_API`,
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_SUPPORT_*`. The literals
  left in `constants/` are development defaults, not deployment values.
- **Never hardcode dates that expire.** The festival list did, ran dry, and
  Home silently rendered an empty section. Lunar-calendar dates belong in the
  dashboard; the bundled array is only an offline fallback, and every screen
  that renders it needs an empty state.
- **`overflow:'hidden'` + big corner radius clips absolutely positioned
  children on Android.** That is what made `ArchImage` render its background
  and label but no image. Lay children out normally inside rounded, clipped
  containers.
- **No media ships in the app.** Not artwork, not audio. The bundle used
  to carry eight deity oleographs and two sound files, which made it a
  second source of truth the dashboard could not correct without a store
  release. `assets/images/` is now icons and UI chrome only, and there is
  no `assets/audio/` at all.
- **Uploaded media lives in MongoDB, in GridFS** (`modules/media/files.js`, bucket
  `media`), not on the filesystem. Render's container is wiped on every
  deploy and the free plan cannot mount a disk, so a filesystem upload was
  guaranteed to disappear — and once the app shipped no media of its own,
  that was the entire sanctum. Things worth knowing:
  - The URL shape did **not** change: still host-relative
    `/uploads/<id>.<ext>`. Every row already stored keeps resolving, and
    `assetUrl()` / `api.asset()` needed no edit.
  - `/uploads` is served **outside `/api`**, so the gate does not apply —
    deliberate, because the app fetches media with no session.
  - The route answers **Range requests**. Android's `MediaPlayer` (the
    alarm) and `expo-audio`'s seek both need them; without 206 every seek
    re-downloads from the start. Verified for prefix, suffix and
    unsatisfiable ranges.
  - **Content-Type is inferred from the extension** when the browser says
    `application/octet-stream`, because MediaPlayer picks its decoder from
    that header and silently fails on a generic one.
  - Files are immutable (a re-upload gets a new id), hence
    `Cache-Control: immutable` plus an ETag.
  - `npm run migrate:media` moves anything still on disk and rewrites the
    documents that referenced it. Idempotent; `--dry-run` previews both
    halves. The old `uploads/` directory is still served as a fallback
    until then.
  - **Not solved: orphans.** Replacing a deity's artwork leaves the old
    file in GridFS. `DELETE /api/content/upload` with `{url}` removes one,
    but nothing calls it automatically — reference-counting across every
    content type is a bigger job than this was.
  - Storage is now the database's problem: **Atlas M0 is 512MB** for
    documents and media together.
- **Read deity art via `useContent().deityArt(id)` / `deityImage(id)`,**
  never a bundled map — there is none. No upload means the **procedural
  murti**, which is drawn from plain Views and needs no assets, so an
  unfilled dashboard still renders a sanctum.
- **Audio is a URL from the dashboard.** `useContent().toneSound(slug)` for
  an alert tone, `aarti.audioUrl` for a bhajan. Three consequences worth
  knowing:
  - An **Android channel sound must be a file bundled with the app**, so the
    notification fallback can only ask for the device default. The tone the
    devotee chose is played by `modules/expo-alarm`, which streams it.
  - `MediaPlayer.prepare()` on a URL **blocks**, and `AlarmService` runs on
    the main thread — remote tones use `prepareAsync`. Do not "simplify"
    that back.
  - An alarm can land with no connection, so the native side falls back to
    the phone's own alarm sound rather than ringing silently.
  - Seeded tones carry `sound: null` until someone uploads a recording.
    Until then the sanctum bell and the aarti ambience are **silent** —
    that is the honest empty state, not a bug.
- **Toasts, not `Alert`, for anything the devotee cannot answer.**
  `useToast()` / `toast.success|error|info`. Keep `Alert` for real choices.
- **`modules/expo-wallpaper` is a local native module** — changing its Kotlin
  needs a rebuild, not a Metro reload. Autolinking picks it up at prebuild.
- **One way to write a thing.** The Horoscope tab briefly had two editors —
  a twelve-sign grid on the page *and* the table's modal — which read as
  clutter and left two code paths to keep in step. Readings are written only
  through the modal now; the bar above it picks the day and copies the
  previous one. `GET|PUT /api/horoscope/day/:date` still backs the copy, and
  a sign left blank is **deleted**, never stored empty.
- **Scope tables that grow per day.** Horoscopes are twelve rows a day
  forever, so the table shows one day unless "Show all dates" is ticked.
  Without that, today's twelve are buried in everything ever published.
- **Don't invent social proof.** Ratings, review counts and the like are real
  data or they are hidden — `templeRating()` returns undefined rather than a
  default, and the row disappears.
- **Hardening in place (found by a security review; each has a regression test in
  `pooja-api/src/security.test.mjs`).** Uploads accept only an extension allowlist (no SVG/HTML),
  the stored type comes from the extension — never the browser — and `/uploads` is served with
  `nosniff` + `Content-Security-Policy: sandbox`. There is **no public payment ingest**; the two
  remaining public ingest routes take bounded strings only. `POST /policy/:key/accept` needs a
  Firebase token and uses its uid. `POST /admin/login` is throttled (10 failures per client+user,
  40 per client, per 15 min → 429) and refuses passwords over 256 chars; in production the gate
  answers **503 rather than opening** if no active operator exists. Behind Render, `trust proxy`
  is set so `req.ip` is the real client.
- **Google sign-out needs `configure()` first.** `GoogleSignin.signOut()` rejects with "apiClient
  is null" in a process where `configure()` has not run, so a logout after an app restart used to
  leave Google's session alive and the next "Continue with Google" signed straight back in as the
  same account (no chooser). `firebaseSignOut()` now configures first. Found on a real device.
- **Three roles: `admin`, `editor`, `viewer`** (DESIGN.md §21). Permissions are
  `<area>:view|edit` strings defined once in `pooja-api/src/access/permissions.js`;
  `GET /api/admin/session` returns them and the dashboard derives everything from that list
  (`useAccess()`, `<Can>`, tab `area` in `app/tab-areas.js`; no component checks a role name —
  `scripts/check-access.mjs` fails the build if one does). Editors edit content, horoscope,
  panchang and announcements and can only *view* everything else except devotees, operators
  and push; viewers are read-only. **Without edit rights actions are hidden and forms are
  read-only** ("View only"). Devotee names/phones/emails and astrologers' sign-in identifiers
  are **masked in the API response** (`Devotee ••4821`) for roles without access; editors also
  cannot change money-affecting rows in the generic settings table. Set
  `ADMIN_SESSION_SECRET` in real deployments or the masking pseudonyms change on every
  restart. Every successful operator write is recorded in `AuditLog` (admin-only
  `GET /api/admin/audit-log`).
- **`ADMIN_PASSWORD` only bootstraps the first admin** on an empty operator
  collection. Changing it later does nothing; passwords are changed in the
  Operators tab. Locked out? Delete the operator rows and restart.
- **Operator ≠ User.** `Operator` is a dashboard login (scrypt hash, role).
  `User` is a devotee keyed by Firebase uid. Never let one become the other.
- **The admin API is fail-closed.** A new `/api` route is private unless you
  add it to `PUBLIC` in `pooja-api/src/middleware/access.js`. If the app starts getting 401s
  after you add an endpoint, that is why — and it is the safe direction to
  fail, because the alternative once exposed `DELETE /api/users/:id` (which
  deletes the Firebase account too) to the open internet.
- **CI deploys, Render does not.** `.github/workflows/ci.yml` runs the
  dashboard build + a real boot against a Mongo service container +
  `pooja-api/scripts/smoke.mjs`, and the app's typecheck/lint; only a green
  `main` triggers the Render deploy hook. `autoDeploy: false` in
  both Blueprints is what makes that the only path to production.
- **`scripts/smoke.mjs` is the gate's regression test.** It asserts the
  public endpoints answer 200 and every admin route answers 401, and it runs
  twice — against localhost in CI, then against the deployed URL. Run it by
  hand with `BASE=… ADMIN_PASSWORD=… npm run smoke`. Verified it fails (exit
  1, 12 findings) against a server booted with the gate off.
- **`/api/health` reports `commit`** (from `RENDER_GIT_COMMIT`). The deploy
  job polls for the pushed SHA rather than for a 200, because the old
  container keeps serving during a release and a plain health check passes
  against the version being replaced.
- **Deployment lives in `docs/DEPLOY.md`** — Render + Mongo Atlas, via
  `pooja-api/render.yaml` and `pooja-admin/render.yaml` — one Blueprint per
  service, neither at the repo root, so each needs its **Blueprint Path**
  set. Two things bite: uploads need a mounted disk
  (`UPLOAD_DIR`) or they are wiped on every release, and
  `EXPO_PUBLIC_ADMIN_API` is baked into the app bundle at build time, so
  pointing the app at the deployed API needs a rebuild, not a reload.
- **Feature flags default to ON when offline** — never assume a hidden feature
  means the flag is off; confirm the backend is reachable first.

---

## 6. Configuration and local services

**Every project has a `.env`, and a committed `.env.example` that lists
every variable it reads.** The `.env` files are gitignored; the examples
are the documentation, so a variable added in code belongs in its example
in the same commit.

| Project | `.env` holds | Notes |
|---|---|---|
| `pooja-api/` | `MONGODB_URI`, `CORS_ORIGIN`, `SESSION_SAMESITE`, Firebase key, `ADMIN_PASSWORD`, `MAX_UPLOAD_MB` | The only one with real secrets |
| `pooja-admin/` | `API_ORIGIN` (dev proxy), `VITE_API_BASE` (build) | Static site — nothing secret can live here, it ends up in the bundle |
| `poojaappclone/` | `EXPO_PUBLIC_ADMIN_API`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_SUPPORT_*` | `EXPO_PUBLIC_*` is embedded in the bundle, so none of it is secret |

Two that catch people out:

- **`EXPO_PUBLIC_*` is read at BUNDLE time.** Changing one needs Metro
  restarted, not just the app reloaded. Metro prints which it exported on
  boot (`env: export EXPO_PUBLIC_…`) — if a variable is not in that line,
  the app is not seeing it.
- **`API_ORIGIN` is the knob for pointing the local dashboard somewhere
  else.** Vite proxies `/api` and `/uploads` to it, so the browser still
  sees one origin and there is no CORS and no cookie problem.
  `VITE_API_BASE` is the build-time equivalent and is baked in, so
  changing it is a rebuild.

| Service         | Port  | Command                                    |
|-----------------|-------|--------------------------------------------|
| MongoDB         | 27017 | `mongod` (or brew service) — only if `MONGODB_URI` is local |
| API             | 4000  | `cd pooja-api && npm run dev`              |
| Dashboard       | 5173  | `cd pooja-admin && npm run dev`            |
| Metro (Expo)    | 8081  | `cd poojaappclone && npx expo start`       |

Sign-in additionally needs `poojaappclone/google-services.json` and
`pooja-api/firebase-service-account.json`, both from the SAME Firebase
project — see `docs/FIREBASE_SETUP.md`.
