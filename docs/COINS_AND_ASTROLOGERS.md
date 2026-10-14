# Coins, bookings in coins, and astrologer calls — API contract

The single source of truth that the API, the dashboard and the app are built against.
Product/design rationale is in [`DESIGN.md`](../DESIGN.md) §19–§20. **Where this file and
DESIGN.md disagree, this file wins** (it records what was actually built).

Conventions
- JSON. Errors are `{ "error": "<human message>", "code": "<machine_code>", ...extra }`
  (HTTP status carries the class). The app/dashboard switch on `code`.
- Money: **coins** are integers. **Rupee amounts on the API are integers in paise**
  (`pricePaise`, `amountPaise`, `earnedPaise`) except `CoinPack.price` shown to clients
  as whole rupees (`price`, ₹) for readability — packs are whole-rupee. 1 coin = ₹1 base
  (Setting `coinsPerRupee`, default 1).
- "Devotee" routes take `Authorization: Bearer <Firebase ID token>`. "Admin" routes need the
  operator session cookie and live under `/api/admin/...` (admin-only unless noted).
  "Public" routes need nothing and are read-only.
- Owner key for wallets/bookings/calls is the Firebase **`uid`** string.
- Every spend sends a client-generated **`requestId`** (UUID). Same id twice ⇒ one charge.
- Server code is in `pooja-api/src/modules/<name>/` (see `modules/index.js`).

## Shared building blocks (already built)

- `src/modules/wallet/wallet.service.js` — `credit/debit/refund/adjust/getBalance/verifyWallet/
  reconcilePending/listTransactions`. **Only** code allowed to change a balance. `debit` throws
  `HttpError(402,'insufficient_coins',…,{needed,balance,shortfall})`.
- `src/lib/http-error.js` (`HttpError`, `httpErrorHandler`), `src/lib/settings.js`
  (`getSetting/getNumberSetting/getBoolSetting/ensureSetting`), `src/lib/coin-pack.js`
  (`describePack`, `packProblem` — pure; the dashboard keeps a byte-identical copy).
- Wallet endpoints (built): `GET /api/wallet` → `{balance}`; `GET /api/wallet/transactions` →
  `{transactions:[{id,type,amount,balanceAfter,refType,note,at}]}`; admin
  `GET /api/admin/wallets?q=` → `{wallets:[{uid,name,contact,balance}]}`,
  `GET /api/admin/wallet-transactions?type=&uid=&limit=` →
  `{transactions:[{id,uid,who,type,amount,balanceAfter,refType,refId,note,createdBy,at}]}`,
  `POST /api/admin/wallet/adjust {uid,amount(±int),reason,requestId}` → `{ok,balance}`.
- Ledger `type`s: `recharge | bonus | booking_debit | chadhava_debit | call_debit | refund | adjustment`.

## Settings (dashboard-editable key/value, seeded if absent)

| key | default | meaning |
|---|---|---|
| `coinsPerRupee` | `1` | base value used for sale % |
| `minMinutes` | `3` | minutes of balance needed to start a call |
| `ringTimeoutSec` | `25` | astrologer has this long to answer |
| `defaultSharePct` | `30` | platform share for new astrologers |
| `payoutPaisePerCoin` | `100` | rupee value (paise) of one coin the astrologer earns |
| `callsEnabled` | `true` | kill switch, enforced by `POST /api/calls` |
| `chadhavaServiceFee` | `5` | coins added to every chadhava offering |
| `chadhavaMinAmount` | `1` | smallest offering amount, coins |
| `bookingCancelHours` | `0` | refund cut-off: hours before the seva day; `0` = until the seva date |
| `prasadDelivery` | existing | prasad courier fee, **now coins** |

`GET /api/content` already returns `settings` as a flat map, so the app reads these there.
Flags: add `astrologerCalls` (default **on**, "Astrologer Calls"); relabel `payments` as
"Coin purchases" (desc "Buying coins with Razorpay").

## 1. Coin packs & purchase

`CoinPack`: `{ coins, price (₹ whole), showSale, saleEndsAt?, order, active }`.
Derived by `describePack`: `baseCoins, extraCoins, salePct, discountPct, costPerCoin, onSale`.
Validation: `coins` and `price` positive integers, `coins >= price*coinsPerRupee` else 400
`bad_pack` with the message from `packProblem`.

