# Pooja Project

A **Sri Mandir–style Hindu devotional mobile app** with a companion **admin
dashboard**. The app lets devotees perform virtual pooja/aarti, browse temples and
deities, listen to bhajans, and more. The admin dashboard lets you manage that
content, toggle features on/off remotely, manage users, and watch analytics — all
without shipping a new app build.

This is a monorepo with three independently-runnable projects:

| Folder            | What it is                        | Tech                          |
|-------------------|-----------------------------------|-------------------------------|
| `poojaappclone/`  | The phone app                     | Expo SDK 57, React Native, TS |
| `pooja-api/`      | The backend (app + dashboard API) | Express + Mongoose + MongoDB  |
| `pooja-admin/`    | Admin dashboard (static site)     | React + Vite                  |
| `docs/`           | Setup and deploy guides (`DEPLOY.md`, `FIREBASE_SETUP.md`, ...) |  |

`AGENTS.md` is the working handoff; `DESIGN.md` is the design for the larger features.

---

## Prerequisites

- **Node.js** 20.19.4+ and npm
- **MongoDB** running locally on `:27017` (`brew install mongodb-community` → `brew services start mongodb-community`, or run `mongod`)
- An Android device or emulator for a development build (Expo Go does not work: sign-in uses native Firebase modules)
- For Android-over-USB testing: **Android platform tools** (`adb`)

---

## Quick start

You'll run **three things**: MongoDB, the API, and either the dashboard or
the app.

### 1. Backend (API on `:4000`)
```bash
cd pooja-api
cp .env.example .env          # defaults are fine for local dev
npm install
npm run dev                   # http://localhost:4000
npm run seed                  # optional: demo analytics data
```
On first run it seeds default feature flags and content (8 deities, 5 temples,
6 aartis).

### 2. Admin dashboard (web UI on `:5173`)
```bash
cd pooja-admin
npm install
npm run dev                   # http://localhost:5173
```
The sidebar lists the tabs your role may use (content, devotees, flags,
payments, analytics, operators, ...); see `AGENTS.md`.

### 3. The mobile app
```bash
cd poojaappclone
npm install
npx expo prebuild --clean && npx expo run:android   # development build; see docs/FIREBASE_SETUP.md
```

