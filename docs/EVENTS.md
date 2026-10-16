# Events — contract (app, dashboard, `events` service)

Authoritative contract for the Events feature. The service, the BFFs, the dashboard and the app are built against THIS
file; if an implementation must differ, change this file in the same commit.

**Design source** (do not guess — read the boards): canvas `https://claude.ai/artifact/7d898088-20f3-4870-882c-2d7fe20386ed`,
boards `EventsList`, `EventYatra`, `EventGarba`, `MilestoneDone` (app) and `DashEvents`, `DashEventEditor` (dashboard).
Saved copies: `<scratchpad>/artifact-files/7d898088-20f3-4870-882c-2d7fe20386ed/project/`. Yatra and Garba Night are two
*example compositions*, not special cases.

**Where it lives:** the new service `backend/services/events` (own database, same cluster), reached through
`bff/mobile` (devotee routes) and `bff/admin` (operator routes). **Nothing is added to `pooja-api`** (it stays the rollback).

## 0. Principles

1. **Nothing branches on an event type.** A type is a *preset* (name, colour, default blocks). No code, in any project,
   may test `type === 'yatra'`. An operator can create any new kind of event in the dashboard.
2. **An event is a set of optional blocks** (§2). The app renders the blocks that are present; the editor toggles them.
3. **Task kinds are a registry** (§4), not an enum. Adding a kind = one server module (+ one small app renderer for an
   interactive kind); the dashboard rule builder and validation read the registry.
4. **The server decides completion.** The client reports facts (a tap, a count, a heartbeat, a photo); it never sends
   "milestone done". Milestones cannot be marked done from the dashboard.
5. **Honesty.** `[N] registered`, `spots left`, completion rates, ratings appear only when real. No seeded sample events.
6. **Money.** Coins only. The wallet service is the only code that changes a balance; every credit/debit carries an
   idempotency key; a refund references its debit (`ofKey`).
7. **Time** is IST on the server. Opening rules are computed server-side; a wrong phone clock opens nothing.
8. **Fail-safe forward compatibility.** Every event stores `schemaVersion`; every task kind declares `minAppVersion`.
   An app that does not know a block or task kind hides the block / shows "Update the app to complete this".

## 1. Models (`events` service)

**EventType** `slug*` (unique), `name*`, `nameHi`, `color` (hex), `gradient?` ([hex,hex]), `description`, `defaults`
(partial Event blocks used to prefill the editor), `order`, `enabled`. Seed (only into an empty collection): Garba Night,
Yatra, Vrat, Japa. A type with events cannot be deleted (409 `in_use`), only disabled.

**Event**
```jsonc
{ "slug": "", "schemaVersion": 1, "typeSlug": "", "tags": ["slug"],
  "title": "", "titleHi": "", "summary": "", "summaryHi": "", "cover": "/uploads/..", "language": "all|en|hi",
  "theme": { "color": "#", "gradient": ["#","#"] },          // falls back to the type's
  "published": false,                                          // the dashboard "Show" switch
  "seriesId": null,                                            // reserved for recurrence (phase 6)
  "blocks": [ "schedule", "registration", "venue", "milestones", "rewards", "content" ],  // present AND ordered
  "schedule":     { "mode": "single|multiday|always", "startsAt": iso, "endsAt": iso|null },
  "registration": { "mode": "none|free|coins", "coins": 0, "capacity": null, "opensAt": iso|null, "closesAt": iso|null,
                    "pass": true,                              // QR pass issued on joining
                    "fields": [ { "key": "", "label": "", "labelHi": "", "type": "text|choice|number", "required": false, "options": [] } ] },
  "venue":        { "name": "", "city": "", "address": "", "lat": null, "lng": null, "organiser": "", "onlineUrl": "" },
  "milestones":   { "order": "daily|sequential|any", "missed": "catch_up_next|lock_at_end|catch_up_any",
                    "completion": { "rule": "all|atLeast|any", "n": null },
                    "items": [ Milestone ] },
  "rewards":      [ { "kind": "coins|badge|certificate", "coins": 0, "badgeSlug": "",
                      "trigger": { "on": "milestone|event", "milestoneKey": "" } } ],
  "content":      { "body": "", "bodyHi": "", "gallery": ["/uploads/.."], "faq": [{ "q": "", "a": "" }], "links": [{ "label": "", "route": "" }] } }
```
**Milestone** `{ key* (stable, never reused), title, titleHi, summary?, opensAt: iso|null, coins: 0,
link: { label, route }|null, completion: { rule: "all|atLeast|any", n }, tasks: [ Task ] }`.
**Task** `{ key* (stable), kind*, title, titleHi, config: {…per kind…} }`.

