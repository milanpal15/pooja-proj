# Pooja Seva, Chadhava and the dashboard-driven Home — API contract

Authoritative contract for three features. The API, the dashboard and the app are
built against THIS file; if the API must differ, change this file in the same commit.
Designs: https://claude.ai/artifact/GW7FcGT2vuoSnuUwS2Y6jn (pooja/chadhava/dashboard) and
https://claude.ai/artifact/78MRF4WgP4bARN4tiUrSH4 (Home). All money is **coins** (1 coin = ₹1
before pack offers). Errors are `{ error, code, ...extra }` (see COINS_AND_ASTROLOGERS.md).

Conventions: ids are strings; dates are ISO strings except `poojaDate` (`YYYY-MM-DD`);
every localisable text has an `xxxHi` twin; the app falls back to the English field when
the Hindi one is empty. Uploaded media is a host-relative `/uploads/<id>.<ext>`.

---

## 1. Home layout (dashboard-driven)

### 1.1 `GET /api/content` (public, existing) gains `home`

```jsonc
{
  "hero": [HeroSlide, ...],            // existing key, EXTENDED, already schedule-filtered
  "home": { "sections": [HomeSection, ...] }   // enabled + in-window only, sorted by order
}
```

**HeroSlide** (extends the existing model; old fields stay):
```jsonc
{ "slug": "mahalaya-2026", "kind": "banner" | "html",
  "title": "", "titleHi": "", "subtitle": "", "subtitleHi": "",
  "deitySlug": "", "href": "/pooja/mahalaya-pind-daan",      // in-app route, or https URL
  "image": "/uploads/x.jpg",                                   // kind=banner
  "html": "<div>…</div>", "htmlHi": "",                        // kind=html, ALREADY SANITISED
  "ctaLabel": "Book now", "ctaLabelHi": "", "ctaHref": "",
  "startsAt": null, "endsAt": null, "order": 0, "enabled": true }
```

**HomeSection**
```jsonc
{ "key": "pitru-paksha", "source": "custom",
  "title": "Pitru Paksha Special", "titleHi": "पितृ पक्ष विशेष",
  "tone": "gold" | "purple" | "crimson" | "forest" | "maroon",
  "layout": "photo3" | "book2" | "list" | "grid4",
  "items": [ HomeItem, ... ],
  "footerLabel": "See all dates", "footerLabelHi": "", "footerHref": "/festivals",
  "startsAt": null, "endsAt": null, "order": 40, "enabled": true }
```
`source` is one of: `hero`, `astrologer`, `grid` (the 8-up quick grid, uses `items`),
`festivals`, `knowledge` (uses `items[].deitySlug`), `temples`, `daily` (uses `items`),
`features` (the 4 feature cards, uses `items`), `darshan`, `custom`.
`hero`, `astrologer`, `festivals`, `temples`, `darshan` carry no items; the app renders
them from content it already loads. A section whose source uses `items` (`grid`, `daily`, `features`, `knowledge`, `custom`) with no items is omitted by the API. Public sections carry exactly the fields above (no `_id`).

**HomeItem**
```jsonc
{ "title": "", "titleHi": "", "subtitle": "", "subtitleHi": "",
  "icon": "temple",            // app icon name, for grid/daily/features
  "image": "/uploads/…",       // photo3/book2
  "href": "/darshan",          // in-app route
  "badge": "new" | "soon" | "special" | "",
  "flag": "liveDarshan",       // optional feature-flag key; hidden while the flag is off
  "deitySlug": "" }
```

### 1.2 Admin (area `content`; editor may write, viewer reads)
- `GET|POST /api/admin/home-sections`, `PUT|DELETE /api/admin/home-sections/:id` (full Mongo docs with `_id`, incl. disabled/out-of-window; `key` unique → `409 duplicate_key`; `source`/`tone`/`layout`/`badge` outside the lists → `400 bad_section`). A PUT is validated as the merged document.
- `PUT /api/admin/home-sections/order` body `{ ids: [id, …] }` → rewrites `order` (10, 20, 30…) and returns the full ordered list
- Hero slides keep using `/api/content/hero` (generic CRUD) but writes go through a **sanitiser**: `html`/`htmlHi` are cleaned on save (see 1.3). `kind=html` requires non-empty `html`; `kind=banner` requires `image` — or a `deitySlug` (the original deity-art slides have no upload). Failures are `400 { error, code }` with code `html_required` | `image_required` | `bad_kind` | `html_too_large` | `bad_date`. `startsAt`/`endsAt` are ISO dates or null.