| | | |
|---|---|---|
| Public | `GET /api/coins/packs` | `{ coinsPerRupee, packs:[{id,coins,price,baseCoins,extraCoins,salePct,onSale,order}] }` active only, by `order` |
| Devotee | `POST /api/wallet/orders {packId}` | `{ orderId, provider:'razorpay'\|'mock', razorpayOrderId?, keyId?, amountPaise, currency:'INR', coins, price }` — price/coins snapshotted into `CoinOrder` |
| Devotee | `POST /api/wallet/orders/:orderId/verify {razorpayPaymentId, razorpaySignature}` (mock: `{mock:true}`) | `{ ok, balance, coinsAdded }` — verifies HMAC, then `creditOrder()` |
| Webhook | `POST /api/webhooks/razorpay` (header `x-razorpay-signature`, raw body HMAC with `RAZORPAY_WEBHOOK_SECRET`) | credits the same order if verify never arrived; idempotent on order id |
| Admin | `GET/POST /api/admin/coin-packs`, `PUT/DELETE /api/admin/coin-packs/:id` | pack incl. derived fields |
| Admin | `GET /api/admin/coin-orders?limit=` | `{orders:[{id,uid,who,coins,price,status,provider,at}]}` |
| Admin | `GET /api/admin/coin-stats?days=30` | `{ salesPaise, coinsSold, coinsSpent:{booking,chadhava,call}, unspentCoins }` |

`creditOrder(orderId)` is idempotent (`idempotencyKey = order:<id>`), writes ONE `recharge` txn of
the order's snapshotted `coins`, sets order `paid`. Env: `PAYMENTS_PROVIDER=razorpay|mock`
(default: `razorpay` if `RAZORPAY_KEY_ID`+`RAZORPAY_KEY_SECRET` set, else `mock` when
`NODE_ENV!=='production'`; in production with no keys the order endpoints answer 503
`payments_unavailable`). `mock` provider lets dev/test complete a purchase with no money — it is
**refused in production**. Razorpay is called with plain `fetch` (Basic auth) — no SDK dependency.

## 2. Bookings in coins

Replaces the old `/api/auth/bookings*` (delete those; older builds are unsupported).

| | | |
|---|---|---|
| Devotee | `GET /api/bookings` | `{ bookings:[Booking] }` |
| Devotee | `POST /api/bookings {sevaSlug, templeSlug, date:'YYYY-MM-DD', devoteeName, gotra, prasad, requestId}` | `201 {booking, balance}`; **price read from DB** (`Seva.price` + `prasadDelivery` if prasad) — any client price is ignored; `402 insufficient_coins` |
| Devotee | `DELETE /api/bookings/:id` | `{ ok, refunded:boolean, coinsRefunded, balance }` — refund iff before cut-off (`bookingCancelHours`); idempotent |
| Admin | `GET /api/admin/bookings?limit=` | `{bookings:[Booking + who]}` |

`Booking` (adds to existing): `{ id, bookingRef, templeSlug, templeName, templeLocation, sevaSlug,
sevaName, sevaNameHi, price, prasadFee, totalCoins (alias coinsPaid), date, devoteeName, gotra, prasad,
status:'upcoming'|'completed'|'cancelled', refunded, walletTxnId, bookedAt }`.
Debit first (`booking_debit`, key `booking:<requestId>`), then create the booking; if the booking write
fails, refund. Old rows without `walletTxnId` still list normally.

## 3. e-Chadhava in coins

`Offering` (admin-managed, editor-editable): `{ key, name, nameHi, coins, order, enabled }`, seeded
`flowers 11`, `prasad 5`, `vastram 10`.

| | | |
|---|---|---|
| Public | `GET /api/chadhava/offerings` | `{ offerings:[{key,name,nameHi,coins,order}], serviceFee, minAmount }` |
| Devotee | `POST /api/chadhava {templeSlug, amount, items:[{key,qty}], requestId}` | `201 {order:{id,ref,templeSlug,amount,itemsTotal,serviceFee,total}, balance}`; `amount` = devotee's chosen offering coins (≥ minAmount), item prices from DB, `total = amount + itemsTotal + serviceFee`; `402` if short |
| Admin | `GET/POST/PUT/DELETE /api/admin/offerings` | catalogue CRUD (**editors allowed**) |
| Admin | `GET /api/admin/chadhava-orders?limit=` | orders list |

## 4. Astrologers

`Astrologer`: `{ name, bio, photoUrl, specialities[], languages[], yearsExperience, ratePerMin (coins),
platformSharePct, signInEmail?, signInPhone?, uid? (set on first sign-in), status:'invited'|'active'|'suspended',
listed, presence:'offline'|'online'|'busy', lastSeenAt, lastSignInAt }`. `signInEmail` lower-cased,
`signInPhone` E.164; unique among astrologers; at least one required.