Validation (400 `bad_event` with `fields`): slug auto from title (unique; reserved slugs rejected: `badges`, `mine`, `new`); `blocks` contains only known block names and
every listed block has its object; `schedule.endsAt >= startsAt`; milestone/task keys unique; ≤ 60 milestones, ≤ 8 tasks
per milestone; every task validated by its kind (§4); referenced stream/listing/pooja/temple/badge must exist (looked up
in catalog); `registration.mode==="coins"` needs `coins ≥ 1`; `capacity` ≥ 1 or null; reward badge exists.
An event with `published:true` must be valid and have a schedule block.

**Phase-1 implementation notes** (what the service actually does): `venue.templeSlug` (optional) is a catalog-checked reference; `bhajan_listened.aartiSlug` is checked against catalog's aartis; a blank milestone/task `key` is generated (`m1`, `t1`); removed milestone keys are retired and refused if reused; a draft may lack a schedule, a published event may not; the Card also carries `rewardCoins` and `summaryHi`; `GET /admin/events/task-kinds` rows also carry `minAppVersion`; `interactive` is true for `self_mark`, `counter`, `location`, `photo`; the service listens on port 4090 and its routes are `/internal/events/admin/{events,event-types,event-badges}` and `/internal/events/public/events[/:slug]`.

**Derived `status`** (never stored): `draft` (!published) · `scheduled` (now < startsAt) · `registration_open`
(registration block, window open, not full, before end) · `live` (started, not ended) · `ended`. `always` mode is `live`
while published (unless given an explicit `endsAt`). `registration_open` applies only BEFORE the start: once started the event is `live` (joining stays possible while the window is open). A `single` event with no `endsAt` ends at the close of its IST day. `full` is a flag on the card when capacity is reached.

**Badge** `slug*`, `name*`, `nameHi`, `art?`, `description`. **UserBadge** `(uid, badgeSlug, eventSlug, earnedAt)`, unique
`(uid, badgeSlug, eventSlug)`.

**Registration** `(uid, eventSlug)` unique: `status: "pending|joined|cancelled"`, `passCode` (`<PREFIX>-<4 chars>`, unique
per event, unambiguous alphabet), `answers: {fieldKey: value}`, `paidKey`, `checkedInAt`, `joinedAt`.
**Intent** (paid join saga, same pattern as orders): `(uid, eventSlug, requestId)` → `debited | refunded | done`, swept.

**TaskProgress** `(uid, eventSlug, milestoneKey, taskKey)` unique: `state: {…per kind…}` (e.g. `{count}`, `{seconds}`),
`completedAt`, `how` (evidence line shown on the completion sheet, localisable `{en,hi}`), `source` (`app|signal|volunteer|operator-approval`).
**MilestoneResult** `(uid, eventSlug, milestoneKey)` unique: `completedAt`, `coinsKey`. **EventResult** `(uid, eventSlug)`:
`completedAt`. **PhotoSubmission** `(uid, eventSlug, milestoneKey, taskKey)`: `media`, `status: pending|approved|rejected`, `reviewedBy`.
**Signal** log `(uid, kind, ref)` unique with TTL, so a replayed signal lands once.

## 2. Blocks

`schedule`, `registration`, `venue`, `milestones`, `rewards`, `content`. Any subset is valid:
a talk = schedule + venue + registration(free); an open vrat = schedule(always) + milestones; Yatra = schedule(multiday) +
milestones(daily) + rewards; Garba Night = schedule(single) + venue + registration(free,pass) + milestones + rewards.
The app's detail screen renders **only the blocks present, in `blocks` order**.

## 3. Completion engine (events service)

Inputs: a **progress report** from the app (`POST …/progress`) or a **signal** from another service (§5.3).
For each report the engine: loads the registration (required when the event has `registration.mode!=="none"`), checks the
milestone is **open** (`opensAt` ≤ now (IST) and the `missed` policy window), asks the task kind to `evaluate(state, report,
ctx) → { state, done, how }`, upserts TaskProgress (atomic, replay-safe), then re-evaluates the milestone's
`completion` rule; on first completion writes MilestoneResult and credits `milestone.coins` and any `rewards[]` whose
trigger is that milestone (wallet credit, key `event-ms:<slug>:<milestoneKey>:<uid>`); then the event `completion`
rule; on first completion writes EventResult, grants rewards with trigger `event` (key `event-done:<slug>:<uid>`) and the
badge. A wallet failure never loses completion: the credit is retried by the sweeper using the same key.
Opening rules: `daily` — a milestone's `opensAt` is its day; `sequential` — milestone n opens when n−1 is complete (and
`opensAt` if set); `any` — only `opensAt`. Locked milestones are returned as `{key,title,opensAt,locked:true}` with no tasks.
Editing a live event never un-completes anything; a changed rule applies to tasks not yet completed.

## 4. Task-kind registry