### 1.3 HTML sanitiser (server, on save; never trust stored input either — also clean on read)
Allowed tags: `div span p br h1 h2 h3 h4 b strong i em u a img ul ol li small`.
Allowed attrs: `class`, `style` (only: `color, background-color, font-size, font-weight, text-align, padding, margin, border-radius, line-height, letter-spacing, border, display, width, height, max-width`; no `url()`, `expression`, `position`), `href` on `a`, `src`/`alt`/`width`/`height` on `img`.
`href`: `bhakti://<route>` (in-app), `https://…`, or `/<route>`; everything else removed. `img src`: `/uploads/…` or `https://…` only.
Scripts, iframes, forms, event handlers, `<style>`/`<link>` and `data:`/`javascript:` URLs are stripped. Output is stored; max 20 KB of input per field (`400 html_too_large`).

### 1.4 Seed
A fresh DB seeds a default layout equal to today's Home, in this order (order 10,20,…):
`hero`, `astrologer`, `grid` (8 tiles), `festivals`, `daily` (4 rows), `temples`, `features` (4 cards), `custom books` (Aarti, Chalisa, Katha, Paath; tone gold, layout book2, title "Pooja & Paath Books"), `knowledge` (vishnu, shiva, ganesh), `darshan`. Seeded only into an EMPTY collection (a section an operator deletes stays deleted). Keys: `hero, astrologer, quick-grid, festivals, daily, temples, features, books, knowledge, darshan`.

---

## 1b. Home slider (approved design "Home · upgraded" — supersedes the section-driven Home)