> **Important:** the app talks to the admin backend at the URL in
> `poojaappclone/src/constants/config.ts` (`ADMIN_API`). Read
> [Connecting the app to the backend](#connecting-the-app-to-the-backend) — this is
> the #1 thing that trips people up.

---

## How it fits together

The mobile app pulls three things from the admin backend at launch, all
**best-effort** (if the backend is down, the app keeps working with local
defaults):

- **Feature flags** (`GET /api/flags`) — decide which features show in the app.
  Toggle them in the dashboard's *Feature Flags* tab.
- **Content** (`GET /api/content`) — deities, temples, aartis, and deity images.
  Manage them in the *Deities / Temples / Aartis* tabs, including image/audio
  uploads. An uploaded deity image replaces the app's built-in artwork.
- **Users & analytics** — signing in on the app registers the user
  (`POST /api/auth/sync`, visible in the *Users* tab); the app also reports sessions
  and screen views that power the *Overview* charts.

```
  Mobile app  ──HTTP──►  Admin API (:4000)  ──►  MongoDB
      ▲                       ▲
      └── flags / content     └── Admin dashboard (:5173) writes flags & content
```

---

## Connecting the app to the backend

The phone must be able to reach your Mac. **If a flag or content change doesn't
show up in the app, it's almost always because the app can't reach the backend** —
it then falls back to defaults (all features ON). There are two ways to connect:

**Option A — USB (most reliable, and the current default).**
`ADMIN_API` is set to `http://127.0.0.1:4000`. Run once per session:
```bash
adb reverse tcp:4000 tcp:4000     # backend
adb reverse tcp:8081 tcp:8081     # Metro (Expo dev server)
```
This tunnels the phone's `localhost` to your Mac over USB, so it works even on
cellular.

**Option B — Wi-Fi.** Set `ADMIN_API` to your Mac's LAN IP and keep the phone on
the **same network**:
```bash
ipconfig getifaddr en0            # e.g. 192.168.1.12
# then in src/constants/config.ts:
export const ADMIN_API = 'http://192.168.1.12:4000';
```
This breaks if the phone drops to cellular or joins a different network.

---

## Project layout

```
poojaappclone/
  src/
    app/                  # expo-router screens (file = route)
      _layout.tsx         # providers, onboarding gate, error boundary
      (tabs)/             # Home, Pooja, Temples, Bhajan, Profile
      chadhava, journal, darshan, temples-map, ...   # stack sub-screens
    context/
      language.tsx        # EN/Hindi i18n — t() + STRINGS.{en,hi}
      auth.tsx            # user session (+ registers user to backend on sign-in)
      admin.tsx           # feature flags + analytics
      content.tsx         # remote deities/temples/aartis + deity image override
    constants/config.ts   # ADMIN_API backend URL
    components/            # UI (app-tabs, mandir/deity-idol, auth, payment, ...)

pooja-api/
  src/
    index.js, server.js, app.js   # entry, boot, middleware order (the admin gate lives here)
    config/  middleware/  access/ # env + CORS, auth/gate, roles and permissions
    db/                           # Mongo connect + first-boot seeding
    modules/                      # one folder per feature: model, routes, service, tests
      content/ media/ operators/ users/ auth/ flags/ analytics/ ...
      wallet/ coins/ bookings/ chadhava/ astrologers/ calls/ payouts/
  scripts/                        # smoke.mjs, media-check.mjs, migrate-media.mjs, seed-demo.mjs

pooja-admin/
  src/client/
    app/                  # shell, sidebar, tab registry
    features/             # one folder per dashboard area
    ui/  lib/             # shared components and helpers
    api.js                # API client
```

---

## Common tasks

- **Add / edit a deity, temple, or aarti** → dashboard → the relevant tab → *Add* or
  *Edit*. Upload an image/audio right in the modal.
- **Change a deity's picture in the app** → edit the deity, upload a new image. The
  app matches by slug (`shiva, ganesh, hanuman, ...`) and overrides the built-in art.
- **Turn a feature on/off** → *Feature Flags* tab. Reload the app to see it.
- **Manage users** → *Users* tab (block / unblock / delete).
- **Add a UI string** → add the key to BOTH `en` and `hi` in
  `poojaappclone/src/context/language.tsx`, then use `t('your_key')`.

### Checks before committing
```bash
cd poojaappclone
npm run lint
npx tsc --noEmit
```

---

## Troubleshooting

- **"I disabled a flag but the app still shows the feature."** The app can't reach
  the backend, so it's using defaults (all ON). Fix the connection (see
  [above](#connecting-the-app-to-the-backend)); confirm with
  `curl http://localhost:4000/api/flags`.
- **App crashes / white screen on launch.** The app now shows a recoverable error
  screen (with the message + a *Try again* button) instead of dying silently —
  screenshot it and check the message.
- **Native crash on Android (`libworklets.so`).** `react-native-reanimated` and
  `react-native-worklets` versions must match; run `npx expo install --fix`.
- **Uploaded image doesn't load on the phone.** Uploads are stored as relative
  paths and resolved against `ADMIN_API`; make sure the backend is reachable from
  the phone (same rule as flags).
- **Disabling `bhajan` hides the Home card but the Bhajan tab is still there.** The
  tab bar isn't flag-gated (by design).

### Local services & ports
| Service         | Port  | Start command                             |
|-----------------|-------|-------------------------------------------|
| MongoDB         | 27017 | `mongod` / brew service                   |
| Admin API       | 4000  | `cd pooja-api && npm run dev`    |
| Admin dashboard | 5173  | `cd pooja-admin && npm run dev`    |
| Metro (Expo)    | 8081  | `cd poojaappclone && npx expo start`      |

---

## Notes

- The app targets **Expo SDK 57** — see `poojaappclone/AGENTS.md`; check the
  versioned Expo docs before changing app code.
- All app↔backend calls are best-effort and time-boxed, so the app works fully
  offline (with default flags and bundled content).
- Feature flags **default to ON** when the backend is unreachable — a hidden
  feature doesn't necessarily mean the flag is off.
