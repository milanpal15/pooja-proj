# App releases, version gating, maintenance, approvals and the new dashboard shell — Phases 0 + 1 (contract)

Authoritative for Phases 0–1 of `docs/DASHBOARD_REVAMP.md`. The engagement service, both BFFs, the dashboard and the app are built to THIS file;
if an implementation must differ, change this file in the same commit. Decisions taken (2026-10-16): block by **app build version**, plus an **Android OS
notice** (not a block); version gate **fails open**; risky actions need a **second operator's approval** by default; build Phase 0 then Phase 1.

## 0. Principles
1. The server tells each build what to do; the app obeys. A policy lookup failure **never** blocks anyone (fail open, last cached policy is used).
2. Relief is never gated: lowering the minimum, removing a block, turning maintenance OFF apply immediately. Only changes that can lock users out need approval.
3. No invented numbers: impact figures are counted from real `Device` rows.
4. Everything is audited with who/when and (for these writes) before/after.

## 1. Telemetry (Phase 0)
The app sends on EVERY API call to the mobile BFF: `X-App-Platform: android`, `X-App-Version: <versionName>`, `X-App-Version-Code: <int>` (from `expo.android.versionCode`; set
`"versionCode": 1` in app.json if absent and document bumping it per release), `X-OS-Api: <int>` (Android API level), and the existing device id as `X-Device-Id`.
**Device registry** (engagement; extend the existing analytics `Device` model, keep old fields): `deviceId*` (unique), `platform`, `versionName`, `versionCode`, `osApi`, `model`, `uid|null`
(set when the policy call is authenticated), `firstSeen`, `lastSeen`. It is upserted by `GET /api/app/policy` (launch/resume, throttled by the app to once per 10 min) — NOT per request, so telemetry costs
one write per launch. The hard-coded `appVersion: '1.0.0'` in the app's analytics bootstrap is replaced by the real values.

## 2. Models (engagement service)
```
AppRelease { _id, platform:'android', versionName*, versionCode*, notes, notesHi, storeUrl, status:'draft'|'live'|'withdrawn', releasedAt, createdBy, createdAt }   // unique (platform, versionCode)
VersionPolicy (exactly one per platform, `platform` unique) {
  platform:'android', minVersionCode: int|null, recommendedVersionCode: int|null, blockedVersionCodes: [int],
  minOsApi: int|null, graceUntil: date|null, snoozeDays: 1..30 (default 3),
  message, messageHi (≤ 300 chars; the text users read), storeUrl,
  maintenance: { enabled:false, message, messageHi, until: date|null, allowUids: [string] (≤ 50) },
  blockUnversioned: false,     // also refuse app routes from callers that send no X-App-Version-Code
  version: int (increments on every change), updatedAt, updatedBy }
ApprovalRequest { _id, type:'version_policy', payload:{ before, after }, summary (human text), requestedBy, requestedAt, status:'pending'|'approved'|'rejected'|'expired'|'cancelled',
  decidedBy, decidedAt, note, expiresAt (requestedAt + 24 h), selfApproved:false }
VersionBlockCount { platform, versionCode, day:'YYYY-MM-DD'(IST), count }           // blocked requests, flushed by the BFF every 60 s
```
Seed: `VersionPolicy` with all gates empty/null and maintenance off; no releases.