| | | |
|---|---|---|
| Public | `GET /api/astrologers` | `{ astrologers:[{id,name,bio,photoUrl,specialities,languages,yearsExperience,ratePerMin,presence,ratingAvg?,ratingCount?}] }` — only `status==='active' && listed`; presence is **`offline` if `lastSeenAt` older than 45 s** unless `busy` |
| Admin | `GET/POST /api/admin/astrologers`, `PUT/DELETE /api/admin/astrologers/:id`, `POST …/:id/suspend`, `POST …/:id/reactivate` | rows incl. `status, presence, calls30d, lastSignInAt` |
| Astrologer | `GET /api/astrologer/me` | `{ astrologer }` (role from server) |
| Astrologer | `PUT /api/astrologer/me/presence {online:boolean}` | `{ presence }` — refuses `busy` override; going offline while on a call ⇒ 409 |
| Astrologer | `POST /api/astrologer/me/heartbeat` | `{ ok }` (also bumps `lastSeenAt`); app sends every 20 s while online |
| Astrologer | `GET /api/astrologer/me/incoming` | `{ call: CallView\|null }` — a `requested` call for me, if any |
| Astrologer | `GET /api/astrologer/me/calls?limit=&before=` | `{ calls:[CallRow] }` |
| Astrologer | `GET /api/astrologer/me/earnings` | `{ month:{earnedPaise,calls,minutes}, today:{…}, paidPaise, duePaise, payouts:[{amountPaise,paidAt,reference}] }` |

**Sign-in claim (in `POST /api/auth/sync`)**: after the `User` is created/found, match a
`status in (invited,active)` astrologer whose `signInEmail` equals the token's **provider-verified**
email (only when `decoded.email_verified`/Google) or `signInPhone` equals `decoded.phone_number`. On match: set
`Astrologer.uid`, `status='active'`, `lastSignInAt`; set `User.role='astrologer'` and `User.name` from the
astrologer if blank so the profile is complete. The sync response (`toProfile`) gains
`role: 'devotee'|'astrologer'` and `astrologer: { id, name } | null`. `suspended` ⇒ role stays/returns
`devotee`. Role is re-read from the DB each call (never trusted from the client). `User` gets `role`.

## 5. Calls (voice, per-minute coins)

`CallSession`: `{ devoteeUid, astrologerId, astrologerUid, status:'requested'|'connected'|'ended',
endReason?:'completed'|'declined'|'missed'|'cancelled'|'out_of_coins'|'failed'|'admin', ratePerMinSnapshot,
shareSnapshot, requestedAt, answeredAt?, endedAt?, minutesBilled, coinsCharged, nextBillAt?, rtcChannel,
rating? }`.

Rules (see DESIGN.md §19.2/§19.4): server-authoritative; charge each **started** minute at the *start* of the
minute; first minute when the astrologer **accepts**; auto-end with `out_of_coins` when the next minute can't be
charged; rate snapshotted per call; nothing charged for declined/missed/cancelled/failed-to-connect; debit
key = `call:<id>:min:<n>` (so a double tick can never double-charge); each billed minute also writes an
`AstrologerEarning` row (`coins = ratePerMin × (1 − share/100)` rounded down, `paise = coins × payoutPaisePerCoin`).

| | | |
|---|---|---|
| Devotee | `POST /api/calls {astrologerId, requestId}` | `201 {call}` status `requested`. Errors: `402 insufficient_coins` (needed = `minMinutes × rate`), `409 astrologer_unavailable`, `409 already_in_call`, `503 calls_disabled`, `503 calls_unavailable` |
| Devotee | `POST /api/calls/:id/cancel` | while `requested` |
| Either | `POST /api/calls/:id/end` | idempotent; ends a connected call (reason `completed`) |
| Astrologer | `POST /api/calls/:id/accept` / `decline` | accept: `requested→connected`, takes minute 1, issues RTC credentials, presence→`busy` |
| Either party | `GET /api/calls/:id` | `{ call: CallView }` — poll every 2–3 s |
| Devotee | `POST /api/calls/:id/rating {rating:1..5}` | after ended, once |
| Admin | `GET /api/admin/calls?from=&to=&outcome=&limit=` | `{ calls:[CallRow], live:[CallRow] }` |
| Admin | `POST /api/admin/calls/:id/end`, `POST /api/admin/calls/:id/refund {coins, reason}` | force end / goodwill refund (`refund` txn) |

`CallView`: `{ id, status, endReason, astrologer:{id,name,photoUrl}, devotee:{name}, ratePerMin, minutesBilled,
coinsCharged, balance (the viewer's own wallet if devotee), secondsToNextCharge, answeredAt, endedAt,
lowBalance:boolean (≤ 1 minute left), rtc?:{provider,appId,channel,token,uid} }` — `rtc` only for the two
participants while `connected`. `CallRow`: `{ id, startedAt, devoteeName, astrologerName, durationSec, coins,
endReason|status }`.