A kind is one module in `services/events/src/tasks/<kind>.js` exporting:
`{ kind, title, minAppVersion, configSchema, signals: [signalKind…], validate(config, ctx), evaluate(state, report, ctx), summary(config,lang) }`
and is listed in `tasks/index.js`. `GET /api/admin/events/task-kinds` returns `[{ kind, title, configSchema, signals, interactive }]`
(the dashboard builds the rule form from `configSchema`; no dashboard code per kind). Initial kinds:

| kind | config | report (app) | rule |
|---|---|---|---|
| `self_mark` | – | `{}` | done on report while open |
| `counter` | `{label,target}` | `{add}` or `{set}` | rate-capped; state.count ≤ target; done at target; resumable |
| `live_darshan` | `{streamSlug,minutes}` | `{streamSlug,seconds}` heartbeat (≤ 1 per 20 s) | counts only while catalog says the stream is `live`; done at minutes×60 |
| `bhajan_listened` | `{aartiSlug,minutes}` | heartbeat | accumulates; done at minutes×60 |
| `chadhava_offered` | `{listingSlug}` | – | signal `chadhava.offered` |
| `pooja_booked` | `{poojaSlug}` | – | signal `pooja.booked` |
| `location` | `{lat,lng,radiusM}` | `{lat,lng}` once | distance ≤ radius, inside the milestone window (client-reported: low-stakes only) |
| `qr_checkin` | – | – | volunteer scan (§5.2); one per registration |
| `photo` | `{needsApproval}` | `{mediaUrl}` | pending → operator approves → done |

## 5. HTTP contract

### 5.1 Devotee (via mobile-bff; Firebase token except where noted)
- `GET /api/events` (auth optional) → `{ types:[{slug,name,nameHi,color}], tags:[…], sections:{ continue:[Card], thisWeek:[Card], upcoming:[Card], mine:[Card], completed:{count,titles:[…]} }, badgesCount }`. Guests get no `continue/mine/completed`. Only `published` events.
  **Card** `{ slug, title, titleHi, summary, tags:[slug], typeSlug, typeName, theme:{color,gradient} (event theme, else the type's, always resolved server-side), cover, venueLabel:"Venue, City"|null, status, full, startsAt, endsAt, registered:int|null (only when real), spotsLeft:int|null (only when capacity set), milestoneCount, rewardLabel?, progress?:{done,total} (when the caller joined) }`.
- `GET /api/events/:slug` → `{ event: Detail }`: Card + blocks + each block's data; `me: { registered, passCode, answers, progress:{done,total}, currentMilestoneKey }`; milestones with tasks and per-task state for the caller, locked ones summarised. Milestone item: `{key,title,titleHi,opensAt,locked,done:bool,completedAt:iso|null,coins,tasks:[{key,kind,title,titleHi,config,done:bool,completedAt:iso|null,state:{…}}]}` (counter: `config.target`, `state.count`); `404 not_found` for unpublished.
- `POST /api/events/:slug/join` `{ requestId, answers? }` → `{ registration, balance? }`. Errors: `409 full`, `409 closed`, `402 insufficient_coins` (+`shortfall`), `400 missing_field` (+`field`), `409 already_joined` (returns the registration).
- `POST /api/events/:slug/milestones/:mKey/tasks/:tKey/progress` `{ …report }` → `{ task, milestone:{done,justCompleted}, event:{justCompleted}, awarded:{coins,badge?}, completion?: CompletionSheet }`. `429 too_fast` is not an error for the app (returns current state).
  **CompletionSheet** `{ title, coins, progress:{done,total}, how:[{text}], next:{title,opensAt}|null }`.
- `POST /api/events/:slug/leave` (free only, before start). `GET /api/me/events`, `GET /api/me/badges`.

### 5.2 Operator (via admin-bff; area `events`, editor writes, viewer reads)
`/api/admin/events` CRUD · `/api/admin/event-types` CRUD · `/api/admin/event-badges` CRUD ·
`GET /api/admin/events/task-kinds` · `GET /api/admin/events/:id/stats` (`{joined, finished, perMilestone:[{key,completedPct}]}`; unknown = null) ·
`GET /api/admin/events/:id/participants` (devotee names/phones masked for roles without access) ·
`POST /api/admin/events/:id/checkin` `{ passCode }` (permission `events:checkin`, held by admin/editor) → completes the `qr_checkin` task of the registration · `GET/PUT /api/admin/events/photos` review queue.
Every route is added to `access/routes.js` in the admin-bff (area `events`; DESIGN.md §21 gets a row); writes are audited.

### 5.3 Internal
`/internal/events/*` behind the service JWT + issuer allowlist. `POST /internal/events/signals` `{ uid, kind, ref, qty?, at }` — emitted by orders (`chadhava.offered`, `pooja.booked`) and any future service. Idempotent on `(uid,kind,ref)`. Orders also exposes a backfill query the engine uses when evaluating signal tasks.

