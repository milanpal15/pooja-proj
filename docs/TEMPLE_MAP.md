# Temples map — a real, free map (MapLibre + OpenFreeMap + OpenStreetMap) — contract

The "View on map" screen shows a REAL map and REAL nearby temples without any paid service, account or API key.

* **Map:** `@maplibre/maplibre-react-native` (native, open source) drawing the vector style from **OpenFreeMap**
  (`https://tiles.openfreemap.org/styles/liberty`: free, no key, no limits, attribution drawn automatically by MapLibre; "as is",
  no SLA). The style URL is configuration (`EXPO_PUBLIC_MAP_STYLE_URL`), never hard-coded in screens, so a provider can be swapped
  without a release logic change. **Never use `tile.openstreetmap.org`** (OSM forbids heavy app use).
* **Temples:** (1) the dashboard's own temples — highlighted pins with Book Pooja / Offer / Navigate (existing `useContent().templeList`,
  they carry `lat/lng` where the operator set them); (2) **real nearby Hindu temples from OpenStreetMap** (`amenity=place_of_worship` +
  `religion=hindu`), fetched from our backend, shown as smaller pins with name, address (when OSM has one) and **Directions**
  (opens the phone's maps app). No ratings, hours or photos are shown or invented: OSM does not have them reliably.
* **Why a backend proxy:** the public Overpass servers are shared and rate-limit (fair use ≈ 10 000 requests/day, 429 on abuse). The
  catalog service queries them politely, snaps requests to a grid, **caches in MongoDB for 7 days** (OSM data is ODbL: caching and
  redistribution are allowed with attribution), tries several instances, and serves stale data when all are down. The phone never
  calls Overpass directly.
* **Attribution:** "© OpenStreetMap contributors" is shown on the map (MapLibre draws the style's attribution) and is returned in the API.
* **Provider-neutral:** the app talks to `GET /api/places/temples`, not to Overpass, so Google Places (or anything else) can replace the
  source server-side later without an app change.

## API (public, no auth; served by catalog, exposed on the MOBILE BFF as `/api/places/temples`)

`GET /api/places/temples?lat=<-90..90>&lng=<-180..180>&radius=<metres>` — radius default 8000, clamped to 500..25000.

```jsonc
{ "temples": [ { "id": "osm:node/123456", "name": "Shri Ram Mandir", "nameHi": "श्री राम मंदिर"|null,
                 "lat": 19.0, "lng": 72.8, "address": "Prabhadevi, Mumbai"|null, "deity": "Rama"|null,
                 "distanceM": 1234 } ],           // named places only, nearest first, ≤ 80, distance from the REQUESTED point
  "center": { "lat": 19.0, "lng": 72.8, "radius": 8000 },
  "attribution": "© OpenStreetMap contributors",
  "source": "openstreetmap", "cachedAt": "<iso>"|null, "stale": false }
```
* Dashboard temples are excluded from the list when an OSM place lies within 150 m of one of them (so a managed temple is never drawn twice):
  the catalog knows its temples and does this server-side.
* **Snapping/caching:** the centre snaps to a 0.05° grid and the radius to the next of {2000, 5000, 10000, 20000, 25000}; one cache row per
  (snapped lat, snapped lng, radius bucket) holding the raw normalised list, TTL 7 days; the response re-filters/sorts by distance from the
  requested point. A fresh cache row never triggers an upstream call.
* **Upstream:** Overpass QL for `node|way|relation` with `amenity=place_of_worship` + `religion=hindu` inside `around:<radius>,<lat>,<lng>`,
  `out center tags` (ways/relations use their centre), timeout ≤ 20 s. Instances come from config `OVERPASS_URLS` (comma list; defaults
  `https://overpass.openstreetmap.fr/api/interpreter`, `https://overpass-api.de/api/interpreter`, `https://overpass.kumi.systems/api/interpreter`, `https://overpass.private.coffee/api/interpreter`; the public servers go down for days at a time, so several are listed and a failing one is skipped for 60 s), tried in order with a 60 s circuit breaker per
  instance on 429/5xx/timeouts; a descriptive `User-Agent` (`BhaktiApp/1.0 (temples map)`) on every call; never more than one in-flight
  upstream request per cache key (coalesce) and at most 2 upstream calls/second overall.
* **Errors:** `400 {code:"bad_params"}`; `429 {code:"too_fast"}` (per client: ≤ 30 requests/minute); `503 {code:"places_unavailable"}` only when
  every instance failed AND there is no cached row at all (an expired row is served with `stale:true` instead).
* **Honesty:** an empty list is `[]` (the screen says "No temples found nearby"); fields OSM lacks are `null`.

## App screen

`/temples-map` keeps its route and entry point (Temples tab → "View on Map"). New behaviour: a real map centred on the user (when location permission is
granted and a fix is available) else on the dashboard temples / India; dashboard temples as highlighted pins (selected pin opens the existing bottom
sheet with Perform pooja / Book / Offer / Navigate); nearby OSM temples as smaller pins that open a compact sheet (name, address, distance, **Directions**
via the platform maps app); a "Search this area" button that appears after the camera moves and fetches the visible centre (debounced; never auto-spams);
re-centre-on-me button; loading / empty / offline states (an API failure keeps the pins already shown and says "Couldn't load nearby temples"); the
map still works with only the dashboard temples when the places API is unreachable. If the native map module is not in the installed build (an older
dev client or Expo Go) the screen falls back to today's illustrated map with a note — it must never crash.

## Implementation notes

Code: `backend/services/catalog/src/modules/places/` (`places.geo.js` validation/snapping, `places.overpass.js` query + normaliser,
`places.upstream.js` instances/breaker/2-per-second spacing, `places.service.js` cache/single-flight/dedupe/limit, `places.routes.js`,
`places.model.js`, `places.test.mjs`); BFF: `packages/common/src/catalog-mount.js` (`CATALOG_MOBILE_PLACES` in `catalog-routes.js`),
`bff/mobile/src/places.test.mjs`. Env (all in `services/catalog/.env.example`): `OVERPASS_URLS`, `PLACES_CACHE_DAYS` (7), `PLACES_STALE_DAYS` (30),
`PLACES_USER_AGENT`, `PLACES_TIMEOUT_MS` (20000), `PLACES_TOTAL_MS` (25000), `PLACES_BREAKER_MS` (60000), `PLACES_UPSTREAM_PER_SEC` (2), `PLACES_RATE_PER_MIN` (30).

* **Snap margin.** A cache row is a circle around the SNAPPED centre, which can be ~3.9 km from the requested point, so a query of exactly the
  bucket radius would miss temples near the edge of a small request. The upstream query radius is therefore `bucket + 4000 m`; the response is
  still filtered to the requested radius from the requested point. A row stores the 1500 nearest named places to its centre.
* **TTL.** The Mongo TTL index is on `purgeAt` (= expiry + `PLACES_STALE_DAYS`), not on the 7-day expiry, otherwise Mongo would delete exactly the
  row stale-while-error needs. Freshness is `expiresAt` (7 days).
* **`cachedAt`** is `null` on the response that triggered the upstream fetch, the row's fetch time on a cache hit or a stale answer.
* **`deity`** comes from `deity`, `deity:en`, any other `deity:*` (not wikidata/wikipedia), then `denomination` (e.g. "Shaivism"). The `religion`
  tag is always `hindu` here, so it is never shown as a deity.
* **`nameHi`** is `name:hi`, or `name` itself when it is written in Devanagari; `name` falls back `name` -> `name:hi` -> `name:en`.
* **Rate limit** key: the phone's address (BFF-signed `ctx.ip`; real client behind Render via `trust proxy`), else the calling service. Only valid
  requests count (a 400 does not). In memory, per instance, like the other limiters in this stack.
* **503 `places_unavailable`** only when every instance failed (or is in its breaker) AND no row exists, however old. A 200 whose body carries an
  Overpass `remark` such as "runtime error" is treated as a failure and never cached.
* The mobile BFF is the only public exposure; the admin BFF does not register the route. Without `CATALOG_URL` the route does not exist.