## 3. The decision (one pure function, shared)
`evaluatePolicy(policy, { versionCode, osApi, uid, now })` lives in `@bhakti/common` (so engagement and the BFF gate use identical logic) and returns
`{ status, message, messageHi, storeUrl, minVersionName, recommendedVersionName, graceUntil, snoozeDays, maintenanceUntil }`. Order:
1. **maintenance**: `maintenance.enabled` and now < `until` (or until null) and `uid` not in `allowUids` → `status:'maintenance'` (message = maintenance message).
2. **blocked**: `versionCode` ∈ `blockedVersionCodes` → `'blocked'`.
3. **update_required**: `minVersionCode != null && versionCode < minVersionCode` and (`graceUntil` null or now ≥ `graceUntil`) → `'update_required'`. While now < `graceUntil` the build gets `'update_available'` with `graceUntil` set (the app says "update by <date>").
4. **unsupported_os**: `minOsApi != null && osApi < minOsApi` → `'unsupported_os'` (a notice; NOT blocking).
5. **update_available**: `recommendedVersionCode != null && versionCode < recommendedVersionCode` → `'update_available'`.
6. else `'ok'`.
A missing/invalid `versionCode` = unidentified → `'ok'`, unless `blockUnversioned` (then `'update_required'`). Blocking statuses: `maintenance`, `blocked`, `update_required`.
Version names for messages come from `AppRelease` rows matching the codes (else "build N").

## 4. Public API (mobile BFF, no auth required; token optional to identify the user)
`GET /api/app/policy?platform=android&versionCode=<int>&osApi=<int>` (+ `X-Device-Id`) → 200
`{ status, message, messageHi, storeUrl, minVersionName, recommendedVersionName, graceUntil, snoozeDays, maintenanceUntil, serverTime }`. Upserts the `Device` row (§1). Never 5xx to the phone: on an internal failure answer
`200 { status:'ok', degraded:true }`.
**Gate** (middleware on every mobile-BFF route except `/api/app/policy`, `/api/health`, `/health/*`, `/uploads/*`, `/api/webhooks/*`): reads the headers; evaluates against the BFF's in-memory policy; for a blocking status answers
`426 { error, code:'app_outdated', status:'update_required'|'blocked', message, messageHi, storeUrl, minVersionName }` or, for maintenance, `503 { error, code:'maintenance', status:'maintenance', message, messageHi, maintenanceUntil }` — and counts it in memory. Policy
source: `GET /internal/engagement/policy` (refresh every 30 s, stale-while-error up to 1 h, **fail open**: no policy loaded or any error ⇒ pass). The signed-in uid (when the BFF already verified a token) is used for `allowUids`. Counters flush to engagement every 60 s (`POST /internal/engagement/policy/blocked-counts`).

## 5. Admin API (admin BFF; areas `releases` and `approvals` — add to `permissions.js` and the access tables; admin edits, editor and viewer view; add to the pooja-api parity exemptions)
* `GET /api/admin/releases` → `{ releases:[AppRelease], policy: VersionPolicy, approvalsEnabled: bool, pending: [ApprovalRequest] }` · `POST /api/admin/releases` · `PUT /api/admin/releases/:id` · `POST /api/admin/releases/:id/withdraw`.
* `PUT /api/admin/version-policy` `{ …policy fields }` → validated (`400 bad_policy {fields}`: ints ≥ 0, `recommended >= min`, `blocked` ≤ 50 codes, messages ≤ 300, `until`/`graceUntil` valid, allowUids ≤ 50). **Risky** = (min raised) OR (a code added to blocked) OR (maintenance turned on) OR (`blockUnversioned` turned on) OR (`graceUntil` brought earlier). If risky and approvals are enabled and at least 2 active operators hold `approvals:edit` → `202 { approval: ApprovalRequest }` (nothing applied). If risky but the requester is the ONLY approver-capable operator → applied immediately with `selfApproved:true` on the audit row (no deadlock). Non-risky (relief or cosmetic) → `200 { policy }`. All responses carry the new `version`.
* `POST /api/admin/version-policy/impact` `{ minVersionCode?, recommendedVersionCode?, blockedVersionCodes?, minOsApi? }` (a hypothetical; unspecified fields use the current policy) → `{ devices:{ total, blocked, nudged, unsupportedOs }, users:{ blockedActive7d, blockedActive30d }, activeWindowDays:[7,30], byVersion:[ { versionCode, versionName|null, devices, activeDevices7d, activeUsers7d, pctOfActiveDevices7d } ] }` — counts only from `Device` rows with `lastSeen` in the window; users = distinct `uid`.
* `GET /api/admin/versions/usage` → `{ byVersion:[…as above…], total, blockedRequests:[{ versionCode, count7d, countToday }] }`.
* **Approvals**: `GET /api/admin/approvals?status=` · `POST /api/admin/approvals/:id/approve` `{note?}` (approver ≠ requester; `409 own_request`) re-validates and applies the payload atomically → `{ approval, policy }` · `POST …/reject` `{note}` · `POST …/cancel` (requester only). A pending request expires after 24 h (status `expired`, sweeper). `GET /api/admin/approvals/settings` / `PUT` → `{ approvalsEnabled }` (admin; default true; turning it OFF is itself approval-free but audited).
* **Audit**: `GET /api/admin/audit-log?operator=&area=&method=&from=&to=&limit=&before=` (cursor) → `{ items:[{ id, at, operator, role, area, method, path, targetId, status, selfApproved?, before?, after? }], next }` (admin only — `audit` area). `before`/`after` (JSON, ≤ 8 KB each, secrets/PII stripped) are recorded for version-policy, release and approval writes: the service sets response header `X-Audit-Detail` (base64 JSON `{before,after}`), the admin BFF's existing audit hook stores it and strips the header before replying.
* Session: `GET /api/admin/session` gains `environment: 'local'|'tester'|'production'` (from `APP_ENV`, default `local`; `tools/tester.sh` sets `tester`; `render.yaml` sets `production`).

