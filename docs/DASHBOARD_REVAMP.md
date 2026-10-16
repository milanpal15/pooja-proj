# Dashboard revamp — plan, architecture and design

Status: **proposal for approval** (nothing built yet). Written 2026-10-16 after auditing the current dashboard (`pooja-admin/`), the
catalog / engagement / identity services and the app. Companion contracts will be written per phase in the same style as
`docs/EVENTS.md` and `docs/HOME_LAYOUT.md`; the visual boards are drawn in the Claude Design canvas (the sole source for pixels), the
wireframes below fix structure and behaviour so those boards can be made once.

## 1. Goal

One control plane from which an operator manages **everything the app shows or does**, safely and without a store release:

* **Releases & versions** — which app builds exist, which are recommended, which are **blocked**, with a message and a store link; maintenance mode.
* **People** — find any user, see their devices/versions/wallet/bookings/events, **block** (with reason and message), force sign-out, **message them**.
* **Notifications** — targeted campaigns (everyone, a segment, a list, one user), push + in-app inbox, scheduled, previewed, measured.
* **Experience** — Home layouts (done), slider, app copy/strings, onboarding, feature flags and remote config, staged rollouts.
* **Content** — temples, lords (deities), aartis, festivals, poojas, chadhava, events, live darshan, horoscope, panchang, media — one consistent
  editor pattern (draft → preview → schedule → publish → history), one media library.
* **Governance** — roles, approvals for risky actions, audit with before/after, 2FA.

## 2. What exists today (audit) and the gaps

| Area | Today | Gap |
|---|---|---|
| Navigation | 29 flat tabs in one sidebar; hash routing; one group heading ("Astrologer calls") | Impossible to scan; no search, no module concept, no deep links to records |
| App versions | `Device.appVersion` exists but the app sends the literal `'1.0.0'`; nothing reads it | **No release registry, no minimum/blocked versions, no update prompt** |
| Notifications | `Announcement` (modal + optional Expo broadcast); FCM registry in identity used only for calls/orders | No audience targeting, no schedule, no inbox, no per-user send, no stats, no preferences |
| Users | list / block / delete; masked for non-admins | No detail view, no devices, no block reason/message, no force logout, no wallet/bookings/events in one place, no segments |
| Config | `Flag` (bool) and `Setting` (key/value) tabs | No types, staged rollout, scheduling, history, maintenance mode |
| Content | Good CRUD per tab, Home layout builder, Events builder | Each tab differs; no drafts/scheduling/history for most; **orphaned media** (known), no media library; lat/lng typed by hand |
| Insights | Overview + Visitors (device counts) | No adoption-by-version, retention, funnels, notification performance |
| Governance | admin/editor/viewer; audit log written (admin-only endpoint, no UI beyond Operators) | No custom roles, no approvals, no 2FA, audit has no diffs |

## 3. Principles

1. **One pattern everywhere**: list → record → editor with *Draft / Scheduled / Live / Archived*, preview, history, rollback (the Home layout
   builder is the reference implementation).
