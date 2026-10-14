# Live Darshan — API contract (list, player, dashboard)

Authoritative contract for the Live Darshan feature. The API, the dashboard and the app are built against THIS
file; if the API must differ, change this file in the same commit.

**Design source of truth** (do not guess — read the boards): the approved Claude Design canvas
`https://claude.ai/artifact/7d898088-20f3-4870-882c-2d7fe20386ed` — boards `LiveList.dc.html` (app list),
`LivePlayer.dc.html` (app player), `DashLive.dc.html` (dashboard). Saved copies on disk for this session:
`/private/tmp/claude-501/-Users-nitinmalhotra-projects-pooja-proj/d11696ff-60d1-4fbb-8cb2-5ddd0ef674e6/scratchpad/artifact-files/7d898088-20f3-4870-882c-2d7fe20386ed/project/{LiveList,LivePlayer,DashLive}.dc.html`
and renders `…/scratchpad/cmp/n-livelist.png`, `n-liveplayer.png`, `n-dashlive.png`.

Honesty rules (project convention): a value the system cannot know is **absent**, never invented. `[N] watching`
(viewers) and `[N] devotees said Jai` are shown only when the number is real. "Live" means the source was verified
broadcasting, or — when it cannot be verified — it is the operator's switch (flagged `verified:false`).

## Model

**LiveStream** (`pooja-api/src/modules/live/`): `slug*` (unique, derived from temple), `templeSlug*`,
`categorySlug`, `sourceType*` (`youtube` | `hls`), `url*` (normalised https; YouTube → canonical watch URL via
`lib/stream-url.js`; hls must be an https `.m3u8`/`.mp4`), `cover` (uploaded image, shown when not live),
`jaiText`, `jaiTextHi` (button label, e.g. "Jai Bholenath"; default "Jai"), `aartis[]`
(`{ name, nameHi, time:"HH:MM" (IST 24h), days:"daily" | [0..6] (0=Sun) }`), `chadhavaListingSlug`, `poojaSlug`,
`enabled`, `order`; cached probe: `broadcasting: true|false|null`, `viewers: number|null`, `checkedAt`, `startedAt`,
`probeNote`. **LiveCategory**: `slug*`, `name*`, `nameHi`, `order`, `enabled` (seed: Jyotirlinga, Shakti Peeth,
Ganga Aarti).

**Probe** (`live/probe.js`, background job every 60 s over enabled streams + on demand for "Test link"):
- `hls`: GET the manifest (timeout 8 s) — `broadcasting` true if HTTP 200 and body starts `#EXTM3U` (mp4: 200 + video type); false on error/non-200; never null.
- `youtube`: if `YOUTUBE_API_KEY` is set → Data API `videos?part=liveStreamingDetails,snippet&id=<id>`: `liveBroadcastContent==='live'` → `broadcasting:true`, `viewers = concurrentViewers`, `startedAt = actualStartTime`; `'upcoming'|'none'` → false. Without a key: `broadcasting:null` (unknown), `viewers:null`, `probeNote:"YOUTUBE_API_KEY not set — live status is not verified"`. NEVER scrape the watch page.
Add `YOUTUBE_API_KEY` to `.env.example` + `render.yaml` (`sync:false`).
Implementation notes (API, built): YouTube streams are probed in ONE batched Data API call per run (up to 50 ids); an API failure is `broadcasting:null` (unknown), not false. The HLS probe refuses non-https and internal addresses (localhost, RFC1918, link-local, `.internal`) and follows at most 3 redirects, re-checking each hop; "Test link" runs the same code. Saving a stream (POST/PUT) re-probes immediately; changing `url`/`sourceType` resets the cached probe to unknown first.

**Derived state** (`state`): `live` = enabled && (broadcasting===true || (broadcasting===null)); `upcoming` = enabled && broadcasting===false && an aarti starts later today (IST); `offline` = enabled && broadcasting===false otherwise; `hidden` = !enabled. `verified = broadcasting !== null`.

## Public (no auth; mounted before the gate like `/poojas`)