## 6. App (`poojaappclone/src/features/events/`)
Routes (shims): `/events`, `/events/[slug]`, `/events/badges`. Screens: list (Explore / My events, type + tag chips from the API), detail (block composer), counter, completion sheet (themed, not `Alert`), badges. Pure logic with node tests in `lib/` (status, progress ring, heartbeat batcher, counter batcher). Live Darshan's player mounts the heartbeat only when an open event task asks for that stream. Local reminders for the next milestone (like Live Darshan "Remind me"), server push for event start (identity `push/send`). Flag `events` (default **true**); Home gains a dashboard-driven `source:'events'` section; Profile gets "My badges". Deep link `bhakti://events/<slug>`. i18n en+hi. Offline: list/detail cached; join/progress need the network; counter increments queue and flush.

## 7. Dashboard (`pooja-admin/src/client/features/events/`)
Tab "Events" (area `events`) with sub-tabs Events / Event types / Participants; editor with block toggles + registry-driven rule builder; badges manager; photo review. KPIs show "—" when unknown. Roles per DESIGN.md §21.

## 8. Phases
**Status:** phases 1 and 2 are built on the backend (service + both BFF edges, tests green); the app and dashboard for phase 2 are separate work. Phases 3-6 are not started.

1. Contract, `events` service skeleton, types/events/badges CRUD, task-kind registry, dashboard tab, read-only app list + detail, flag.
2. Registration, `self_mark` + `counter`, milestone engine, coin/badge rewards, completion sheet.
3. Signal kinds (`live_darshan`, `bhajan_listened`, chadhava, pooja), reminders + push.
4. In person: pass + volunteer check-in, `location`, `photo` moderation.
5. Paid joining (coin debit, refund saga, capacity), tiers.
6. Recurrence (`seriesId`), certificate, Home section, Profile badges, share.

## 9. Open items (defaults used until the owner decides)
Service placement: **new `events` service**. QR scanning: **dashboard operator on a phone browser**, permission `events:checkin`. Paid events: **phase 5**. Certificate: **phase 6**. Custom registration fields: **in v1**. Layout control: **block order + show/hide only**.

## 10. Phase 2 shapes (registration, self_mark + counter, engine, rewards) — exact, build to these

Scope: free registration only (`registration.mode==="coins"` joins answer `409 {code:"paid_not_available"}` until phase 5), kinds `self_mark` and `counter`, MilestoneResult/EventResult, wallet credits, badges, participants + real stats. Other kinds keep throwing 'not implemented' → the progress route answers `422 {code:"task_not_supported"}`.

**Auth:** join/leave/progress/me routes need a Firebase token (401 otherwise). Detail/list stay auth-optional; the BFF forwards the verified uid as `sub` (already done for reads).

**Join** `POST /api/events/:slug/join` `{requestId, answers?}` → `200 {registration:{status:"joined",passCode|null,joinedAt,answers}, me}` where `me` is the detail `me` object below. Idempotent: a second call returns `200` with the same registration (also `already_joined` is NOT an error in phase 2; return the registration). Errors: `404 not_found`, `409 closed` (outside registration window / event ended), `409 full` (atomic capacity check: count of status=joined ≥ capacity), `400 {code:"missing_field",field}`, `400 bad_answer`. An event with `registration.mode==="none"` needs no join: progress works without a Registration. `passCode` only when `registration.pass`. Pass format `<PREFIX>-<4 chars>`, PREFIX = first 3 letters of slug uppercased, alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
**Leave** `POST /api/events/:slug/leave` → `204`; allowed only before `schedule.startsAt`; frees the spot; progress rows are kept.

**Detail `me`** (null for guests): `{ registered:bool, passCode:string|null, answers:{}, progress:{done:int,total:int}, currentMilestoneKey:string|null, completed:bool }`. Milestones/tasks in the detail now carry real `done/completedAt/state` for the caller (counter: `state:{count}`), a milestone is `done` when its completion rule is met, `progress.done` = completed milestones, `total` = milestones count. Card `registered` = joined count and `spotsLeft` = capacity−joined — **only when the event has a registration block** (null otherwise; `spotsLeft` null when no capacity). The public list's `sections` now fill for signed-in users: `continue` (joined, not completed, status live, sorted by next opens), `mine` (all joined, newest first), `completed` `{count,titles}`; each such Card gains `progress:{done,total}`. `badgesCount` = caller's badges.