## 6. App (Phase 1)
* Send the §1 headers on every request (central fetch wrapper); fix the analytics `appVersion`.
* `PolicyGate` at the root (inside the providers that exist, outside the app stack): calls `/api/app/policy` at launch and on foreground (≥ 10 min apart), caches the last good answer in AsyncStorage (used when offline), and handles a `426`/`503 maintenance` from ANY call by switching to the same screen.
  Screens (themed, EN/HI, accessible): **Update required** and **Blocked build** (full-screen, no dismiss/back, store button via `Linking`, hidden when `storeUrl` empty, message from the server in the app language), **Maintenance** (message, "until" time, Retry), **Unsupported OS** (dismissible notice once per launch), **Update available** (dismissible banner/sheet, snoozed for `snoozeDays` in AsyncStorage, shows `graceUntil` when set).
* Fail open everywhere: policy unreachable + no cache ⇒ the app runs normally.
* Nothing in the gate may delay first paint: Home renders; the gate overlays when an answer says so.

## 7. Dashboard
**Phase 0 shell** (no new dependencies): grouped collapsible sidebar per `DASHBOARD_REVAMP.md` §4 (existing tabs mapped into the groups; unbuilt modules simply absent); an in-house nested hash router (`#/group/module/<id>`; old `#Tab` links still resolve); a module registry extending `tabs.js` (title, group, area, route, breadcrumb, `searchable` entries); breadcrumbs; **⌘K / Ctrl-K command palette** (jump to any module you may see; record search for Users and Temples via their existing list endpoints, debounced, results masked as the API masks them); environment badge from the session; the bell shows pending approvals count (polling 60 s) for operators with `approvals:view`.
**Phase 1 pages:** **App releases** (releases timeline + "New release" wizard; policy editor with Minimum / Recommended / Blocked builds / OS notice / Grace / Message EN+HI / Store URL / Fail-open note; **Impact preview** that updates as fields change (debounced `…/impact`) with a versions bar chart; **Maintenance** card with allow-list; "Preview on phone" mock of each blocking screen; Save → either applied, or "Sent for approval" banner with the pending request; panic actions "Block this build" and "Turn maintenance off" immediate), **Approvals** (queue with before→after diff, approve/reject with note, own-request lock, history), **Audit log** page (filters, cursor paging, row expands to the before/after diff, CSV export of the visible page). Viewers/editors see read-only. All writes toast per the existing pattern.

