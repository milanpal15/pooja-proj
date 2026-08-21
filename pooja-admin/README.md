# Divine Temple Portal — Admin (MERN)

A separate **MERN** admin portal for the Pooja mobile app:

- **MongoDB** — stores feature flags, visitors, analytics events, payments
- **Express + Node** (`server/`) — REST API the app and dashboard talk to
- **React + Vite** (`client/`) — the admin dashboard

The mobile app reads its **feature flags** from this backend and posts **analytics** and **payment** events to it, so toggling a flag here controls the live app, and the dashboard shows real usage.

```
 mobile app ──GET /api/flags──────────►  Express API  ◄──toggle── React dashboard
 mobile app ──POST /api/ingest/*──────►   (MongoDB)   ──charts/logs──►
```

## Prerequisites
- Node 18+
- MongoDB running locally (`mongod`) or a MongoDB Atlas URI

## 1) Backend
```bash
cd server
cp .env.example .env          # adjust MONGODB_URI / PORT if needed
npm install
npm run seed                  # optional: demo visitors/events/payments
npm run dev                   # http://localhost:4000
```
Health check: open http://localhost:4000/api/health

## 2) Dashboard
```bash
cd client
npm install
npm run dev                   # http://localhost:5173
```
If the API isn't on `localhost:4000`, set it:
```bash
VITE_API_BASE=http://192.168.1.12:4000 npm run dev
```

## 3) Connect the mobile app
In the app repo, edit `src/constants/config.ts`:
```ts
export const ADMIN_API = 'http://<YOUR-MAC-LAN-IP>:4000';
```
Use your Mac's LAN IP (`ipconfig getifaddr en0`) so the phone can reach it over Wi-Fi.
Over USB you can instead run `adb reverse tcp:4000 tcp:4000` and use `http://127.0.0.1:4000`.

The app is **offline-tolerant**: if the backend is down it falls back to locally-stored
flags and keeps working; events are dropped silently.

## API
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/flags` | flags as `{ key: bool }` (app reads) |
| GET | `/api/flags/full` | full flag docs (dashboard) |
| PUT | `/api/flags/:key` | toggle a flag `{ enabled }` |
| POST | `/api/ingest/session` | app reports a session start |
| POST | `/api/ingest/screen` | app reports a screen view |
| POST | `/api/ingest/payment` | app reports a payment |
| GET | `/api/analytics/summary` | KPIs, top screens, recent payments |
| GET | `/api/analytics/trend` | 14-day session trend |
| GET | `/api/payments` · `/api/visitors` | tables |

## Dashboard pages
- **Overview** — visitors, sessions, screen views, payments, revenue, 14-day sessions chart, top screens, recent payments (auto-refreshing)
- **Feature Flags** — live toggles that control the app
- **Payments** — full payment log
- **Visitors** — devices, sessions, last active