**Progress** `POST /api/events/:slug/milestones/:mKey/tasks/:tKey/progress`:
- `self_mark`: body `{}`. `counter`: body `{add:int(1..200)}` or `{set:int}` (set may only increase; never above `config.target`).
- Preconditions (else error): event published & not ended (`409 closed`), registered when registration≠none (`403 {code:"not_registered"}`), milestone open per §3 (`409 {code:"locked",opensAt}`), task exists (`404`), already complete → `200` with current state, no change.
- Counter rate cap: ≥ 1 add per 400 ms per (uid,task); excess → `429 {code:"too_fast", task}` carrying current state (not an error for the app).
- Response `200`: `{ task:{key,done,completedAt,state}, milestone:{key,done,justCompleted}, event:{done,justCompleted}, awarded:{coins:int,badges:[{slug,name,nameHi}]}, completion:CompletionSheet|null, me }`. `completion` is non-null only when THIS call completed a milestone (or the event): `{ title, coins, progress:{done,total}, how:[{text,textHi}], next:{title,titleHi,opensAt}|null, eventCompleted:bool, badges:[…] }`. `how[]` has one line per task of that milestone (`"Chanted 108 times"` / `"Marked done"`; en+hi strings generated server-side from the kind's `summary`).
- Concurrency: TaskProgress upsert is atomic and replay-safe; a milestone/event completion is written exactly once (unique index) even under parallel requests; rewards are credited exactly once.

**Rewards:** milestone `coins` and `rewards[]` of kind `coins` call wallet `POST /internal/wallet/credit` with `{uid, amount, type:"bonus", key:"event-ms:<slug>:<mKey>:<uid>"}` (event-level: `event-done:<slug>:<uid>` … plus `:<rewardIndex>` for multiple). Inspect the wallet service for the exact body/auth and add `events` to the wallet's callerGate/issuers (events may ONLY credit with type bonus and keys prefixed `event-`; enforce that in the wallet, with a test). A wallet failure never loses completion: the MilestoneResult/EventResult stores `pendingCredits[]`; a sweeper (interval, like orders') retries with the SAME key until `credited`. `badge` rewards insert a UserBadge (unique). `certificate` rewards: ignored until phase 6.
**Badges:** `GET /api/me/badges` → `{badges:[{slug,name,nameHi,art,description,eventSlug,eventTitle,earnedAt}]}`; `GET /api/me/events` → `{events:[Card with progress & me-lite]}`.

**Admin:** `GET /api/admin/events/:id/stats` → `{joined:int|null,finished:int|null,perMilestone:[{key,completedCount,completedPct:number|null}],checkedIn:null}` — real counts now (`null` only when there is no registration block AND no progress rows; `completedPct` = completedCount/joined when joined>0 else null). `GET /api/admin/events/:id/participants?cursor=&limit=` → `{items:[{id,name,contact,joinedAt,passCode,progress:{done,total},completed,lastActivityAt}],next}`; name/contact are MASKED (`Devotee ••4821` style, same helper/pseudonym secret as the other masking in the stack) for roles without `devotees:view` (the stack's area is called `devotees`, admin-only; this text used to say `users:view`). Add the route to the admin-bff area table (`events:view`). Rows never contain answers to custom fields unless the role has `devotees:view` (then each row also carries `answers`).
**Honesty:** all counts are computed from real rows; never estimated.

### 10.1 Phase 2 as built (backend) - the details §10 leaves open

Internal routes (events service, `/internal/events/public/...`; the mobile BFF maps `/api/...` onto them): `GET events`, `GET events/:slug`, `POST events/:slug/join`, `POST events/:slug/leave`,
`POST events/:slug/milestones/:mKey/tasks/:tKey/progress`, `GET me/events`, `GET me/badges`. Operator: `GET /admin/events/:id/stats`, `GET /admin/events/:id/participants` (area `events:view`; already covered by the `events` row of the area table).
Every personal route answers **401** unless the token is the mobile BFF's with a `sub` (an operator token's `sub` is never taken for a devotee).

* **Join.** Idempotent: a joined devotee gets `200` with the same registration (same pass, same answers) before any other check. Order of refusals: `404` unpublished -> `409 closed` (no registration block, `mode:none`, the window not open, the event ended) -> `409 paid_not_available` (`mode:coins`) -> `400 missing_field` (+`field`) / `400 bad_answer` (+`field`) -> `409 full`.
  Answers: `text` (a string up to 500), `number` (a number or a numeric string, stored as a number), `choice` (one of `options`); unknown keys are dropped. `registration` in the answer = `{status, passCode|null, joinedAt, answers}`. A cancelled registration is revived on the same row with a fresh pass.
  Capacity: the `Seats` counter is raised with one conditional update (`taken < capacity`); an in-flight join is a `pending` Registration row only that request finishes (a `pending` row older than 30 s is taken over), so parallel joins by one devotee take ONE seat. Joined counts shown are always counted from `joined` rows.