`GET /api/live` →
```jsonc
{ "categories": [{ "slug": "", "name": "", "nameHi": "" }],
  "streams": [LiveCard],                      // enabled only, order: live first, then upcoming, then offline; each group by `order`
  "schedule": [{ "streamSlug": "", "templeName": "", "name": "", "nameHi": "", "time": "12:00", "isNext": false }] // today's remaining aartis across enabled streams, by time, max 12
}
```
**LiveCard**: `{ slug, templeSlug, templeName, templeNameHi?, place, categorySlug, state:"live"|"upcoming"|"offline", verified, currentAarti: {name,nameHi}|null (the aarti whose window — start to +90 min — contains now), startedAt: iso|null, viewers: number|null, nextAarti: {name,nameHi,time}|null, cover, sourceType }`. The stream `url` is **not** in cards.
`GET /api/live/:slug` → `{ stream: LiveDetail }` (404 `not_found` if disabled/missing). **LiveDetail** = LiveCard +
`{ url (present only when state==="live"), jaiText, jaiTextHi, jaiCount: number|null (taps in the current aarti window; null when no current aarti or zero), aartisToday: [{name,nameHi,time,status:"live"|"done"|"upcoming"}], temple: {slug,name,about,place,lat?,lng?}, chadhava: {slug,title,fromCoins}|null, pooja: {slug,title,fromCoins}|null, more: [LiveCard] (other live streams, max 6) }`.
`POST /api/live/:slug/jai` (Firebase auth) → `{ jaiCount }`; one tap per user per stream per 60 s (extra taps answer `429 {code:"too_fast"}` — not an error for the app), only while `state==="live"` and there is a `currentAarti` window (else `409 {code:"no_aarti"}`). Counts are stored per (stream, aarti window date+index) so they reset each aarti. The 429 body is `{error, code:"too_fast", jaiCount}` (current window count, so the app can stay in sync). The throttle is atomic (unique `(uid, stream)` row) so two simultaneous taps land once. `schedule` lists aartis starting at or after now (IST) on enabled streams; `nextAarti` is the first aarti starting strictly after now. `PUT /api/admin/live-categories/order` `{ids}` also exists. Admin list/PUT-order responses return rows with computed `state`/`verified`/`nextAarti`.

## Admin (area `content`; editor writes, viewer reads) — add every route to `access/routes.js`
`/api/admin/live-streams` CRUD (generic `crud` + `prepare`/`view`): rows include the cached probe fields + computed `state`/`verified`/`nextAarti`; validation: temple exists, unique temple per stream, `url` per source type (use `lib/stream-url.js`, refuse junk with `400 bad_stream_url`), aarti `time` HH:MM, ≤ 12 aartis, names ≤ 60, `days` valid; slug auto-derived (`<templeSlug>`).
`/api/admin/live-categories` CRUD. `PUT /api/admin/live-streams/order` `{ids}`.
`POST /api/admin/live-streams/check` `{ sourceType, url }` → `{ ok, broadcasting: true|false|null, viewers, message }` (the "Test link" button; rate-limit 10/min per operator).
Dashboard shows the cached `checkedAt` as "checked N min ago".

## Migration
At seed, for each Temple with a non-blank `liveUrl` and no LiveStream for that temple → create an enabled stream (`youtube` when the normalised URL is a YouTube watch URL, else `hls`). Seed the 3 categories once (only into an empty collection, so a category an operator deleted stays deleted). Note the stream migration follows the rule literally: a stream an operator deletes is re-created on the next boot while its temple still has a `liveUrl`; blank the temple's `liveUrl` (or disable the stream instead of deleting it) to stop that. The Temple model keeps `liveUrl` (legacy, read-only after migration); the dashboard Temples form no longer shows it, and `GET /api/content` stops serving `liveUrl` (the app reads `/api/live`).

## App
Routes: `/darshan` = **LiveList** screen, `/darshan/[slug]` = **LivePlayer** screen. Home's Live Darshan tile → `/darshan`, with its LIVE badge only when `/api/live` has a `state:"live"` card. "Remind me": local daily notifications 10 minutes before an aarti (no server), kept per (stream, aarti) in AsyncStorage; also the "Remind me" action on the player. "Your saved temples": the devotee's saved temples (existing saved-temples feature) that have a stream, red ring when live. Player: YouTube streams use the existing `LivePlayer` WebView component (origin = API site; do NOT revert — YouTube answers error 152 for an embed hosted on youtube.com), hls/mp4 via expo-video. Offline/upcoming states show the cover (or toned gradient) + the next aarti time instead of a player.
