# Payments setup — buying coins with Razorpay

Razorpay appears in exactly one place in the app: **buying coins**
(`poojaappclone/src/features/wallet`). Everything else — bookings, e-Chadhava,
calls — spends coins and never touches the gateway.

The app code is finished, but the native Razorpay SDK is **deliberately not in
`package.json`**. A native module needs a new build, and adding one blind could
break the working app build. Until it is installed:

- **Dev server (`PAYMENTS_PROVIDER=mock`)** — buying coins works end to end with
  no SDK. The wallet shows a "Test payment — no money charged" banner. The
  server refuses `mock` in production, and a release build of the app refuses it
  too.
- **Real Razorpay order, SDK missing** — tapping Pay shows
  "Payments need a new build" and nothing is charged.

## 1. Install the SDK in the app

```bash
cd poojaappclone
npm install react-native-razorpay      # not an Expo-managed package, so not `expo install`
npx expo prebuild --clean              # autolinks the native module
npx expo run:android                   # development build — Expo Go cannot load it
```

Notes:

- There is no Expo config plugin to add; React Native autolinking picks the
  package up during prebuild. Check the package README for the current
  minimum SDK and any ProGuard rule it asks for before a release build.
- `prebuild --clean` deletes `android/local.properties`; export `ANDROID_HOME`
  or recreate it (see AGENTS.md §5).
- Nothing else in the app changes. `src/features/wallet/lib/razorpay.ts`
  loads the module with a guarded `require('react-native-razorpay')`, so the
  moment it resolves the native sheet is used.
- Only the **key id** is ever sent to the phone (inside the order the API
  returns). The key **secret** must never be put in the app or in any
  `EXPO_PUBLIC_*` variable.

## 2. Configure the API (`pooja-api/.env`)

| Variable | Meaning |
|---|---|
| `RAZORPAY_KEY_ID` | Key id from the Razorpay dashboard (test `rzp_test_…` or live `rzp_live_…`) |
| `RAZORPAY_KEY_SECRET` | Key secret — server only |
| `RAZORPAY_WEBHOOK_SECRET` | Secret you set on the webhook (below) — used to verify `x-razorpay-signature` |
| `PAYMENTS_PROVIDER` | `razorpay` or `mock`. Defaults to `razorpay` when the key pair is set, otherwise `mock` outside production. In production with no keys the order endpoints answer `503 payments_unavailable`. |

Webhook (Razorpay dashboard -> Settings -> Webhooks):

- URL: `https://<your-api>/api/webhooks/razorpay`
- Events: `payment.captured` (and `order.paid`)
- Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`

The webhook is what credits coins when the app never gets to call `verify`
(phone died, app killed mid-payment). It is idempotent on the order id, so
`verify` and the webhook can both fire without double-crediting.

## 3. Test it

1. Use test keys. In the app: Profile -> My Coins -> pick a pack -> Pay.
2. Pay with a Razorpay test card/UPI. The balance updates from the `verify`
   response; kill the app right after paying to check the webhook path credits
   it instead.
3. The dashboard's coin orders and wallet ledger should show one `recharge`
   transaction per order.

## 4. Switching off

The `payments` feature flag (dashboard label "Coin purchases") hides/disables
only the **buying** controls. Spending existing coins is never blocked by it.