* **Leave.** `204` always when there is nothing to leave; `409 started` once `schedule.startsAt` has passed (an `always` event, or one with no start, can be left any time). The pass is voided, the seat freed, progress and results kept.
* **Not started.** Progress on an event whose `schedule.startsAt` is in the future is `409 {code:"locked", notStarted:true, opensAt}` and the detail's `me.currentMilestoneKey` is `null` until it starts (milestones in the detail are still shown per their own `opensAt`, so a not-yet-started event can be previewed).
* **Opening (rules.js).** `any`: only `opensAt`. `sequential`: also needs the previous milestone's result. `daily` + `missed`: `catch_up_any` stays open until the event ends; `catch_up_next` until the end of the IST day on which the NEXT milestone opens (the last one: until the event ends); `lock_at_end` until the end of its own IST day. A milestone whose window closed answers `409 {code:"locked", missed:true, opensAt}` and appears in the detail as `{locked:true, missed:true}`; a milestone the devotee already completed is never "missed".
  A milestone already complete still accepts reports for its remaining tasks (no effect on the result).
* **Counter.** `add` is a whole number 1..200, `set` a whole number >= 0 (only raises; clamped to the target); anything else `400 bad_report`. A second `add` less than 400 ms after the last accepted one: `429 {code:"too_fast", task:{key,done,completedAt,state}}`, nothing changes (a `set` is never rate-capped and does not start the 400 ms window). Task `state` shown to the app is `{count}` for counter and `{}` for self_mark (internal bookkeeping such as `lastAt` is never sent).
* **Kinds without an engine** (and unknown kinds) answer `422 task_not_supported` after the open checks and write nothing.
* **Rewards.** Keys: milestone `coins` -> `event-ms:<slug>:<mKey>:<uid>`; the i-th entry of `rewards[]` (coins, trigger that milestone) -> `...:<uid>:<i>`; event: ONE coin reward -> `event-done:<slug>:<uid>`, several -> every one `event-done:<slug>:<uid>:<rewardIndex>`. A result row carries `pendingCredits[{key,amount,status,attempts,lastError,...}]`, `badgeSlugs`, `badgesDone`.
  The creating request pays inline; a failure leaves `pending`; `sweep()` (interval `SWEEP_EVERY_MS`) retries with backing-off (10 s x attempts, capped at 80 s) using the same key. `awarded.coins` is what the completion earned (paid or owed); badges are only those newly granted by that call.
  A task completed twice, or a crash between the task write and the result write, is healed by the devotee's next progress call (the result is created then, `justCompleted` true for that call).
* **Wallet side.** `events` is a default allowed issuer of the wallet and may call only `POST /credit` (type `bonus`, key starting `event-`, whole coins 1..100000: else `403 key_not_allowed` / `400 bad_type|bad_amount`) and `GET /txn` for `event-` keys; `/debit`, `/refund`, `/balance`, `/reconcile` stay `403 wrong_issuer`. Identity allows `events` only on `POST /directory/lookup`.
* **Stats.** `completedPct` is a percentage 0-100 with one decimal (`completedCount / joined`), `null` while `joined` is 0 or unknown. `joined` is the number of `joined` registrations, or, for an event with no registration, the number of devotees with any progress; `null` (with `finished: null`) only when there is no registration block and no progress rows.
* **Participants.** Cursor = the last row's `id` (a registration id; for an event with nothing to join, a hash of the uid). `limit` 1..200 (default 50), bad cursor `400 bad_cursor`. Names/contacts are `Devotee ••NNNN` unless the operator holds `devotees:view` (identity is then asked once for the page; if it cannot answer, the pseudonym is shown). Only `joined` registrations are listed. `lastActivityAt` is the latest task write (`null` when none).
* **Sections.** `continue` = taking part, event not finished, status `live`, ordered by when the next milestone opens (open-now first); `mine` = every event the devotee takes part in (joined, or - with nothing to join - has reported progress), newest registration first; `completed.titles` = up to 20, newest first. A card carries `progress` for every event the devotee takes part in, in every section.
* **Detail.** `me.registered` is `false` for an event with nothing to join (progress works without a registration); the registration block of the detail carries the real `registered` / `spotsLeft`; `me.currentMilestoneKey` is the first open, not-yet-done milestone.

## 11. Location milestones — a Yatra on the map (contract; built on the `location` kind of §4)

A milestone can be "be at this place". A Yatra is a journey from a start point to an end point along a chosen path, and its milestones are the stops along it; the devotee's own location (foreground only) completes them.

**Principles.** (1) The server decides: the app reports a fix, the server checks it (§11.2); the app never says "I'm there". (2) Privacy: location is read only while a Yatra screen is open (no background tracking, no trail); the server keeps ONE last point per (event, devotee) for the plausibility check, deleted when the event ends + 7 days, never shown to operators or exported. (3) Honest limits: GPS can be spoofed — this kind is for coins/badges of low value (operators are told so in the form); a mocked-location flag from the phone is refused, the server's speed check refuses teleporting. (4) No new permission class: `expo-location` foreground is already in the build, no rebuild.