The approved Home (design canvas https://claude.ai/artifact/GW7FcGT2vuoSnuUwS2Y6jn → boards `HomeNew`, `DashHomeSlider`) is a **fixed layout** whose only dashboard-managed block is the **slider under the search bar**. The slider lives in the `HeroSlide` collection (`/api/content/hero`, already CRUD) and is served in `GET /api/content` as `hero`. The `HomeSection` model/endpoints and the "Home layout" dashboard tab are no longer used by Home (keep the code unless it is dead weight; do not break it).

**HeroSlide** (extended; image-based — `kind` html/banner stays valid but the dashboard only creates `banner`):
```jsonc
{ "slug": "", "kind": "banner",
  "tag": "9 nights", "tagHi": "",                 // small pill, optional
  "title": "Navratri Maha Durga Pooja", "titleHi": "",
  "subtitle": "At Kashi Vishwanath, in your name", "subtitleHi": "",
  "ctaLabel": "Book now", "ctaLabelHi": "",       // button text; empty = no button
  "image": "/uploads/…",                          // 1080×520 recommended; empty = toned gradient
  "target": { "type": "pooja"|"chadhava"|"temple"|"bhajan"|"astrologer"|"coins"|"link"|"none",
              "ref": "<pooja slug | listing slug | temple slug | https url>" },
  "language": "all"|"hi"|"en",                    // audience; the app shows slides for its language or "all"
  "startsAt": null, "endsAt": null, "order": 0, "enabled": true }
```
Server resolves `target` into the existing `href` on every public/admin read (`pooja`→`/pooja/<ref>`, `chadhava`→`/chadhava/<ref>`, `temple`→`/poojas?temple=<ref>`, `bhajan`→`/bhajan`, `astrologer`→`/astrologers`, `coins`→`/wallet`, `link`→the https URL (https only; anything else dropped), `none`→empty). `PUT /api/content/hero/order` body `{ ids:[…] }` rewrites `order` (10,20,…; area `content`). The public list is enabled + inside window, ordered, capped at **8**; validation: title required (≤80), tag ≤24, subtitle ≤120, ctaLabel ≤24, `target.type` in the list above, `ref` required for pooja/chadhava/temple/link.

## 2. Poojas and packages

### 2.1 Public (no auth; added to the `PUBLIC` allowlist)
`GET /api/poojas?temple=<slug>&festival=<slug>&tithi=<text>&place=<text>&q=<text>` →
```jsonc
{ "poojas": [ PoojaCard, ... ],
  "filters": { "temples": [{slug,name}], "festivals": [{slug,name,nameHi}], "tithis": ["Pratipada"], "places": ["Varanasi"] } }
```
Only poojas that are `enabled`, published (`publishAt` null/past), have ≥1 enabled package, whose `bookingClosesAt` is not past (or null) and whose `poojaDate` is not before today (IST). Sorted by `poojaDate` asc (every-day poojas, `poojaDate: null`, last) then `order`. `filters` lists every option among the listed poojas (it does not shrink as a filter is applied); `tithi`/`place`/`q` are case-insensitive contains.

**PoojaCard**: `{ slug, title, titleHi, tagline, taglineHi, banner, templeSlug, templeName, place, poojaDate, tithi, festivalSlug, festivalName, fromCoins, toCoins, packageCount, status: "open"|"closing" }` (`closing` = closes within 48 h). `GET /api/poojas/:slug` additionally serves a published pooja whose window has closed, with `status: "closed"`, so a shared link explains itself.

`GET /api/poojas/:slug` → `{ pooja: PoojaDetail }` (404 `not_found` if disabled, unpublished or missing). Temple `about`/`aboutHi` are new optional fields on the Temple document.
**PoojaDetail** = PoojaCard +
```jsonc
{ "gallery": ["/uploads/…"], "about": "", "aboutHi": "",
  "benefits": [{ "title": "", "titleHi": "", "text": "", "textHi": "" }],
  "included": [{ "text": "", "textHi": "" }],
  "process":  [{ "title": "", "titleHi": "", "text": "", "textHi": "" }],
  "faqs":     [{ "q": "", "qHi": "", "a": "", "aHi": "" }],
  "temple": { "slug": "", "name": "", "about": "", "aboutHi": "", "image": "" },
  "bookingClosesAt": "2026-10-10T12:30:00.000Z", "cancelHours": 24,
  "prasadAvailable": true, "prasadFeeCoins": 99,
  "packages": [{ "key": "individual", "name": "", "nameHi": "", "persons": 1, "coins": 551,
                 "perks": ["…"], "perksHi": ["…"], "image": "" }],      // enabled only, by order
  "rating": { "avg": 4.7, "count": 12 } | null }                        // null until >= 1 visible review
```
`GET /api/poojas/:slug/reviews?limit=20&before=<iso>` → `{ reviews: [{ id, name, rating, text, createdAt, packageName }] }` (visible only; `name` = first name only, never contact details).

### 2.2 Admin (area `content`)
`GET|POST /api/admin/poojas`, `GET|PUT|DELETE /api/admin/poojas/:id`. Full document (see 2.3) plus `id`, `status`, `bookingCount` (non-cancelled bookings) on every response; a PUT is validated as the merged document. Errors: `400 bad_pooja`, `409 duplicate_slug`, `404 not_found`. Validation: unique `slug`; every package has `key` (unique within pooja), `persons` ∈ {1…12} integer, `coins` integer ≥ 1; `poojaDate` is `YYYY-MM-DD` or null. List rows carry computed `status`: `draft` (no enabled package or disabled) | `scheduled` (`publishAt` future) | `live` | `closing` | `ended` (date past), plus `bookingCount`.
`POST /api/admin/poojas/import-sevas` → idempotent migration of `Seva` rows to poojas (one package per seva, `persons:1`, `coins: seva.price`, temple from `templeSlug`, date null → `poojaDate` null = "Every day"); returns `{ created, skipped }`. Also runs once at seed when no Pooja exists and Sevas do.

### 2.3 `Pooja` document
`slug*, title*, titleHi, tagline, taglineHi, banner, templeSlug, place, festivalSlug, tithi, deitySlug, poojaDate|null, bookingClosesAt|null, cancelHours (default 24), publishAt|null, gallery[], about, aboutHi, templeAbout, templeAboutHi, templeImage (optional overrides of the temple block), benefits[], included[], process[], faqs[], prasadAvailable, prasadFeeCoins, packages[{key,name,nameHi,persons,coins,perks[],perksHi[],image,order,enabled}], enabled, order`.

---

## 3. Booking (replaces the seva booking; old builds do not matter)

### 3.1 `POST /api/bookings` (auth) — body
```jsonc
{ "poojaSlug": "navratri-durga-pooja", "packageKey": "partner",
  "names": [{ "name": "Coco Demon", "gotra": "Kashyap" }, { "name": "…", "gotra": "" }],
  "prasad": true, "address": { "line1": "", "city": "", "pincode": "" },   // address required iff prasad
  "requestId": "<client uuid>" }
```
Server rules: pooja enabled and window open (`bookingClosesAt`), package enabled, `names.length === package.persons`, each name 2–60 chars, gotra ≤ 40; price = `package.coins` (+ `pooja.prasadFeeCoins` if `prasad`) **read from the database**; one idempotent wallet debit (`booking_debit`, key `booking:<uid>:<requestId>`), same retry semantics as today. 
Errors: `402 insufficient_coins` (+`shortfall`, `balance`, `needed`), `409 booking_closed` (window closed, pooja date past, or no longer bookable), `400 invalid_names`, `400 invalid_address` (line1, city and a 6-digit pincode), `400 prasad_unavailable`, `400 bad_request_id`, `404 not_found` (pooja or package missing/disabled/unpublished). Idempotency key: `booking:<uid>:<requestId>`.
Response `201`: `{ booking: Booking, balance }`. A retried `requestId` returns the same booking with `200`.

**Booking** (`GET /api/bookings`, `GET /api/bookings/:id` → `{ bookings:[…] }` / `{ booking }`, own only)
```jsonc
{ "id": "", "bookingRef": "BKT-7Q4M2", "kind": "pooja",
  "poojaSlug": "", "poojaTitle": "", "poojaTitleHi": "", "templeName": "", "place": "",
  "poojaDate": "2026-10-11" | null, "packageKey": "", "packageName": "", "persons": 2,
  "names": [{ "name": "", "gotra": "" }], "prasad": true,
  "totalCoins": 950, "packageCoins": 851, "prasadCoins": 99,
  "status": "booked" | "sankalp" | "performed" | "cancelled",
  "statusHistory": [{ "status": "booked", "at": "…" }],
  "refunded": false, "canCancel": true, "cancelBy": "2026-10-10T…",
  "review": { "rating": 5, "text": "", "createdAt": "" } | null, "canReview": false,
  "createdAt": "" }
```
`cancelBy` = start of `poojaDate` (IST) minus `cancelHours` (for an every-day pooja: `bookingClosesAt` minus `cancelHours`; with neither, `null` = no cut-off), fixed when booked.
`POST /api/bookings/:id/cancel` → `{ booking, balance }` — allowed while `status==='booked'` and now < `cancelBy`; refunds the full `totalCoins` (idempotent; a repeat on a cancelled booking returns the same result); else `409 cannot_cancel`. Not your booking: `404 not_found`.
`POST /api/bookings/:id/review` `{ rating: 1..5, text?: ≤500 }` — only own booking with `status==='performed'`, once; else `409 not_reviewable`; a bad rating/text is `400 invalid_review`. Returns `201 { booking }`. The review goes public as the booker's FIRST name (from the profile, else the first typed name) and `GET /poojas/:slug` rating counts only non-hidden ones.

### 3.2 Admin (area `orders`; **view** for all, **edit** needs `orders:edit` — admin only)
`GET /api/admin/bookings?status=&q=&limit=` → `{ bookings:[AdminBooking] }`. AdminBooking = Booking + `uid, who, devoteeName, gotra, address` (`address` is `{line1,city,pincode}`). Without `devotees:view` the existing redaction applies: `who`/`devoteeName` become `Devotee ••4821`, every `names[]` entry is replaced by that pseudonym with an empty gotra, `address` is `null`, and `q` only matches `bookingRef`/`poojaTitle` (searching names would reveal them).
`PUT /api/admin/bookings/:id/status` `{ status: "sankalp"|"performed" }` → `{ booking }` — forward-only (booked→sankalp→performed, a step may be skipped, never undone; `409 invalid_transition`, `400 invalid_status`); writes `statusHistory`; sends the devotee a push if they have an Expo token (best effort, `lib/push.js`, never blocks the response).
`GET /api/admin/reviews?hidden=true|false` → `{ reviews:[{ id, bookingRef, poojaTitle, rating, text, hidden, createdAt, uid, who }] }`; `PUT /api/admin/reviews/:id` `{ hidden: bool }` → `{ review }` (orders:edit). Operators may **edit a review's text** (to fix typos or remove abusive wording): `PUT /api/admin/reviews/:id` accepts `{ hidden?: bool, text?: string ≤500 }` (either or both, `orders:edit`); the rating, the first name and the booking link can never be changed. An edited review carries `edited: true` (+ `editedAt`) in the admin row, and the change is audit-logged. The public payload shows the current text, with no "edited" marker.

---

## 4. Chadhava listings and orders (replaces free-amount chadhava)

### 4.1 Public
Public routes are mounted before the gate (like `/api/coins/packs`), so they are not in `middleware/access.js` `PUBLIC`.
`GET /api/chadhava/listings?category=<slug>` → `{ listings:[ListingCard], categories:[{slug,name,nameHi,image}] }`
**ListingCard** `{ slug, title, titleHi, banner, templeName, place, startsAt, endsAt, category, summary, summaryHi, fromCoins }` — enabled, with ≥1 enabled offering, and (no window or now inside it) only. `summary`/`summaryHi` are fields on the listing document.
`GET /api/chadhava/listings/:slug` → `{ listing: ListingDetail }` = card +
`{ gallery[], intro, introHi, howItWorks: [{text,textHi}], offerings: [{ key, title, titleHi, desc, descHi, coins, image, label, labelHi }] }` (enabled offerings only, by `order`). The detail also serves an enabled listing outside its window, with `open: false`, so a shared link explains itself.

### 4.2 `POST /api/chadhava/orders` (auth)
`{ listingSlug, items: [{ key, qty }], requestId }` (qty 1–20, ≤ 10 distinct) → total = Σ `coins × qty` from the DB; one idempotent debit (`chadhava_debit`); errors as bookings (`402 insufficient_coins`, `409 listing_closed`, `400 invalid_items` for a bad/unknown/disabled key or qty, `404 not_found`). Idempotency key `chadhava:<uid>:<requestId>`. Response `201`/`200` `{ order, balance }`; a duplicate key within `items` is merged.
`GET /api/chadhava/orders` → `{ orders:[{ id, ref ("CHD-…"), listingTitle, items:[{key,title,qty,coins}], totalCoins, status: "booked"|"offered"|"cancelled", createdAt }] }`. `POST /api/chadhava/orders/:id/cancel` → `{ order, balance }`, refunds while `booked` and before the listing's `endsAt` (snapshotted as `cancelBy`; null = no cut-off), else `409 cannot_cancel`. An order also carries `listingSlug, listingTitle, listingTitleHi, refunded, canCancel`.

### 4.3 Admin (area `content` for listings/categories, `orders` for orders)
`/api/admin/chadhava-listings` and `/api/admin/chadhava-categories` — generic CRUD (`slug, title, titleHi, templeSlug, place, category, startsAt, endsAt, banner, gallery[], intro, introHi, howItWorks[], offerings[{key,title,titleHi,desc,descHi,coins,image,label,labelHi,order,enabled}], enabled, order`).
Listing writes are validated (`400 bad_listing`: slug, offering `key` unique and `coins` ≥ 1, `endsAt` after `startsAt`; `409` on a duplicate slug). `GET /api/admin/chadhava-orders` → `{ orders }` (rows carry `uid, who, templeName, at`; `who` redacted like other order lists), `PUT /api/admin/chadhava-orders/:id/status` `{ status: "offered" }` → `{ order }` (orders:edit; only from `booked`, else `409 invalid_transition`; best-effort push).
The old flat `Offering` catalogue (`/api/chadhava/offerings`, `/api/admin/offerings`) is left in place for the existing dashboard page but is no longer used for pricing.
The old free-amount `POST /api/chadhava` is removed (410 Gone).

---

## 5. Dashboard (summary of screens the API must serve)
Tabs: **Home layout**, **Poojas**, **Chadhava** (Listings / Offerings / Categories), **Bookings** (Poojas, Chadhava, Reviews). Roles per DESIGN.md §21: content → editor writes, viewer reads; bookings/reviews view-only except status/hide which need `orders:edit`. Add each new route to `access/routes.js` (a test enumerates them).
