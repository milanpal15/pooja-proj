# Pooja Project — Agent Handoff

Monorepo for a **Sri Mandir–style Hindu devotional mobile app** plus its **admin
dashboard**. Two independently-runnable projects that talk over HTTP.

```
pooja proj/
├── poojaappclone/     Expo / React Native app (the phone app)
├── pooja-admin/       Admin dashboard — Express API + React UI in ONE app
├── docs/              FIREBASE_SETUP.md (auth setup — read before debugging sign-in)
└── CLAUDE.md          includes this file via @AGENTS.md
```

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

**Contexts** — `src/context/`:
- `language.tsx` — EN/Hindi i18n. `t()` + `STRINGS.{en,hi}`. Add keys to BOTH.
- `auth.tsx` — **Firebase Auth** session. Driven by `onAuthStateChanged`; on
  every sign-in it POSTs the ID token to `/api/auth/sync` and keeps the
  returned profile. Shows the cached profile first and reconciles in the
  background, so a cold start never waits on the network. Exposes
  `needsProfile` (verified but unnamed → Create Profile) and `authError`
  (`err_blocked` when an admin blocked the account). Providers live in
  `src/lib/firebase-auth.ts` (OTP + Google) and `src/lib/api.ts` (`authedFetch`,
  which attaches the token and retries once on 401 with a fresh one).
- `admin.tsx` — **feature flags** + local analytics. On mount: loads cached flags,
  then fetches remote (`GET /api/flags`) and merges (known keys, coerced to bool).
  Posts session/screen/payment events to the backend. Flags fall back to
  `DEFAULT_FLAGS` (all `true`) when the backend is unreachable.
- `content.tsx` — fetches `GET /api/content` and exposes remote deities/temples/
  aartis/**festivals** + `upcomingFestivals(n)` (admin calendar first, bundled
  list as fallback), `templeRating(slug)` (undefined unless a real rating is
  entered) + `deityImage(id)` (admin-managed artwork overrides the bundled murti on
  the pooja screen). `assetUrl()` resolves host-relative `/uploads/..` paths.

**Backend URL:** `src/constants/config.ts` → `ADMIN_API`. See §3 for the
reachability rules — this is the #1 source of "it doesn't work on the phone".

---

## 2. The admin dashboard — `pooja-admin/`

**One app**, not two. Express serves the built React UI, so the dashboard and
the API share a process, a port, a `package.json` and a `node_modules`. It
used to be `client/` on :5173 and `server/` on :4000, started separately and
wired together with `VITE_API_BASE` + CORS.

**Stack:** Express + Mongoose + MongoDB, React + Vite, multer for uploads.
ESM throughout.

```
pooja-admin/
├── package.json        one package for both halves
├── vite.config.js      builds src/client → dist/, proxies /api in dev
├── index.html          Vite entry
├── src/server/         the API
├── src/client/         the dashboard UI
├── uploads/            multer's destination
└── dist/               built UI, served by Express (gitignored)
```

**Run (needs MongoDB on `:27017`):**
```bash
cd pooja-admin
cp .env.example .env && npm install
npm start          # builds the UI, then serves UI + API on http://localhost:4000
npm run dev        # Vite on :5173 (hot reload) + API on :4000, together
npm run seed       # optional demo analytics data
```

`npm start` is the one to use unless you are editing the dashboard UI. In dev,
Vite proxies `/api` and `/uploads` to :4000, so the client always calls its own
origin — `api.js` has no absolute base URL any more.

**Server** — `src/server/`:
- `index.js` — entry; mounts `/uploads`, the `/api` routers, then `dist/` and
  an SPA fallback. There is deliberately **no `GET /` handler**: it used to
  return an API banner, which shadowed the dashboard once the UI moved here.
- `firebase.js` — Firebase Admin init + `verifyIdToken`. Boots without a key,
  but then `/api/auth/*` answers 503 rather than trusting anyone. Also
  `revokeUser` / `deleteFirebaseUser`.
- `auth.js` — `requireAuth` (verifies the Bearer ID token, 403s blocked
  accounts) and `POST /auth/sync`, `GET|PUT /auth/me`.
- `models.js` — `Flag, Visitor, Event, Payment, Deity, Temple, Aarti,
  Festival, Seva, Knowledge, Faq, HeroSlide, Setting, User, Policy,
  Announcement` + `DEFAULT_FLAGS`.
- `db.js` — Mongo connect; seeds flags and default content only when empty.
- `routes.js` — flags, analytics, ingest, payments, visitors.
- `content.js` — generic CRUD for `/deities /temples /aartis /festivals
  /sevas /knowledge /faqs /hero /settings`,
  `POST /upload` (returns **host-relative** `/uploads/<file>`), `users`
  (dashboard list/update/delete — the old unauthenticated `POST /users` now
  answers **410 Gone**), `publicContent` (`GET /content`).

**Client** — `src/client/`:
- `App.jsx` — sidebar tabs: Overview, Feature Flags, Announcements, Rules,
  Deities, Temples, Aartis, Festivals, Sevas, Knowledge, FAQs, Home Slides,
  Horoscope, Panchang, Settings, Users, Payments, Visitors (hash-routed),
  plus the field config for each content type.
- `ContentManager.jsx` — generic CRUD table + edit modal; image/audio upload.
  **The modal is the only place content is written.** Optional props:
  `filterRows` (scope the table), `scopeNote` (what the count describes),
  `onChange` (fired after a write so a sibling can restate itself).
  A field may carry `type:'date'` (real picker) and `default()`.
- `HoroscopeCopyDay.jsx` — the Horoscope tab's day bar. Picks the day the
  table below is scoped to, counts how much of it is published, and seeds it
  from the day before. It does **not** edit readings; see §5.
- `Users.jsx` — user list with block/unblock/delete.
- `api.js` — API client. **Same-origin by default**; `api.asset(url)` resolves
  relative upload paths.

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
- **Deity artwork is public-domain Ravi Varma Press oleographs** (JPEG, in
  `assets/images/deities/`, provenance in `ATTRIBUTION.md`). They replaced
  watermarked stock renders the project had no licence to ship. They are
  opaque rectangles rather than transparent cutouts, so screens render them
  with `contain` over their own backdrop.
- **Read deity art via `useContent().deityArt(id)`,** never `DEITY_IMAGES`
  directly. Dashboard-uploaded artwork wins; the bundle is the offline
  fallback. Six screens used to read the bundle directly and so ignored the
  dashboard entirely.
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
- **Feature flags default to ON when offline** — never assume a hidden feature
  means the flag is off; confirm the backend is reachable first.

---

## 6. Local services (when running)

| Service            | Port  | Command                                   |
|--------------------|-------|-------------------------------------------|
| MongoDB            | 27017 | `mongod` (or brew service)                |
| Admin API          | 4000  | `cd pooja-admin/server && npm run dev`    |
| Admin dashboard    | 5173  | `cd pooja-admin/client && npm run dev`    |
| Metro (Expo)       | 8081  | `cd poojaappclone && npx expo start`      |

Sign-in additionally needs `poojaappclone/google-services.json` and
`pooja-admin/server/firebase-service-account.json` — see `docs/FIREBASE_SETUP.md`.