**Billing ticker** (`startModuleJobs`): every ~5 s find `connected` calls with `nextBillAt <= now`, debit the next
minute, advance `nextBillAt += 60s`, or end `out_of_coins`; also expire `requested` calls past `ringTimeoutSec`
(`missed`), end connected calls whose participants went silent, and run `wallet.reconcilePending()`. Boot runs a
catch-up pass (a deploy restarts the container). RTC: `RTC_PROVIDER=agora|mock` (`agora` needs `AGORA_APP_ID`,
`AGORA_APP_CERTIFICATE`, builds tokens with the `agora-token` package; `mock` returns a fake channel for dev/test and is
**refused in production**). The app joins with the returned credentials.

## 6. Admin billing rules & payouts

| | | |
|---|---|---|
| Admin | `GET/PUT /api/admin/billing/rules` | `{ minMinutes, ringTimeoutSec, defaultSharePct, payoutPaisePerCoin, callsEnabled, coinsPerRupee, chadhavaServiceFee, chadhavaMinAmount, bookingCancelHours, prasadDelivery }` (typed; PUT validates) |
| Admin | `GET /api/admin/payouts/summary` | `{ astrologers:[{id,name,earnedPaise,paidPaise,duePaise}] }` |
| Admin | `GET /api/admin/payouts?astrologerId=` / `POST /api/admin/payouts {astrologerId, amountPaise, reference}` | record a manual bank payout (cannot exceed due) |

## Access (who may call the admin routes)

Roles are `admin | editor | viewer`; a role is a set of `<area>:view|edit` permissions
(`pooja-api/src/access/permissions.js`, spec: `DESIGN.md` §21). `GET/HEAD` need `<area>:view`,
anything else `<area>:edit`. The path→area table is `access/routes.js`; an unmapped path is
admin-only. A refusal is `403 { error, code: "forbidden", needs: "<area>:<level>" }`.

| Routes | Area | admin | editor | viewer |
|---|---|---|---|---|
| `/admin/coin-packs`, `/admin/coin-stats`, `/admin/billing/*` | `money` | edit | view | view |
| `/admin/coin-orders`, `/admin/bookings`, `/admin/chadhava-orders` | `orders` | edit | view (masked) | view (masked) |
| `/admin/offerings` (chadhava catalogue), `/content/*` | `content` | edit | edit | view |
| `/admin/wallet-transactions`, `/admin/wallet/adjust` | `wallets` | edit | view (masked) | view (masked) |
| `/admin/wallets?q=` (search by name/phone) | `wallets` + `devotees:view` | yes | 403 | 403 |
| `/admin/astrologers/*` | `astrologers` | edit | view (sign-in masked) | view (sign-in masked) |
| `/admin/calls/*` (log, live, end, refund) | `calls` | edit | view (masked) | view (masked) |
| `/admin/payouts/*` | `payouts` | edit | view | view |
| `/admin/operators`, `/admin/audit-log` | `operators` | edit | - | - |

Masking: without `devotees:view` a devotee is `Devotee ••NNNN` (stable per uid, keyed hash);
booking `devoteeName` becomes the pseudonym and `gotra` is blanked; astrologer `signInEmail` /
`signInPhone` are masked (`r•••@gmail.com`, `+91••••••1234`) without `astrologers:edit`.
Writes to the money keys in `/content/settings` (the billing-rule keys) need `money:edit`,
even though `/content/*` is `content`.

## Testing conventions

- Node ≥ 20.19: run with `PATH=/opt/homebrew/bin:$PATH` (the default `node` here is too old).
- API tests: `node --test`, files `*.test.mjs` beside the code; a local `mongod` on your own port
  (see your brief); routers are built via the module's `routers({ requireAuth })` with a **fake
  `requireAuth`** (`req.token = { uid: req.get('x-test-uid'), … }`) — never bypass auth in product code.
- Dashboard: `npx vite build` must pass. App: `npx tsc --noEmit` and `npm run lint` must pass.
- Add every new public route to `scripts/smoke.mjs` expectations; every admin route must 401 unauthenticated.

## Phase 6 note: the calls service

With `CALLS_URL` set (see `MICROSERVICES.md`, phase 6) astrologers, calls, earnings and payouts live in
`backend/services/calls`; every route, request and response in this document is unchanged. What differs
underneath: a call spends and refunds through the wallet **service** (fail closed: `503 wallet_unavailable`);
every refund names the minute it reverses (`ofKey`), so an operator's goodwill refund larger than one minute
is paid as one refund per minute (`call:<id>:gw:<requestId>:<minute>`) and a minute can be refunded once;
the money rules (`minMinutes`, `callsEnabled`, `defaultSharePct`, `payoutPaisePerCoin`) are read fresh from
engagement and a call is refused with `503 settings_unavailable` rather than guessed when they cannot be read.