### 11.1 Task config and the route
`location` task config (replaces the §4 row): `{ lat*, lng*, radiusM (50..2000, default 150), name* (≤ 80), nameHi, note? (≤ 160, shown on the pin, e.g. "Darshan at the main gate") }`. Validation: lat −90..90, lng −180..180, radius bounds, name required (`400 bad_event {fields}` naming `milestones[i].tasks[j].config.<field>`).
**A Yatra is a journey from one point to another along a chosen path, and its milestones are stops along that path.** So the route is an event-level block, `route`, and the location milestones are places on it:
`blocks: [..., "route"]` → `route: { start:{name,nameHi,lat,lng}, end:{name,nameHi,lat,lng}, path:[[lat,lng], ...] (2..500 points, the first/last are start/end, drawn by the operator point by point; straight segments between points), mapReveal:"all"|"unlocked" (default "all") }`. Server-computed on save and never edited by hand: `route.lengthKm`; for every `location` task `config.routeKm` = distance along the path (km from the start) of the nearest path point, and `config.offRouteM` = that nearest distance. A stop more than 1000 m from the path is **saved with a warning** in the response (`warnings:[{path,code:'off_route',distanceM}]`), not an error (an operator may want a detour). The milestones keep their own order (`milestones.order`); the dashboard sorts location milestones by `routeKm` when the operator clicks "Order stops along the path" (it never reorders silently). A route without any location milestone is valid (just a drawn path). Validation `400 bad_event {fields}`: path 2..500 finite points, start/end names ≤ 80, coordinates in range.
The event detail gains `route`: `{ start, end, path, lengthKm, stops:[{ milestoneKey, taskKey, order (1-based along the path by routeKm), title, titleHi, name, nameHi, note, lat, lng, radiusM, routeKm, done, completedAt|null, locked, state:'done'|'next'|'open'|'locked' }], progress:{doneKm, totalKm, stopsDone, stopsTotal} }` (`null` when the event has no route block). Locked stops are included unless `mapReveal:"unlocked"`. `next` = the first open, not-done stop by `order`. `doneKm` = routeKm of the furthest completed stop. The route is computed from the milestones' own tasks; there is no second place to edit a stop.