2. **Risky actions are explicit**: anything that can lock users out or reach many phones shows an *impact preview* ("412 devices on 1.0.x would be
   blocked", "this reaches 3,208 people") and may require a second approver.
3. **The server decides, the app obeys, and fails safe**: policy lookups fail **open** for version gates (an outage must never lock everyone out) and
   **closed** for money.
4. **Free to run**: Mongo-backed queues and caches, no new paid infra, no new service unless it earns its RAM (the tester deployment is one machine).
5. **No invented numbers**: every count/percent is computed from real rows; unknown is "—".
6. **Honest scope**: Android first (the only shipped platform); the models carry `platform` so iOS slots in later.

## 4. Information architecture (new sidebar)

```
Overview                          (today: health, DAU, revenue, adoption by version, pending approvals)
─ PEOPLE
  Users                           (search, 360 drawer, block, message)
  Segments                        (saved audiences with live counts)
  Notifications                   (Campaigns · Inbox templates · Preferences defaults)
─ RELEASES & CONTROL
  App releases                    (versions, recommended, blocked, maintenance)
  Remote config                   (flags, settings, rollouts, schedules)
─ EXPERIENCE
  Home                            (Layouts · Slider · Themes)
  App copy                        (strings · onboarding · legal · FAQs · support)
─ CONTENT
  Temples · Lords (deities) · Aartis & bhajans · Festivals · Horoscope · Panchang
  Poojas · Chadhava · Events · Live darshan · Media library
─ COMMERCE
  Bookings & reviews · Coins (packs, orders, wallets) · Astrologers & calls · Payouts
─ INSIGHTS
  Analytics · Audit log
─ ADMIN
  Operators & roles · Approvals · Policies · System (health, jobs, environment)
```
Shell: grouped, collapsible sidebar (remembers state) · **⌘K command palette** (jump to any module or record: "user +9198…", "temple Kashi") · global
breadcrumbs · environment badge (LOCAL / TESTER / PRODUCTION) · notification bell for approvals and failed jobs · every record has a stable URL.

## 5. Modules in depth

### 5.1 App releases & version control  (the new core)
**Concepts.** *Release* = a published build (versionName, versionCode, notes EN/HI, store URL, date). *Policy* = what the server tells each build to do.
```
AppRelease  { platform:'android', versionName, versionCode*, status:'draft'|'live'|'withdrawn', releasedAt, notes, notesHi, storeUrl, rolloutPct }
VersionPolicy (one per platform) {
  minVersionCode        // below this: HARD block ("update required"), full-screen, cannot dismiss
  recommendedVersionCode// below this: soft nudge ("update available"), dismissible, re-shown every N days
  blockedVersionCodes[] // specific bad builds blocked even if >= min (a broken release)
  minOsApi              // optional: devices below this Android API level get an "unsupported device" notice (not a version gate)
  message, messageHi, storeUrl, graceUntil (hard block starts at this time), snoozeDays
  maintenance { enabled, message, messageHi, until, allowList:[uid…] }     // global read-only/closed mode
  failOpen: true }
```
**Check.** `GET /api/app/policy?platform=android&versionCode=N&osApi=M` (public, tiny, cacheable 60 s) → `{ status:'ok'|'update_available'|'update_required'|'blocked'|'maintenance'|'unsupported_os',
message, messageHi, storeUrl, minVersionName, graceUntil, snoozeDays }`. The app calls it at launch and on resume (throttled); the **mobile BFF also enforces** it on every
request via `X-App-Version-Code` (+ platform) → `426 {code:'app_outdated', …}` for blocked/hard-blocked builds (policy cached 30 s in memory; lookup failure ⇒ **fail open**). The app shows a
non-dismissible *Update required* screen (themed, Hindi/English, store button; works offline from the last cached policy). Payments, calls and booking writes are always refused for a blocked build.
**Dashboard.** Release timeline · "New release" wizard (build info → notes → recommend → optionally set minimum with a date) · **Impact preview**: devices and *active users in the last 7/30 days* per version from the version
telemetry ("Setting min to 12 blocks 412 devices / 305 users; 61% of them opened the app this week") · staged enforcement (grace date) · "Block this build now" panic button · maintenance toggle with allow-list · history/rollback · **approval required** to raise `minVersionCode` or enable maintenance (§5.8).
**Telemetry (prerequisite).** The app sends `X-App-Version`, `X-App-Version-Code`, `X-App-Platform`, `X-OS-Api` on every API call (fix the hard-coded `'1.0.0'`); the BFF upserts `Device {deviceId, uid, versionCode, versionName, osApi, model, lastSeen}`.

### 5.2 Notifications (campaigns + inbox)
```
Campaign { id, name, category:'transactional'|'festival'|'engagement'|'announcement', status:'draft'|'scheduled'|'sending'|'sent'|'cancelled'|'failed',
  audience: Audience, content:{ title, titleHi, body, bodyHi, image, action:{type,ref}, channelId }, channels:['push','inbox','modal'],
  schedule:{ at|null, tz:'user'|'IST', quietHours:{from,to}, expireAt }, limits:{ maxPerUser24h }, createdBy, approvedBy, stats:{ targeted, sent, failed, invalidTokens, opened } }
Audience { mode:'all'|'segment'|'uids', segmentId, uids[], exclude:{ blocked:true, recentlyNotifiedHours } }
Segment  { id, name, rules:[ {field, op, value} … ]  (AND/OR groups) }   // fields below
InboxItem { uid, campaignId, title, body, action, createdAt, readAt }      // powers the in-app inbox + unread badge
NotificationPref { uid, categories:{ festival:true, engagement:true, … }, quietHours }  // per-user opt-out; transactional always allowed
```
**Segment fields (server-side, evaluated against real rows):** language · platform · app version(code range) · OS api · created date range · last active range · lapsed N days · has booking / booked in last N days · coins spent / balance range · joined event X / completed event · saved temple · is astrologer · has push token · tag. Live **estimated size** while editing; *preview 20 matching users* (masked).
**Sending.** A Mongo-backed job queue (lease + retry + backoff, the same pattern as the orders/events sweepers): resolve audience in pages → batch to FCM (≤500/request via identity's push registry) → record per-campaign counts; invalid tokens pruned; idempotent per (campaign, uid); resumable after a restart; **kill switch** to cancel mid-send; per-user frequency cap and quiet hours (IST). Large sends (> N recipients) need approval.
**Composer UX.** Audience → Content (EN/HI side by side, image, deep-link picker reusing the Home *Action* types) → Delivery (now / schedule / recurring) → **Phone preview** (push + inbox + modal) → *Send test to me / to a device* → Review (recipient count, impact) → Send. Templates with variables (`{name}`, `{festival}`). Results page: funnel (targeted → sent → delivered/failed → opened), by version, errors.
**App side.** Notification inbox screen + unread badge; preferences screen (categories, quiet hours); tap routing for every Action type; Android channels per category; graceful when permission denied. Existing `Announcement` becomes a *campaign with the modal channel*.

### 5.3 Users 360 and blocking
* **List**: server-side search (name/phone/email/uid, masked for non-admins), filters (segment, version, blocked, role, last active), column chooser, saved views, CSV export (permission-gated, audited).
* **Drawer/page** with tabs: Profile · Devices (version, OS, model, last seen, push on/off) · Wallet (balance, ledger, adjust with reason + approval) · Bookings · Events (progress, badges) · Calls · Notifications received · Activity timeline · Audit about this user.
* **Actions**: **Block** (reason, optional end date, *message shown in the app*, scope: account / this device), Unblock, **Force sign-out** (revoke refresh tokens), Send notification, Adjust coins, Delete (two-step + approval), Add note/tag. Blocked users see a themed *Account blocked* screen with the operator's message and a support contact — not a generic error.
* Device-level block (deviceId) to stop re-registration abuse; blocklist screen under Users.

### 5.4 Remote config, flags and rollouts
Typed registry (bool / number / string / enum / json) with description, default, validation, owner; each key has *rules* (audience segment, version range, language, % rollout by stable device hash) evaluated by the BFF and returned as one resolved map to the app (cached, ETag). Schedule a change (on/off at a time), history with who/when/why, one-click rollback, **feature kill switches** (disable Calls/Payments instantly with a user-facing message). Replaces Feature Flags + Settings tabs; money-affecting keys stay admin-only (existing `MONEY_SETTING_KEYS`).

### 5.5 Experience
* **Home** — Layouts (v2.1, done), Slider (done), plus **Themes** (seasonal palette/hero art applied by schedule) later.
* **App copy** — remote overrides for selected i18n keys (EN/HI side by side, completeness checker, "missing Hindi" list), onboarding slides, legal pages (Policies today), FAQs, support contacts. The app keeps bundled strings as the offline fallback; an override is a key→string map fetched with `/api/content`.

### 5.6 Content hub (temples, lords, aartis, festivals, poojas, chadhava, events, live, horoscope, panchang)
One editor shell for all: left list with status chips, right form, **Draft / Scheduled / Live / Archived**, *publish at*, preview in a phone frame (reusing the app's card components via a shared preview renderer), history & restore, duplicate, bulk actions (enable/disable/delete/export), CSV/JSON import with dry-run, field-level validation from the registry pattern, translation completeness meter. Specifics: **map picker** for temple lat/lng (MapLibre in the dashboard, same free stack), deity ↔ temple ↔ pooja relationship pickers with "used by" counts, aarti schedules, festival calendar import, per-record "where does this appear in the app?" links.
**Media library**: every uploaded file with thumbnail, size, type, uploader, **usage references** (which rows use it), search/tags, replace-in-place (keeps URL via alias), safe delete, **orphan scan + cleanup** (fixes the known GridFS orphan gap), license/credit field (the new image pack's credits live here), drag-drop upload with crop to the recommended size.

### 5.7 Insights
Adoption by version (stacked over time) · DAU/WAU/MAU · new vs returning · retention cohorts (D1/D7/D30) · funnels (open → pooja detail → checkout → booked; events join → complete) · coin revenue & packs · notification performance · top content · live darshan peak viewers · export. Built on the existing analytics ingest extended with a small, documented event schema; pre-aggregated hourly into a rollup collection so charts are instant on free Mongo.

### 5.8 Governance
Custom roles (matrix of area × view/edit/**approve**; the three built-ins remain as presets) · **Approvals**: configurable rules (raise min version, enable maintenance, send to > N people, adjust wallet > X coins, delete user, publish Home to everyone) create a pending request that a *different* operator approves, with expiry · **Audit log UI** with filters, before/after diff for config/content, export · operator **2FA (TOTP)** and session list/revoke · optional IP allow-list for the dashboard · PII masking stays server-side.

## 6. System architecture

```
 Dashboard (React/Vite)  ──cookie──►  admin-bff ──service JWT──►  engagement ★ (config · flags · policy · campaigns · analytics)
                                         │                       identity    (users · devices · block · sessions · push registry · operators · audit)
                                         │                       catalog     (content · media · home layouts · places)
                                         │                       wallet / orders / calls / events (unchanged)
 Phone app  ◄──────────────► mobile-bff ─┘   (adds: version gate middleware, resolved-config endpoint, inbox, preferences)
```
**Service placement (no new service by default).** ★ **engagement** becomes the *control plane*: it already owns flags, settings, announcements, analytics and the Expo push path, so it
also gains: `VersionPolicy`, `AppRelease`, `ConfigKey/Rule`, `Campaign/Segment/InboxItem/NotificationPref`, the campaign worker, rollups. **identity** gains: device registry (version, OS), block reason/message/expiry, force-logout, user 360 aggregate endpoint (fan-out to wallet/orders/events/calls with timeouts, partial results allowed). **catalog** gains: media registry with usage references + orphan scan, content drafts/schedules. If engagement's load or RAM becomes a problem, the campaign worker can be split into `notifications` without API changes (same internal routes).
**Version gate (hot path).** mobile-bff keeps `policy` in memory (refresh 30 s, stale-while-error 1 h, fail-open); per-request cost is one integer comparison. Every 426 is counted for the dashboard ("blocked requests by version").
**Queues/schedules.** One generic `Job` collection (type, runAt, lease, attempts, payload) polled by a worker in engagement; the same code runs scheduled campaigns, scheduled config changes, expiring blocks and rollup builds. No Redis.
**Security.** New admin areas (`releases`, `notifications`, `segments`, `config`, `media`, `approvals`, `insights`, `audit`) added to `access/permissions.js`/`routes.js` with a test per route; every write audited with before/after; approvals enforced server-side (the UI only reflects them).
**Dashboard architecture.** Keep React/Vite and the kit. Changes: (1) real **nested router** (path-based, deep links, route-level permission guards) replacing hash tabs — one small dependency (`react-router`) or an in-house router, decision below; (2) **module registry** extending `tabs.js` (module → pages → breadcrumbs/permissions/command-palette entries); (3) a shared **data layer** (request cache, dedupe, optimistic updates, polling) — in-house hooks first; (4) new kit parts: Drawer, FilterBar + saved views, DataTable v2 (server paging, column chooser, bulk select), SegmentBuilder, Timeline, DiffView, ConfirmWithReason, ImpactPreview, PhonePreview (shared), charts (SVG, no heavy lib), Wizard; (5) lazy-loaded routes to keep the bundle small; (6) keep the `check-deps`/`check-access` guards and extend them to modules.

## 7. App changes required (small, mostly additive)
1. Send version/platform/OS headers on every request; fix the hard-coded `appVersion`.
2. **Policy gate** component at the root: call `/api/app/policy` at launch/resume; render Update-required / Blocked-build / Maintenance / Unsupported-OS screens; soft nudge banner; cache the last policy.
3. Handle `426 app_outdated` from any API call (route to the same screen).
4. Notification inbox + unread badge + preferences; route every notification Action type.
5. *Account blocked* screen with the operator's message.
6. Resolved remote-config client (ETag cached) replacing ad-hoc flag/setting fetching; remote string overrides.
7. Report richer analytics events per the documented schema.

## 8. Phased roadmap (each phase ships and is verified on the phone before the next)
| Phase | Scope | Done when |
|---|---|---|
| **0 Foundations** | version telemetry from the app; `Device` upsert; audit UI + before/after; new shell (grouped nav, ⌘K, breadcrumbs) behind a switch; router/module registry | every request carries version headers; operators can reach any page in ≤ 2 clicks |
| **1 Releases & gating** | policy models + endpoint + BFF gate + app gate screens; Releases dashboard with impact preview; maintenance mode; approvals v1 | a build below min is blocked on the phone with the operator's message; blocked-requests counter moves; fail-open proven by killing the service |
| **2 Users 360 & blocking** | user detail, block with reason/message/expiry, force logout, device blocks, user notes/tags, exports | block shows the themed screen within seconds; revoke works; actions audited |
| **3 Notifications** | segments, campaigns, composer, worker, inbox, preferences, stats | targeted test campaign to a segment and to one user arrives (app open, background, killed) and appears in the inbox |
| **4 Content hub & media** | unified editor shell, drafts/schedules/history, media library with usage + orphan scan, map picker, import/export | existing content tabs migrated without data loss; an orphan scan removes unreferenced files safely |
| **5 Remote config & app copy** | typed config + rules + rollouts + schedules; string overrides; kill switches | flip a flag for 10% of devices; schedule a change; roll back |
| **6 Insights & governance** | rollups, charts, funnels; custom roles; 2FA; session mgmt | dashboards load < 1 s on tester data; custom role limits a real operator |

## 9. Testing and quality
Contract doc per phase · service tests on a throwaway Mongo (Node 24 + 20.19.4) · gate tests (matrix of version × policy × fail-open/closed) · queue tests (lease, retry, resume, cancel, idempotency) · segment evaluator tests with fixtures · BFF/permission tests for every new route · dashboard pure-logic tests + headless-Chrome screenshots against the boards · device test on the phone (kill/background/foreground, offline, blocked build via a second APK) · migration tests (existing tabs → modules, flags/settings → config, announcements → campaigns) · no real third-party sends in tests (FCM stubbed); one owner-run live send per phase.

## 10. Risks and mitigations
* **Locking out all users** with a bad min version → fail-open lookup, grace date, impact preview, approval, one-click rollback, panic "unblock all".
* **Accidental mass notification** → recipient count confirm, approval above a threshold, frequency caps, cancel mid-send, test-send first.
* **Privacy** → segments computed server-side, previews masked, exports gated + audited, notification preferences honoured (DPDP-style consent: opt-out per category; transactional exempt).
* **Engagement service growth** → clean module boundaries, split-ready worker.
* **Scope** → strict phases; the old tabs stay reachable until their replacement is verified.
* **Free hosting limits** → rollups and caching keep Mongo/ngrok usage low; no new always-on infra.

## 11. Decisions needed before Phase 0
1. "Android version" = **app build version** (versionCode) — plus optionally **Android OS level**? (plan supports both; OS gate is a notice, not a block).
2. Version-gate failure mode: **fail open** (recommended) or closed.
3. Notification scope for v1: push + in-app inbox (recommended); SMS/email/WhatsApp are out of scope.
4. Approvals (second operator) for risky actions: on by default (recommended) or optional.
5. Router/data libs: add `react-router` (recommended) vs in-house; in-house data hooks first.
6. Service placement: engagement as control plane (recommended) vs a new `notifications` service now.
7. Design: boards for the new shell, Releases, Notification composer, Segments, Users 360, Config, Media library, Insights to be drawn in the canvas (this doc's wireframes are the brief).

## 12. Wireframes (structure, not pixels)

**Shell**
```
┌───────────────┬──────────────────────────────────────────────────────────────────────────┐
│ ॐ Bhakti      │ ⌕ Search or jump… ⌘K        [TESTER]            🔔 2 approvals   admin ▾ │
│ ▸ Overview    ├──────────────────────────────────────────────────────────────────────────┤
│ PEOPLE        │ Releases & control › App releases                                         │
│  Users        │ ┌ Policy ────────────────────────────────────────────────────────────┐   │
│  Segments     │ │ Minimum version   [ 12 ▾ ]  → blocks 412 devices · 305 users (7d)   │   │
│  Notifications│ │ Recommended       [ 14 ▾ ]  → nudges 1,204 devices                  │   │
│ RELEASES      │ │ Blocked builds    [ 11 ×] [ + add ]                                 │   │
│  App releases │ │ Grace until       [ 24 Oct 18:00 ]     Fail-open ● on               │   │
│  Remote config│ │ Message EN/HI …                       [ Preview on phone ]          │   │
│ EXPERIENCE …  │ │            [ Discard ]  [ Request approval ▸ ]                     │   │
└───────────────┴──────────────────────────────────────────────────────────────────────────┘
```
**Impact preview (inside Releases)**
```
 Versions in use (last 30 days)         ▇▇▇▇▇▇▇▇▇▇ 14  61%   ← recommended
                                         ▇▇▇▇▇ 13  22%
                                         ▇▇ 12  9%
                                         ▇ 11  5%   ✖ blocked   ▏ min = 12 would block 11 (5%) …
```
**Notification composer**
```
 1 Audience   (•) Segment [ Lapsed 14d · Hindi ▾ ] ≈ 3,208 people    ( ) Everyone  ( ) Specific users
 2 Content    Title [EN][HI]  Body [EN][HI]  Image ▢  Opens [ Event ▾ nine-day-japa ]  Category [Festival ▾]
 3 Delivery   (•) Send now  ( ) Schedule [ 28 Oct 06:30 IST ]  Quiet hours respected ✔  Max 1/day ✔
 4 Preview    [ push ] [ inbox ] [ modal ]  ▢ phone frame        [ Send test to me ]
 5 Review     Reaches 3,208 · needs approval (> 1,000)         [ Request approval & send ▸ ]
```
**Users 360**
```
 Priya Rao  ••4821     ● active 2h ago   [ Message ] [ Block ▾ ] [ Force sign-out ] [ Adjust coins ]
 Profile | Devices (2) | Wallet 1,461 | Bookings 3 | Events 2 | Calls | Notifications | Timeline | Audit
 Devices: Pixel 7 · Android 14 · v13 (1.3.0) · push ON · last seen 2h      Moto G · v11 ✖ blocked build
```
**Segment builder**
```
 Name [ Lapsed festival buyers ]      Match ( all ▾ ) of:
 [ Last active ▾ ][ more than ▾ ][ 14 ] days   [×]
 [ Has booking ▾ ][ in the last ▾ ][ 90 ] days [×]      [ + rule ]      ≈ 842 users   [ Preview 20 ]
```
