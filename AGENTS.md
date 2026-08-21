# Pooja Project — Agent Handoff

Monorepo for a **Sri Mandir–style Hindu devotional mobile app** plus its **admin
dashboard**. Two independently-runnable projects that talk over HTTP.

```
pooja proj/
├── poojaappclone/     Expo / React Native app (the phone app)
├── pooja-admin/       MERN admin dashboard (client + server)
├── docs/              lld.html, plan.html (design docs)
└── CLAUDE.md          includes this file via @AGENTS.md
```

> The app has its own `poojaappclone/AGENTS.md` with one hard rule:
> **Expo SDK 57 — read https://docs.expo.dev/versions/v57.0.0/ before writing app code.**

---

## 1. The mobile app — `poojaappclone/`

**Stack:** Expo SDK 57, expo-router (file-based), React Native 0.86, TypeScript
(strict), React Compiler **disabled**. Path alias `@/*` → `src/*`.

**Run:**
```bash
cd poojaappclone
npx expo start          # then press 'a' for Android, or scan QR in Expo Go
npm run lint            # expo lint
npx tsc --noEmit        # typecheck
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
- `auth.tsx` — persisted user session. `signIn()` also best-effort **registers the
  user** to the admin backend (`POST /api/users`).
- `admin.tsx` — **feature flags** + local analytics. On mount: loads cached flags,
  then fetches remote (`GET /api/flags`) and merges (known keys, coerced to bool).
  Posts session/screen/payment events to the backend. Flags fall back to
  `DEFAULT_FLAGS` (all `true`) when the backend is unreachable.
- `content.tsx` — fetches `GET /api/content` and exposes remote deities/temples/
  aartis + `deityImage(id)` (admin-managed artwork overrides the bundled murti on
  the pooja screen). `assetUrl()` resolves host-relative `/uploads/..` paths.

**Backend URL:** `src/constants/config.ts` → `ADMIN_API`. See §3 for the
reachability rules — this is the #1 source of "it doesn't work on the phone".

---

## 2. The admin dashboard — `pooja-admin/`

**Stack:** Express + Mongoose + MongoDB (server), React + Vite (client), multer
for uploads. ESM (`"type":"module"`).

**Run (needs MongoDB on `:27017`):**
```bash
# terminal 1 — API on :4000
cd pooja-admin/server && cp .env.example .env && npm install && npm run dev
# terminal 2 — dashboard on :5173 (dev) or build+preview
cd pooja-admin/client && npm install && npm run dev
# optional demo analytics data:
cd pooja-admin/server && npm run seed
```

**Server** — `pooja-admin/server/src/`:
- `index.js` — entry; mounts `/uploads` static, `/api` routes, listens on `PORT`.
- `models.js` — `Flag, Visitor, Event, Payment, Deity, Temple, Aarti, User` +
  `DEFAULT_FLAGS`.
- `db.js` — Mongo connect + seeds flags and default content (only if empty).
- `routes.js` — flags (`GET /flags` map for the app, `GET /flags/full`,
  `PUT /flags/:key`), analytics (`/analytics/summary`, `/analytics/trend`),
  ingest (`/ingest/session|screen|payment`), `/payments`, `/visitors`.
- `content.js` — generic CRUD for `/deities /temples /aartis`, `POST /upload`
  (returns **host-relative** `/uploads/<file>`), `users` router (upsert by contact,
  list, update, delete), `publicContent` (`GET /content` — enabled items only).

**Client** — `pooja-admin/client/src/`:
- `App.jsx` — sidebar tabs: Overview, Feature Flags, Deities, Temples, Aartis,
  Users, Payments, Visitors (hash-routed). Field configs for each content type.
- `ContentManager.jsx` — generic CRUD table + edit modal; image/audio upload.
- `Users.jsx` — user list with block/unblock/delete.
- `api.js` — API client; `api.asset(url)` resolves relative upload paths.

---

## 3. How the two connect (READ THIS before debugging "flags/content don't apply")

The app calls the admin backend at `ADMIN_API`:
- `GET /api/flags` → `{flags:{key:bool}}` — drives which Home feature cards show.
- `GET /api/content` → `{deities,temples,aartis}` — remote content + deity images.
- `POST /api/users`, `POST /api/ingest/*` — user registration + analytics.

**All calls are best-effort.** If the backend is unreachable, the app silently
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

Uploads are stored **host-relative** (`/uploads/x.png`); both clients resolve them
against their own base (`assetUrl()` in the app, `api.asset()` in the dashboard),
so the same stored value works from any host.

**Note:** disabling the `bhajan` flag hides the Home *card* but NOT the Bhajan
*tab* — the tab bar in `app-tabs.tsx` is not flag-gated.

---

## 4. What was done in the most recent work

- **Admin content management:** deity/temple/aarti CRUD with image/audio upload,
  seeded from the app's data. **User management:** list/block/delete; users appear
  after they sign in on the app.
- **App ↔ admin integration:** `ContentProvider` consumes `/api/content`;
  admin-managed **deity images override** the bundled murti (matched by slug =
  app deity id: `shiva, shani, vishnu, ganesh, hanuman, durga, lakshmi, krishna`).
  Sign-in registers the user to the backend.
- **Host-portable uploads:** switched from absolute (localhost-baked) to
  host-relative URLs + resolvers on both sides.
- **Robustness:** custom `ErrorBoundary` in `app/_layout.tsx` (Expo Router picks up
  the named export) turns any render crash into a recoverable screen instead of a
  white/blue fatal; hardened the remote-flags merge (known keys → booleans).
- **Diagnosed the "flags don't apply" report:** root cause was backend
  unreachability (phone on cellular), not app logic. Documented in §3.

---

## 5. Gotchas / conventions

- **Expo 57**: consult the versioned docs; APIs differ from older Expo.
- **reanimated 4.5.1 must match react-native-worklets 0.10.1** — a mismatch causes
  a native `libworklets.so` SIGSEGV. Use `npx expo install --fix` to align.
- **i18n**: every user-facing string goes through `t()`; add keys to `en` AND `hi`.
- **Bottom-bar clearance**: screens pad content by `insets.bottom + 72` (safe area).
- **Device testing quirks**: `adb input swipe` is unreliable for RN gestures;
  headless Chrome can't advance the Reanimated timeline. Screenshot the device with
  `adb exec-out screencap -p > out.png`. Expo Go's deep-link launch
  (`am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent`)
  is ~50% reliable — retry until logcat shows `Running "main"`.
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