### 11.2 Reporting and the check (server)
`POST /api/events/:slug/milestones/:mKey/tasks/:tKey/progress` with `{ lat, lng, accuracyM, mocked?: bool, at?: iso }` (existing route; same preconditions: published, registered, milestone open).
Rules, in this order: `mocked:true` → `422 {code:'mock_location'}`; missing/NaN → `400 bad_report`; `accuracyM` absent or > 100 → `422 {code:'weak_fix', accuracyM, maxM:100}`; implausible move (the previous stored point of this devotee in this event implies > 250 km/h over a gap ≥ 5 s, or `at` older than 2 min / in the future by > 1 min) → `409 {code:'implausible_move'}`; distance > radius → `422 {code:'too_far', distanceM, radiusM}` (rounded to 10 m; the response never reveals the target's coordinates — they are public in the detail anyway); else done (`how`: "Reached <name>" / "<name> पहुँचे") and the usual completion/awards/`completion` sheet. The last point is stored on every report that passes the first three checks. Rate: ≤ 1 report / 5 s per devotee (`429 too_fast` returns current state as today). Haversine, metres. Already-done → `200` current state.
Stats: `perMilestone[].completedPct` as today. Operators see counts only, never locations of people.

### 11.3 Dashboard
* Milestone task form for `location`: a **map picker** (MapLibre GL JS + OpenFreeMap style, no key; never `tile.openstreetmap.org`): click/drag the pin to set lat/lng, a **radius** slider with the circle drawn, name/nameHi/note fields, and a "paste coordinates" box (accepts `19.0760, 72.8777` as copied from any maps app). A warning line: "Location can be faked; use it for small rewards."
* **Route editor** (a "Route" section of the event editor, enabled by the `route` block): a map where the operator sets the **start** and **end** (named pins) and **draws the path** by clicking points (add, drag, delete a point, undo, "reverse"; first/last point snap to start/end), shows the length in km; stops are placed from the milestone form by clicking ON the path (the pin snaps to the nearest path point, shows `routeKm`), or by pasting coordinates (off-path stops show the `off_route` warning). A list of stops in path order with km marks, the **Order stops along the path** action, completion counts per stop from `/stats`, and a polyline/pins preview exactly as the phone draws it. Saving shows the server's warnings.
* The event editor never shows or stores any devotee location.

### 11.4 App
* **Route map** block on the event detail (when `route` is present): MapLibre map (the shared lazy-guarded component, §TEMPLE_MAP; falls back to an ordered list of stops with km marks when the native module is absent) that frames the whole path; start and end markers, the path as a line (the part up to `doneKm` solid gold, the rest dashed), numbered stops by state (done ✓ / next highlighted + radius circle / open / locked greyed), a progress line ("12.4 of 31 km · 3 of 7 stops"), the devotee's blue dot, a bottom card for the NEXT pin: name, note, distance ("420 m away"), **Check in** button (enabled only when the on-device distance ≤ radius + accuracy slack, but the server decides), **Directions** (platform maps app), and an **"Auto check-in while this screen is open"** switch (default on) using a foreground watcher (`watchPositionAsync`, balanced accuracy, ≥ 10 m / 5 s) that reports once when inside the radius with a good fix, then stops for that pin.
* Permission: a themed rationale sheet before the system prompt ("We use your location only while this screen is open, to mark places you reach."); denied → the card says so with an **Open settings** link; the route and manual list still show (no check-in). Never change device-wide settings. Mock-location: pass `mocked` from the location object (Android).
* The milestone's task row for `location` shows its place and a "Check in" button that opens the same flow. Errors map to plain messages: `too_far` ("You're 420 m away — get within 150 m"), `weak_fix` ("GPS signal is weak — step outside or wait a moment"), `mock_location`, `implausible_move`, `locked`/`closed` as today. Success → the existing completion sheet.
* i18n en+hi, pure logic with node tests in `lib/` (haversine, state of each pin, distance label, error mapping, auto-check-in decision). `minAppVersion` of the `location` kind = the first build with this code (the engine refuses nothing by version; the app that doesn't know the kind already shows "Update the app").

### 11.5 Backend as built (`services/events`)

Code: `lib/geo.js` (haversine, `nearestOnPath`, `pathLengthKm`; `geo.test.mjs`), `events/route.js` (route validation, computed figures, the detail's `route`), `tasks/location.js` (config, `evaluate`), `engine/location-store.js` + `models/location-point.js` (the last point and the 5 s slot), tests in `location.test.mjs`. No new route and no new environment variable (the admin-bff area table already maps `/admin/events...`).

* **`route` block** is the 7th name in `BLOCK_NAMES` (after `content`). Stored: `{start,end,path,mapReveal,lengthKm}`; `lengthKm` (3 decimals) is computed, a hand-sent one is ignored. The first/last `path` points are **snapped to start/end** (not rejected). Start/end `name` is optional (<= 80). Validation fields: `route`, `route.path`, `route.path.<i>`, `route.start|end.name|nameHi|lat|lng`, `route.mapReveal`.
* **Location task config** stored `{lat,lng,radiusM,name,nameHi,note}` plus, when the event has a valid route block, `routeKm` (3 decimals) and `offRouteM` (whole metres), recomputed on EVERY save (stale ones are removed when the block goes). `radiusM` is optional (default 150); `name` is required. An empty task `title` defaults to the kind summary ("Reached <name>").
* **Warnings.** `POST /admin/events` (201) and `PUT /admin/events/:id` answer the usual admin document plus `warnings: [{ path: "milestones.items.<i>.tasks.<j>.config", code: "off_route", distanceM }]` (`[]` when none; a GET has no `warnings`).
* **Detail** always has a `route` key: `null` without the block, else `{ start, end, path, lengthKm, mapReveal, stops:[...], progress:{doneKm,totalKm,stopsDone,stopsTotal} }` exactly as 11.1. `order` is numbered over ALL stops (so a stop keeps its number); with `mapReveal:"unlocked"` locked stops are left out of `stops` but `progress.stopsTotal` still counts them. `locked` = the milestone is not open for the caller (opens later, waits for the one before it, window missed, or the event has not started) and the stop is not done. Guests get the same route with nothing done. The raw stored block is never in the detail.
* **Report.** Same progress route. Order: slot (5 s per devotee per event, atomic; 429 `too_fast` + `task`) -> `mock_location` 422 -> `bad_report` 400 (lat/lng not finite numbers in range, `accuracyM` present but not a finite number >= 0, `at` unparsable) -> `weak_fix` 422 `{accuracyM|null,maxM:100}` -> `implausible_move` 409 -> `too_far` 422 `{distanceM,radiusM}` -> done. The slot is taken only while the task is not yet done, so a finished task is always `200` current state. The previous-point speed uses the SERVER time of the previous report (never the client's `at`); the gap must be >= 5 s and the speed > 250 km/h. `at` older than 2 min or more than 1 min ahead is `implausible_move`. Error bodies are `{ error, code, ...extra }`; a refusal writes no TaskProgress row.
* **Last point.** Collection `locationpoints`, one row per (event, devotee) (`lat,lng,pointAt,reportedAt,expiresAt`), overwritten, TTL index on `expiresAt` (0 s) = event end + 7 days (an event with no end: report time + 7 days, refreshed on each report). Stored for every report that passes mock/bad/weak. No API reads it.
