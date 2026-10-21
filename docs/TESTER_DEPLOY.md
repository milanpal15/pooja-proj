# Tester deployment — free, on your own machine, published with ngrok

For a handful of testers, not users. It runs the **same code as production** (all seven services, both BFFs and the monolith
shell) on one machine, keeps its data on disk, and publishes **only the mobile BFF** through an ngrok tunnel. The dashboard never
leaves your machine. Cost: $0. It is up only while the machine is on and `tools/tester.sh up` has been run.

## One-time setup

1. **Claim your free static domain** (the one step only you can do): ngrok dashboard → *Domains* → *New Domain*. A free account
   gets one. Without it the tunnel works but its address changes on every restart, which would break every installed app.
2. `backend/tools/tester.sh up` — creates `~/.bhakti-tester/` (outside the repo): `backend/.env` (gitignored, mode 600; generated JWT and
   session secrets and the first dashboard admin password), `mongo/` (the database files), `run/` (logs and pids).
3. Put the domain in `backend/.env` as `NGROK_DOMAIN=<name>.ngrok-free.dev` (no `https://`), then
   `tools/tester.sh down && tools/tester.sh up`. `tools/tester.sh status` prints the public URL.
4. Build the tester app against that URL. `EXPO_PUBLIC_*` is baked in at bundle time, so it is a **rebuild**, not a reload:
   ```bash
   cd poojaappclone
   EXPO_PUBLIC_API_URL=https://<name>.ngrok-free.dev npx expo prebuild --platform android   # first time only
   cd android && EXPO_PUBLIC_API_URL=https://<name>.ngrok-free.dev ./gradlew assembleRelease
   ```
   (a shell variable beats `poojaappclone/.env`, so the `.env` is not edited). Share
   `android/app/build/outputs/apk/release/app-release.apk` with the testers.

## Daily use

| | |
|---|---|
| start / stop | `tools/tester.sh up` / `down` (data stays) |
| what is running, public URL, dependency health | `tools/tester.sh status` |
| tail a log | `tools/tester.sh logs [mobile-bff\|admin-bff\|wallet\|events\|…]` |
| dashboard (local only) | `cd pooja-admin && API_ORIGIN=http://127.0.0.1:4611 npx vite --port 5299`, then http://localhost:5299 — user `admin`, password from `backend/.env` |
| reset everything | `tools/tester.sh down`, then delete `~/.bhakti-tester/mongo` |

Ports (default `TESTER_BASE_PORT=4600`): mobile BFF 4610 (the tunnel), admin BFF 4611 (local), services 4602–4609, mongod 27500.

## What this is, honestly

* **Development mode.** The mock payment and mock call providers are allowed, which is what lets testers "buy" coins and place
  test calls without Razorpay or Agora keys. It also means **anyone who learns the public URL could do the same** — so keep the
  URL to testers and use throwaway data only. Real payments/calls need real keys and `STACK_NODE_ENV=production`.
* **Free ngrok limits.** One tunnel, one static domain; the free plan has monthly request and bandwidth caps and may show a
  warning page to *browsers* (the app and the JSON API are not affected). Check the current terms in your ngrok dashboard.
* **Sign-in.** Use **Google sign-in**: it is free. Phone-number OTP needs Firebase's paid Blaze plan.
* **Not isolated from the internet's noise.** There is no rate limiting beyond the services' own; this is a test rig.
* Nothing here talks to Atlas, the monolith's production data, or your own Metro/API. To go to real users, follow
  `docs/MICROSERVICES_CUTOVER.md`.