## 8. Backend as built (binding for the dashboard and the app; these fill in what §1–§5 left open)
* **Device registry** is the existing analytics model (`Visitor`, collection `visitors`) extended in place; `lastSeen` is the registry clock (also touched by the analytics ingest). Rows written before this have `lastSeen = lastActive` (boot migration) and no `versionCode` (listed as "unknown build" with `versionCode:null`).
* `evaluatePolicy(policy, { versionCode, osApi, uid, now, names })` — `names` (Map / object / function code→name) is an addition so messages can say "1.5.0"; unnamed codes read "build N". A missing/invalid code is `ok` (or `update_required` with `blockUnversioned`), but **maintenance still applies to it**, and the OS notice is not judged for it.
* `GET /api/app/policy` accepts the three values as query **or** the `X-App-*` / `X-OS-Api` headers; `X-Device-Id` names the device; `X-Device-Model` (or `?model=`) is stored. Degraded answer: `200 { status:'ok', degraded:true, serverTime }` — if the BFF still holds a good cached policy it evaluates that instead (`degraded:true` stays).
* **Releases**: `POST` defaults `status:'draft'` (`'live'` stamps `releasedAt`); `versionCode` is immutable; `/withdraw` is final; errors `400 bad_release {fields}`, `409 release_exists`, `409 already_withdrawn`. Rows expose `_id`.
* **Version policy** `PUT` merges a partial body over the current policy (`maintenance` merges too). Replies: `200 { policy, version }` (applied), `200 { policy, version, unchanged:true }` (no-op: no bump), `200 { …, selfApproved:true }` (risky, you are the only approver-capable operator), `202 { approval, version }` (queued), `503 approvers_unavailable` (risky only, identity unreachable), `409 policy_changed` (lost a race), `400 bad_policy { fields:{ "maintenance.until": "…" } }`. A self-approved change also leaves an `approved` history row (`selfApproved:true`). "Block this build" = add the code to `blockedVersionCodes` — risky, so it is queued or self-approved like any other.
* **Impact** `POST …/impact`: a field **present in the body (null included) overrides** the current policy, an **absent** field falls back to it. Grace and maintenance are ignored (it reports the eventual effect). `devices.total` = devices seen in the last 30 days. `versions/usage.total` is the same number.
* **Approvals**: `GET /api/admin/approvals?status=pending|approved|rejected|expired|cancelled|all` → `{ approvals:[ApprovalRequest + changes[]] }` (newest first, ≤ 200; expiry is settled on read). `approve|reject|cancel` → `{ approval, policy }` (reject/cancel: `{ approval }`). Errors: `409 own_request`, `409 expired`, `409 not_pending`, `409 stale_policy` (policy moved since the request; reject and re-ask), `403 not_requester`, `400 note_required` (reject). `GET|PUT …/approvals/settings` → `{ approvalsEnabled }`. `cancel` needs `approvals:edit` like the other decisions. `GET /api/admin/releases` → `pending` = the pending ApprovalRequests.
* **Audit**: `GET /api/admin/audit-log` → `{ items:[{ id, at, operator, role, area, method, path, targetId, status, selfApproved?, before?, after? }], next }`; `before=<next>` pages; `from`/`to` ISO dates inclusive; limit default 50, max 200; bad filter → `400 bad_filter {fields}`. The old `{entries}` shape is gone. Impact previews (a POST that only reads) are not audited. Version-policy details keep `allowUidsCount`, never the ids. The `X-Audit-Detail` header must fit the HTTP header limit, so each side is replaced by `{_truncated:true}` when the encoded detail exceeds ~9 KB (policy/role/release details are far smaller).
* **Gate**: `426 { error, code:'app_outdated', status, message, messageHi, storeUrl, minVersionName }`; `503 { error, code:'maintenance', status, message, messageHi, maintenanceUntil }` + `Retry-After`. Exempt: `/api/app/policy`, `/api/health`, `/health*`, `/uploads*`, `/api/webhooks*`, OPTIONS. Without `ENGAGEMENT_URL` there is no gate.
* Session: `environment` is on every `GET /api/admin/session` answer (signed-out too) and `roleName` on the signed-in one.
