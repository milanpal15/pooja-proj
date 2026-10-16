# Bhakti — Design System, Architecture & Methodology

Three projects, one set of rules. Part A (§1–§11) is the **visual and
component system** shared by the app and the dashboard. Part B (§12–§18) is the
**architecture**: folder structure, component decomposition and layering for the
mobile app, the backend API and the dashboard. Part C (§19–§21) holds feature
specs: astrologer calls and coins, coins as the only in-app currency, and
dashboard access control.

One design language, two implementations:

| Surface | Stack | Kit lives in | Status |
|---|---|---|---|
| **Mobile app** (`poojaappclone/`, Expo/Metro) | React Native, TypeScript | `src/theme/` + `src/components/ui/` | Built. This doc codifies it. |
| **Admin dashboard** (`pooja-admin/`, Vite) | React, plain CSS | `src/client/ui/` + `src/client/styles/` | Built and adopted everywhere: `ui/` kit + `styles/tokens.css`; no legacy `.btn`/`.modal`/`.pill`/`.toggle` markup remains (§10). |

This file is the contract. If code and this file disagree, one of them is a
bug — fix it in the same PR. Read §1–§3 before touching any UI, §9 before
opening a PR.

### Document status

Every file path, folder tree and structural statement in this document was
checked against the repository on **2026-10-07**. The big restructuring that
Part B proposed has been carried out, so the trees in §13–§15 are the **current
layout**, not a target, and §18 is a record of that migration plus what remains.
Where this document and `docs/COINS_AND_ASTROLOGERS.md` (the API contract for
coins, bookings and calls) or the code disagree, **the code wins** and this
document should be fixed in the same change. Files named as "was …" or in a
history note refer to code that no longer exists.

---

## 1. Principles

1. **Tokens, never literals.** No hex, no pixel padding, no font size written
   in a screen. A screen names a *role* (`primary`, `Space.md`, `titleMd`);
   the kit resolves it. This is what makes dark mode, the sanctum surface and
   a future rebrand a one-file change.
2. **Compose, don't restyle.** A screen assembles kit components. If you need
   a variant the kit lacks, add the variant to the component (§6) — never
   `style={{…}}` over it, never a one-off `.horo-pill`.
3. **One way to do a thing.** One button, one modal, one toast, one status
   pill. A second implementation is a defect even if it looks identical,
   because the two will drift. (Repo precedent: the Horoscope tab once had two
   editors; see AGENTS.md §5.)
4. **Real data or nothing.** No invented ratings, counts, dates or copy. An
   unfilled thing shows an honest empty state (§7), never a placeholder that
   looks real.
5. **Calm, devotional, legible.** Warm surfaces, generous space, ornament that
   never costs legibility. Gold is decoration; it is never body text.
6. **Accessible by construction.** 44 px targets, 4.5:1 text, a label for
   every control, meaning never carried by colour alone. These are in the
   components so screens get them free (§8).
7. **Bilingual from day one.** Every user-facing string exists in English and
   Hindi, and Devanagari is a first-class typeface, not a fallback (§9).

---

## 2. Layers and dependency rule

```
tokens        colours, type, space, radius, elevation, motion      (data only)
  ↓
primitives    Button, Field, Switch, Badge, Icon, Type …           (no business logic)
  ↓
patterns      Modal, ConfirmDialog, Toast, DataTable, EmptyState,
              PageHeader, StatCard, DayStrip …                     (compose primitives)
  ↓
features      HoroscopePage, OperatorsPage, RashiCard, TempleCard …  (know the domain + API)
  ↓
screens       src/app/** route shims  ·  app/tabs.js registry       (route + data wiring)
```

**Imports only point down.** A primitive never imports a pattern; a pattern
never imports a feature or calls `api`/`authedFetch`. Features own data
fetching; patterns and primitives receive everything as props. This is what
keeps the kit reusable and testable in isolation.

---

## 3. Foundations (tokens)

The two platforms **share vocabulary and values**. Names below are the
canonical role names; the app exposes them as TypeScript (`useTheme().c.<role>`),
the dashboard as CSS custom properties (`var(--<role-kebab>)`, §10).

### 3.1 Palette — "Sacred Devotion"

Source of truth: `poojaappclone/src/theme/palette.ts`. Ramps are raw; **only
`tokens.ts` roles are used by screens**.

| Ramp | Job | Anchor |
|---|---|---|
| **Kumkum** | Identity, navigation, destructive-adjacent emphasis | `500 #AF101A` |
| **Saffron** | Action: CTAs, the "sunlight" gradient | `300 #FF9800` |
| **Gold** | Ornament only: hairlines, mandalas, ring strokes | `300 #C9A227` (2.3:1 on cream — **never text**); `goldInk 500 #7A5A12` (6.1:1) for gold-feeling text |
| **Sandal** | Warm neutral spine: surfaces (light), ink (dark) | `50 #FFF9EB` surface |
| **Ember** | Sanctum / dark surfaces | `600`–`950` |
| **Status** | error / success / live — **reserved, never decorative** | `#BA1A1A` · `#2E6B4F` · `#C62828` |

### 3.2 Semantic roles (the only names screens use)

| Role | Meaning | App (`c.*`) | Dashboard (`--*`) |
|---|---|---|---|
| surface / container ladder | Page → card → raised → highest | `surface`, `containerLowest…Highest` | `--surface`, `--container-lowest…` |
| on-surface | Text, secondary text, faint text | `onSurface`, `onSurfaceVariant`, `onSurfaceFaint` | `--on-surface`, `--on-surface-variant`, `--on-surface-faint` |
| outline | Borders, dividers | `outline`, `outlineVariant` | `--outline`, `--outline-variant` |
| **primary** | Brand red: selected, links, key emphasis | `primary`, `onPrimary`, `primaryContainer` | `--primary`, `--on-primary`, `--primary-container` |
| **accent** | Saffron action colour | `accent`, `onAccent`, `accentContainer` | `--accent`, `--on-accent`, `--accent-container` |
| gold | Ornament / `goldInk` text / hairline | `gold`, `goldInk`, `goldHairline` | `--gold`, `--gold-ink`, `--gold-hairline` |
| status | Error, success, live (+ container) | `error`, `success`, `live` … | `--error`, `--success`, `--live` … |
| overlay | Scrim behind modals, glass | `scrim`, `glass` | `--scrim`, `--glass` |

**Rule — colour never speaks alone.** Status is colour **+ a word or icon**
(`Published`, `Hidden`, `Not published`), and states that must be told apart
also differ in lightness, not hue only.

**Rule — pairing.** Always use a role with its `on*` partner (`primary` text
sits on `onPrimary`, never on an arbitrary fill). `src/theme/contrast.ts`
(`contrast`, `grade`) measures any pair, including translucent sanctum washes;
a new role pair is not merged until it grades **AA** (≥ 4.5:1; ≥ 3:1 only for
24 px+ or 18.66 px bold).

### 3.3 Typography

Three families, shared by both surfaces:

| Role | Family | Use |
|---|---|---|
| display | Be Vietnam Pro 600/700/800 | Headings, numerals |
| body | Plus Jakarta Sans 400–700 | Everything else |
| deva | Noto Sans Devanagari 400–700 | **Every** Hindi string, at matched weight |

Scale (`theme/typography.ts` in the app; the dashboard is meant to map it 1:1 to
utility classes `.t-display`, `.t-title-md` … — **not built yet**, the dashboard
sets sizes in its plain CSS today):

`display 34/42` · `headlineLg 26/32` · `headlineMd 24/30` · `titleLg 20/26` ·
`titleMd 17/24` · `titleSm 15/20` · `bodyLg 18/28` · `bodyMd 16/24` ·
`bodySm 14/20` · `labelLg 16/22` · `labelMd 13/18` · `labelSm` · `mantra
18/30` · `numeral 40/46`.

Rules: use the variant, not a size. Devanagari gets extra line height
(`DEVA_LINE_BOOST`) and `fontFor()`/`hasDevanagari()` picks the face by string,
so a Hindi mantra inside an English screen is still set in Noto. Numerals that
align (counts, prices, times) use `tabularNums`.

### 3.4 Space, radius, elevation, motion

| Token | Values |
|---|---|
| **Space** (4-pt base, 8-px rhythm) | `xs 4` · `sm 8` · `md 16` · `lg 24` · `xl 32` · `xxl 48` · `margin 20` (screen side) · `gutter 16` · `cardPadding 16` |
| **Radius** | `sm 4` · `md 12` · `lg 16` · `xl 24` · `arch 96` (temple-arch, featured media) · `full` |
| **Elevation** | `none` · `low` (resting cards) · `mid` (primary buttons, floating bars) · `high`. Tinted **saffron**, never grey — no harsh shadows. Dashboard: `--shadow-low/mid/high` with the same tint. |
| **Motion** | `quick 160` (taps, toggles) · `settle 320` · `ceremonial 420` (deity cross-fade) · `ambient 2400` (flame, glow). Honour reduced-motion on both platforms; ambient loops stop. |

Dashboard spacing tokens use the same names and px values
(`--space-xs … --space-xxl`). A literal `padding: 18px` is a lint failure
(§9).

### 3.5 Surfaces & themes

Two orthogonal axes, resolved by the provider, never by a screen:

- **Scheme:** light / dark (system or user preference).
- **Surface mode:** `cream` (default) / `sanctum` (immersive, ember). Wrapping
  a subtree in `<Surface mode="sanctum">` re-tones app bar, cards, buttons and
  tab bar together. **Do not hand-roll an "immersive variant" of a component.**

The dashboard ships light + cream only for now; its token file is nonetheless
structured as role → value so a dark scheme is an additive block
(`:root[data-theme="dark"]`).

### 3.6 Icons & imagery

- App: `<Icon name=…>` from `components/ui/icon.tsx` (single registry).
  Dashboard: a matching `<Icon>` over one inline-SVG sprite. **No emoji as
  UI**, no per-screen SVG.
- Icon-only controls **must** carry an `aria-label` / `accessibilityLabel`.
- **No media ships in the app bundle** (AGENTS.md §5): artwork and audio come
  from the dashboard. Unfilled art renders the procedural murti, which needs no
  assets. Never fake social proof.

---

## 4. Component catalogue

The shared vocabulary. Each row is **one** component name used on both
surfaces; "Dash" says what the dashboard kit has (✅) or still lacks (❌).

### 4.1 Primitives

| Component | Variants / props | App (`components/ui`) | Dash (`src/client/ui`) |
|---|---|---|---|
| **Button** | `variant: primary \| secondary \| outline \| ghost \| danger` (+ `glass` app-only) · `size: sm \| md \| lg` · `loading` · `disabled` · `leadingIcon` | ✅ `button.tsx` (variants: primary, secondary, outline, ghost, glass — no `danger` yet) | ✅ `Button` (+ `danger`, `danger-solid`, `loading`) |
| **IconButton** | `variant` · `size` (min 44) · `label` (required) | ✅ `button.tsx` | ✅ `IconButton` (in `Button.jsx`; `label` is the accessible name) |
| **Link / TextButton** | inline action in rows | via `Button variant=ghost` | ✅ row actions are `Button variant="outline"|"danger" size="sm"` |
| **Field** | `label` · `hint` · `error` · `kind: text \| textarea \| number \| select \| date \| file` · `lang` (sets Devanagari face) | ✅ `field.tsx` (text) | ✅ `Field`, `ReadoutField`, `FileField` (URL box + Upload button) |
| **Switch** | controlled boolean, visible On/Off text | ✅ `switch.tsx` | ✅ `Switch` everywhere (read-only: `StatusText`) |
| **Segmented** | 2–5 mutually-exclusive options | ✅ `segmented.tsx` | ❌ |
| **Badge / StatusPill** | `tone: neutral \| accent \| primary \| success \| warning \| error \| live` · `outlined` · always with text | ✅ `Badge` | ✅ `Badge` (border only on `outline`) |
| **Chip** | filter / language tag, selectable | ✅ `card/Chip.tsx` | ✅ language tags are `Badge` |
| **Type** | `variant` · `tone` | ✅ `type.tsx` | ❌ (no `Type` component; `.t-*` utility classes were planned, not built) |
| **Icon** | `name` · `size` · `tone` | ✅ | ❌ |
| **Divider** | `inset` · `gold` | ✅ `card/Divider.tsx` | ❌ |
| **ProgressBar / ProgressRing** | `value` `max` · `aria-valuenow` | ✅ `progress-bar.tsx`, `progress-ring.tsx` | ✅ `ProgressBar` |

### 4.2 Patterns

| Component | Purpose | App | Dash |
|---|---|---|---|
| **Card** | Container. `variant: plain \| ornate \| sunken \| glass` | ✅ `card/Card.tsx` | ✅ `Card` / `StatCard` |
| **Section / SectionHeader** | Titled group + optional action | ✅ `card/SectionHeader.tsx` | ❌ |
| **PageHeader / AppBar** | Screen title, back, actions | ✅ `AppBar` (in `surface.tsx`) | ❌ each tab writes its own `<h1>` |
| **ListRow / DataTable** | Rows with thumb, text, trailing actions; table adds sortable columns, row actions | ✅ `card/ListRow.tsx` | ✅ `DataTable` |
| **Modal / Dialog** | Titled overlay, focus-trapped, Esc closes, `size: sm \| md \| lg`, header / body / footer slots | ✅ `sheet.tsx` (bottom sheet; screens are routes) | ✅ `Modal`, `ViewOnlyModal` |
| **ConfirmDialog** | A real question with a consequence. `tone: default \| danger`, async confirm | ⚠️ `Alert.alert` (6 uses, correct place for real choices) | ✅ `ConfirmDialog` + `useConfirm()` (promise-style); no native `confirm()`/`alert()` remains |
| **Toast** | Non-blocking, self-dismissing feedback. `success \| error \| info`; queued; announced to screen readers | ✅ `toast.tsx` (top-positioned) | ✅ `ToastProvider` / `useToast` |
| **Banner / Callout** | Persistent in-page message (offline, announcement, "API unreachable") | partial (darshan banner) | ✅ `Banner`, `ErrorNote` |
| **EmptyState / NoContent** | Honest "nothing here yet" + the action that fixes it | ✅ `no-content.tsx` (`NoContent`) | ✅ `EmptyState` |
| **ErrorState** | Recoverable failure + Retry | ✅ root `ErrorBoundary` (`app/_layout.tsx`) | ✅ `ErrorState` |
| **Skeleton / Loading** | Layout-stable placeholder | — | ✅ `Skeleton`, `TableSkeleton` (used by `StatCard`, tables) |
| **StatCard** | Number + label (dashboard overview) | — | ✅ `StatCard`, `StatGrid` |
| **Tabs / Sidebar nav** | Primary navigation | ✅ `app-tabs.tsx` | ✅ `app/Sidebar.jsx` + `NavItem.jsx`, built from the tab registry |

### 4.3 Domain features (not reusable kit — but built *only* from the above)

App: `deity-idol`, `thali`, `temple-scene`, `flame` (all in
`components/illustrations/`), `features/darshan/components/LivePlayer.tsx`, the
coin-purchase adapter `features/wallet/lib/razorpay.ts`, and
`features/auth/LoginScreen.tsx`. Dashboard: `features/content/ContentManager.jsx`
(generic CRUD), `HoroscopePage`, `OperatorsPage`, `UsersPage`, `PoliciesPage`,
`LoginPage`, and the astrologer/coin/call pages.
Features contain **no raw colours and no bespoke buttons/pills/modals** — if
they need one, it belongs in §4.1/§4.2.

---

## 5. File structure

The kit's location on each surface is fixed (`poojaappclone/src/components/ui/`,
`pooja-admin/src/client/ui/`). **The full folder structure for all three
projects — and how a feature is decomposed into sub-components — is Part B,
§12–§16.** Short version: *features own their sub-components; the shared kit
owns everything reusable; routes/tabs only compose.*

Import the app kit as `import { Button, Card, Type } from '@/components/ui'`
and tokens as `import { useTheme, Space, Radius } from '@/theme'`. Never
deep-import a kit file. The legacy `constants/theme.ts` Expo-template scaffolding has been deleted; `@/theme` is the theme. (`constants/sacred.ts` and `constants/color.ts` are older token sets that survive for a handful of consumers — §10.)

---

## 6. Component contract

Every kit component, both platforms:

1. **Props are semantic, not visual.** `variant`, `size`, `tone`, `loading`,
   `disabled`, `selected`, `error` — not `color`, `padding`, `width`. The
   one escape hatch is layout (`style`/`className` for *margin and flex
   placement only*), and a review should reject anything else.
2. **Defaults are the common case.** `<Button>` is `primary / md`.
3. **Controlled by default.** Inputs take `value` + `onChange`; the kit holds
   no business state.
4. **All states are designed and implemented:** default · hover (dashboard) ·
   pressed · focus-visible · disabled · loading · error · selected. A PR
   adding a component without them is incomplete.
5. **Accessibility is built in** (§8) — role, label, focus, keyboard,
   min-target.
6. **Typed.** App: exported `XProps` types in the barrel. Dashboard: a JSDoc
   `@typedef` for props above each component (no TS migration implied).
7. **Both languages.** Components accept already-translated strings; they
   never contain copy of their own except via `t()` / the dashboard's labels.
8. **Theme-aware, token-only.** No literal colour/size. (`rgba` washes live in
   tokens, not components.)
9. **Documented by a gallery entry** — *intended*, not yet built: neither
   surface has a component gallery today (the app's `gallery.tsx` route is the
   devotee-facing image gallery, not a kit gallery). The plan is a dashboard
   `#Components` page rendering every variant × state × scheme, with contrast
   numbers beside swatches, and an equivalent in the app.

### Naming

`Component` (PascalCase) · props camelCase · variant values lowercase
(`'primary'`) · token roles camelCase in TS and kebab-case as CSS vars ·
CSS classes `ui-<component>[--modifier]`. Same component, **same name** on
both platforms (a Horoscope status chip is `Badge` everywhere).

---

## 7. Behaviour patterns (decide once, apply everywhere)

### 7.1 Feedback — which one?

| Situation | Use | Never |
|---|---|---|
| Confirmation of something that already happened ("Saved", "Copied 12 readings") | **Toast** (`success`) | `alert()` / modal |
| Recoverable failure of a user action ("Could not save — …") | **Toast** (`error`) with the reason; keep the form open and data intact | Silent failure; clearing the form |
| A choice with a consequence (delete, replace a day, cancel booking, block account) | **ConfirmDialog** — names the object and the effect; destructive uses `tone="danger"` and a verb label ("Delete reading", not "OK") | Native `confirm()`; a vague "Are you sure?" |
| Persistent state of the page/system (offline, API down, blocked) | **Banner** | A toast that vanishes |
| A region with no data | **EmptyState** (what's missing + the action to fix it) | Blank space; fake data |
| A region that failed to load | **ErrorState** + Retry | Raw error string alone |
| Loading | **Skeleton** that holds layout; spinner only inside a button | Layout jump; bare "Loading…" |

Toasts: top-positioned (full-width CTAs live at the bottom), queued, max ~4 s,
`aria-live` polite (errors assertive), never the only record of something
important.

### 7.2 Modals

Opened from a user action; `Esc`, scrim click and ✕ close it (unless dirty — then
confirm discard); focus moves in on open and **returns to the trigger** on
close; background inert; header (title + close) / body (scrolls) / footer
(Cancel left of the primary; destructive action far-left, as a text button).
One modal at a time; a modal never opens another — use a ConfirmDialog.

### 7.3 Forms

Label above control (always a real `<label for>` / `accessibilityLabel`);
helper text under; error text replaces helper and is tied with
`aria-describedby`; validate on blur, summarise on submit; primary action
disabled only while saving (shows `loading`), never merely because the form is
invalid — explain why instead. Dates use a real picker. Bilingual fields come
as an EN/HI pair, side by side, with the HI field falling back visibly
("Empty · the app falls back to English").

### 7.4 Tables, lists and cards

Scope by default (a day, a type) — never dump unbounded history. Row actions
are right-aligned, text-labelled; destructive is last and uses `danger`.
Boolean columns toggle in place with optimistic update + rollback on error.
Card grids use `repeat(auto-fill, minmax(270px, 1fr))`; cards are fully
legible without hover.

### 7.5 Data states (every screen implements all five)

`loading → empty → populated → partial/stale → error` (+ **offline**: the app
falls back to cached/bundled data and says so; the dashboard shows the API
Banner). Feature flags default **on** when unreachable (AGENTS.md §3) — a
missing feature is never evidence the flag is off.

### 7.6 Responsive

- **App:** safe-area aware; content clearance `insets.bottom + BottomTabInset`
  (+ breathing room). There is no max-content-width token yet; large screens
  are not a design target.
- **Dashboard:** fluid. Sidebar + content is a wrapping row (content
  `flex: 999 1 560px; min-width: 0`); toolbars wrap; wide tables scroll inside
  their own `overflow-x:auto` box; usable at 390 px.

---

## 8. Accessibility baseline (acceptance criteria, not aspirations)

- Targets **≥ 44 × 44** (app: `hitSlop`/min size; dashboard: `min-height: 44px`).
- Text **≥ 4.5:1** (verify with `theme/contrast.ts`); UI boundaries/icons ≥ 3:1.
  Never `gold` as text; use `goldInk`.
- **Native semantics first:** `<button>`/`<a href>`/`<input>`+`<label>` on web;
  `accessibilityRole`/`Label`/`State` on RN. Never `onClick` on a `<div>`.
- Visible **focus ring** on every interactive element; never `outline: none`
  without a replacement.
- Full **keyboard** path in the dashboard (Tab order = visual order; Esc closes
  overlays; Enter/Space activate).
- Modals: `role="dialog"`, `aria-modal`, labelled, focus-trapped and restored.
- Status/meaning = colour **+ text/icon**; selected = more than a hue change.
- Dynamic updates (toasts, progress, copy results) announced via live regions.
- Honour **reduced motion** and OS text scaling; no layout that breaks at 200 %.
- Hindi renders in Noto Sans Devanagari with boosted line height — verify
  descenders/matras aren't clipped.

---

## 9. Process

### 9.1 Design-first workflow

1. **Design before building** for any new screen or non-trivial component:
   mock it as a canvas in Claude Design (artboards at 390 × 844 for app,
   1280–1440 for dashboard pages). Use the §3 tokens and §4 components; the
   mock *is* the review artefact. (Precedent: the Horoscope redesign.)
2. **Inventory first.** List which §4 components the design uses. Anything not
   in the catalogue is either a new kit component (add it, §9.2) or a
   feature-local layout — decide explicitly.
3. **Build bottom-up:** token → primitive → pattern → feature → screen. Land
   missing kit pieces before the feature that needs them, ideally as their own
   PR.
4. **Verify** in the real surface (device build / dashboard dev server), in
   **light and dark** (app: also sanctum), **EN and HI**, with **long text**,
   **empty** and **error** data.

### 9.2 Adding or changing a kit component

1. Is there an existing component that takes a new `variant`/`tone`? Prefer
   that. Search the barrel first.
2. Define its props per §6; add to the barrel; add a gallery entry showing all
   variants × states.
3. Mirror it: if it exists on one platform and is plausibly needed on the
   other, either build both or add it to §4's table as ❌ with an owner.
4. Replace at least the call-site that motivated it **and any duplicates it
   obsoletes** — don't leave the old implementation behind.
5. Update this file's §4 table.

### 9.3 Definition of done (PR checklist)

- [ ] No raw hex / px / font-size in feature or screen code — only tokens and
      kit components.
- [ ] No new `.btn`/`.pill`/`.modal`-style one-offs; no `confirm()`/`alert()`
      (dashboard) and no `Alert` for non-choices (app).
- [ ] All states: loading, empty, error, offline, disabled, long text.
- [ ] Every user-facing string through `t()` / labels, **both** `en` and `hi`.
- [ ] §8 checks pass (targets, contrast, labels, keyboard, focus, live regions).
- [ ] Light + dark verified (app: + sanctum).
- [ ] Components added/changed → barrel, gallery and §4 table updated.
- [ ] Structure per §12–§16: file in the right layer/feature, no cross-feature
      deep imports, no file over its size budget (§16.1) without a reason in the PR.
- [ ] `tsc --noEmit` + `lint` (app); `vite build` (dashboard) clean.
- [ ] Screenshots of changed screens in the PR (both languages if copy moved).

### 9.4 Enforcement (automate what can be)

- **Lint rule (both):** disallow colour literals (`#rgb[a]`, `rgb(`, `hsl(`)
  outside `theme/`, `styles/tokens.css`, and the illustrative scenes
  (`components/illustrations/`); disallow `confirm(`/`alert(` in
  the dashboard. Ratchet: fail on *new* violations first, burn the backlog
  down after. *(Not built yet; see §10 and §18 step 14.)*
- **Stylelint (dashboard):** no literal colours / `px` spacing outside tokens;
  class names must match `ui-*` or a feature prefix.
- **Contrast test:** a unit test iterates every role pair through
  `contrast()` and fails below AA — runs in CI with the existing typecheck.
- **CI smoke** already guards the API gate (`pooja-api/scripts/smoke.mjs`);
  the dashboard's `scripts/check-deps.mjs` and `scripts/check-access.mjs` (run by
  `npm run build`) and the app's ESLint import rules are the UI-side checks
  that exist today.

---

## 10. Where we are, and the plan

The restructuring this document originally proposed is **done** for the app and the
dashboard, and done in its file-moving half for the API. This section records what
was found, what changed, and what is genuinely still open. Everything below was
re-measured on 2026-10-07.

### What was found (history) and where it stands

The original audit, row by row:

| Finding (original) | Now |
|---|---|
| Dashboard had **no token file**: ~51 literal hex values in `styles.css` | **Resolved.** `pooja-admin/src/client/styles/tokens.css` holds the roles (35 hex, all definitions). 17 literals remain outside it — `styles.css` 8, `styles/features.css` 4, `styles/ui.css` 4, `styles/shell.css` 1 (the sidebar gradient and a few chart/status tints) |
| Two primary-button colours (`.btn` saffron, `.horo .btn` maroon) plus `.link-btn`, `.horo-icon` | **Resolved.** One `Button` / `IconButton` in `ui/Button.jsx`; no `.btn`, `.link-btn`, `.pill`, `.toggle`, `.modal` or `.switch` rule exists in any stylesheet |
| **Modal** markup copy-pasted in 3 files (5 modals) | **Resolved.** `ui/Modal.jsx` (+ `ViewOnlyModal`); every feature's edit/view dialog composes it |
| **Status pill** three times (`.pill`, `.toggle`, `.horo-pill`) | **Resolved.** `ui/Badge.jsx`; booleans use `Switch` (editable) or `StatusText` (read-only) |
| **7 native `confirm()`/`alert()`** | **Resolved.** None remain; `grep -rE "\b(confirm\|alert)\(" pooja-admin/src/client` finds only the promise-style `useConfirm()` hook from `ui/ConfirmDialog.jsx` |
| **No Toast** in the dashboard | **Resolved.** `ui/Toast.jsx` (`ToastProvider` is mounted in `app/providers.jsx`) |
| App: **~67 raw hex** outside `theme/` and the illustration scenes | **Still open, now ~98** across 30 files. They are mostly data rather than screen styling — deity/temple palettes (`providers/content/resources/deities.ts`, `temples.ts`), wallpaper washes (`features/wallpaper/constants/washes.ts`), the `constants/sacred.ts` token set, the sanctum scene (`features/pooja/components/*`) — plus a few kit files (`ui/section-band.tsx`, `ui/icon-glyphs.tsx`, `ui/card/Badge.tsx`). A previous sweep found no colour with an identical value across all four scheme × surface combinations, so none could be swapped for a role without a visible change |
| App: legacy `constants/theme.ts` imported by ~10 files | **Resolved.** Deleted. `constants/sacred.ts` (one consumer: `app/_layout.tsx`) and `constants/color.ts` (three: `temples-map/components/Marker.tsx`, two illustrations) are older token sets that survive; folding them into `@/theme` is open |
| App: kit lacks a `danger` Button variant, a `Switch`, a generic `Modal`/sheet | **Partly resolved.** `Switch` (`switch.tsx`) and `Sheet` (`sheet.tsx`) exist, plus `Segmented`, `Avatar`, `Coins`. Button variants are still `primary \| secondary \| outline \| ghost \| glass` — **no `danger`** |
| Dummy checkout (`components/payment/razorpay-checkout.tsx`) and the app's analytics `logPayment` | **Resolved.** The checkout component and the client-side payment log are gone; coin purchase goes through `features/wallet` (`use-recharge.ts` → `lib/razorpay.ts` → the API's order/verify endpoints, §19.5). The API ships a `mock` provider (dev/test only, refused in production) and a real Razorpay adapter (`modules/coins/providers.js`, plain `fetch`); **no native Razorpay SDK is installed in the app** |

### Refactor status (done) — measured, not guessed

The strangler refactor (§18) has been carried out for old code; new code was already in shape.
Last full verification of the structural change: API module tests, boot +
`pooja-api/scripts/smoke.mjs`, an identical route/gate probe (anonymous / admin / editor);
dashboard `npm run build` (dependency check, permission-matrix check, `vite build`) and the
coin-pack parity test; app `tsc` + lint, the i18n parity test, and a real Android `expo export`.

| Before | After |
|---|---|
| Dashboard `App.jsx` 786 lines | `app/App.jsx` 75 + `AdminShell.jsx` 43 + `Sidebar.jsx` 40 + the tab registry (`app/tabs.js` 75 + `app/tab-areas.js`) |
| `ContentManager.jsx` 330 | `features/content/ContentManager.jsx` 100; per-resource field configs in `features/content/resources/` |
| `HoroscopeBoard.jsx` 427 | `features/horoscope/HoroscopePage.jsx` 91 + `components/`, `hooks/`, `lib/` |
| `api.js` 238 | `lib/api/{client,resources,index}.js` (a thin `src/client/api.js` still exists for old imports) |
| API `models.js` 678 | 28-line barrel over per-module `*.model.js` |
| API `index.js` 210 | 2-line entry + `server.js` 51 + `app.js` 107 |
| API `content.js` / `auth.js` / `admin.js` / `db.js` / `routes.js` / `broadcast.js` / `files.js` / `firebase.js` / `operators.js` | `modules/*`, `middleware/{access,require-auth}.js`, `config/{env,cors}.js`, `db/{connect,seed}.js`, `modules/media/files.js`, `modules/auth/firebase.js`, `modules/operators/*` |
| App route screens (`alarm` 817, `pooja` 706, `home` 557, `gallery` 519, …) | 5-line shims in `src/app/`; screens in `features/*` |
| App `context/` (content 609, language 572, auth, admin) | `providers/{content,auth,admin,wallet}`, `i18n/{en,hi}` (14 topic files each, key-parity test) |
| App `components/auth/login-screen.tsx` (940), `ui/icon.tsx` (397), `lib/api.ts`, `ui/card.tsx` | `features/auth/*`, `ui/icon.tsx` + `ui/icon-glyphs.tsx`, `lib/api/` (a folder), `ui/card/` (a folder) |
| `components/mandir`, `components/pooja`, `constants/theme.ts` (template), dummy checkout, `logPayment` | `components/illustrations`; theme file and its dead consumers deleted; checkout and `logPayment` removed |

Enforced mechanically: dashboard `scripts/check-deps.mjs` (part of `npm run build`) and app
ESLint `no-restricted-imports` rules (`poojaappclone/eslint.config.js`) forbid reaching into
another feature's internals; dashboard `scripts/check-access.mjs` asserts the permission matrix
and that no component compares a role name.

**Still open work:**
- **API layering.** Old modules (`auth`, `operators`, `users`, `flags`, `analytics`,
  `announcements`, `horoscope`, `panchang`, `policies`, `content`, `media`, `public`) are
  `*.routes.js` + model + a few helpers; they have **no** `*.schema.js`, `*.controller.js`,
  `*.types.js` or `*.service.js` split. The newer modules (`wallet`, `coins`, `bookings`, `chadhava`,
  `astrologers`, `calls`, `payouts`) have model + service + routes + test + `index.js`, but also no
  schema/controller/types files. §14.3 describes the aspiration; §14.2 describes what exists.
- **Per-route `access.*` declarations were not built.** The gate is `middleware/access.js`
  (the `PUBLIC` allowlist) plus `access/routes.js` (the path → area table, §21.5). Both are
  fail-closed, and `pooja-api/scripts/smoke.mjs` checks them, but a developer still edits those two
  tables rather than declaring a level beside the route.
- **Error envelope** is `{ error, code, …extra }` (`lib/http-error.js`), kept compatible with
  existing clients — not a nested `{ error: { code, message } }` object.
- **`routers({ requireAuth })`** is the contract for the seven newer modules only
  (`modules/index.js`); the older routers are mounted one by one in `app.js`, where mount order is
  gate-sensitive.
- **App:** no raw-colour sweep (above). `ui/icon-glyphs.tsx` (316 lines) and `ui/toast.tsx` (281)
  are over the §16 size budgets. The login refactor (`features/auth`) is not yet device-verified;
  the "Change photo" button on Create Profile still has no handler and no picker exists (a product
  decision).
- **Dashboard:** the kit is adopted by every screen. Deliberately bespoke inner markup remains for
  the Overview bar chart (`.chart/.bar*`), the horoscope day strip and rashi tiles (`.horo-*`), the
  policy markdown split view (`.md-*`) and the sidebar (`.nav*`). The kit's `Skeleton` is used by
  `StatCard`; `#Components` (the gallery, §6 item 9) does not exist.
- **Lint/CI ratchets** not built: stylelint, the colour-literal lint rule, the contrast unit test,
  and a "controller may not import a model" rule (there are no controllers).
- **Security items** found during the refactor and not yet closed: mass assignment in the generic
  CRUD factory (`Model.create(req.body)` / `$set: req.body` in `modules/content/crud.factory.js`),
  `GET /content` publishing every `Setting` row, stateless operator sessions (logout clears the
  cookie but a copied cookie stays valid until it expires, `modules/operators/session.js`), no
  timeout on the Expo push fan-out, and orphaned wallet/booking rows when a devotee is deleted.
  Fixed since: bad ids on `/api/content/*` answer 400, create/update no longer echo raw database
  errors (a duplicate is "Another item already uses that slug."), `ContentManager` and Users show the API's
  message instead of failing silently, and CI runs the module suites, the coin-pack parity test and
  the i18n key-parity test.

### Migration order (history — each step was independently shippable)

All six steps below are done except where noted; the strangler record for the whole
project is §18.

1. **Tokens (dashboard):** `styles/tokens.css` with the §3.2 roles (values from
   `palette.ts`/`tokens.ts` light-cream). *Done.* (`styles/base.css` was planned and
   not created — the focus ring lives in `styles/ui.css`; `styles/` is `tokens.css`, `ui.css`,
   `shell.css` and `features.css`, with `src/client/styles.css` holding the remaining base rules.)
2. **Primitives:** `Button` (+`danger`, `loading`), `IconButton`, `Badge`,
   `Switch`, `Field`. *Done; the legacy classes are deleted.* The saffron-vs-maroon
   question settled as: **primary action = Kumkum (`primary`); Saffron is `accent`,
   reserved for the highest-emphasis CTA and the brand's "sunlight"**.
3. **Overlays:** `Modal`, `ConfirmDialog`, `Toast` + providers. *Done.*
4. **Patterns:** `Card`, `DataTable`, `EmptyState`, `ErrorState`, `Skeleton`, `StatCard`.
   *Done.* (`PageHeader` was not built — each page still writes its own heading.)
5. **App:** `Switch` and `Sheet` added to `components/ui`; `constants/theme.ts` deleted.
   *Partly done:* no `danger` Button variant, and the raw-hex sweep is open (above).
6. **Gallery + enforcement:** dashboard `#Components` page; lint/stylelint ratchet and
   the contrast test (§9.4). *Not done.*

The Horoscope tab was the first feature built to this document's *shape* (cards,
status badge, modal, week strip, progress) and the proving ground: its `.horo-pill`,
`.horo-icon`, `.horo-modal`, `.horo-track` and `.horo-card` became `Badge`, `IconButton`,
`Modal`, `ProgressBar` and `Card`. Its day strip and rashi tiles keep `.horo-*` layout classes.

---

## 11. Quick reference

- Need a colour? → role in §3.2. Not there → ask whether it's really new.
- Need a button/pill/modal/toast? → §4. It exists or it gets added to the kit.
- Wondering toast vs dialog vs banner? → §7.1.
- Is this text readable? → `contrast(fg, bg)` ≥ 4.5.
- Gold text? → no. `goldInk`.
- Hindi string? → Noto Sans Devanagari, via `<Type>` (app); the dashboard sets the family in CSS (`.t-*` classes are planned).
- Done? → §9.3.


---
---

# Part B — Architecture

## 12. Architecture principles (all three projects)

1. **Organise by feature, share by layer.** Code that changes together lives
   together: a *feature* (horoscope, temples, operators…) owns its screens,
   sub-components, hooks, data access, validation and constants. Only what is
   genuinely cross-cutting (UI kit, theme, API client, auth, middleware) is
   shared, and it sits *below* features.
2. **Dependencies point one way.**
   `shared kit / lib  →  feature  →  route / tab / app wiring`.
   A feature never imports another feature's internals; it goes through that
   feature's `index` (its public surface) — or, better, through a shared layer.
   Shared code never imports a feature.
3. **Thin edges, fat middle.** Route files, tab entries, controllers and
   screens do wiring only: parse input → call one thing → render/respond. Logic
   lives in services (API), hooks (clients) and pure `lib/` functions —
   testable without a server, a device or the DOM.
4. **Data is accessed in exactly one place per side.** API: services own
   Mongoose. Clients: `lib/api` (and a feature's own `api` file) own `fetch`.
   Components never call `fetch`; controllers never touch a model.
5. **Config and content are data, not code.** Field definitions, tab
   registries, rashi lists, seed catalogues and i18n strings live in data
   modules, not inline in components — adding a tab or a field is a one-line
   change to a table.
6. **One public surface per module** (`index.js` / `index.ts`). Everything not
   exported from it is private and may be refactored freely.
7. **Structure follows the strangler rule** (§18): new code uses the new
   structure; old code moves only when touched, in move-only PRs.

### 12.1 Naming parity across the stack

One concept → one name everywhere. This is what lets a developer find the
whole vertical by search.

| Concept | API module | Route | Mongoose model | Dashboard feature | App feature |
|---|---|---|---|---|---|
| Daily readings | `modules/horoscope` | `/api/horoscope`, `/api/horoscope/day/:date`, CRUD at `/api/content/horoscopes` | `Horoscope` | `features/horoscope` | `features/horoscope` |
| Temples | `modules/content` (`resources/temple.resource.js`) | `/api/content/temples` | `Temple` | `features/content` (`resources/temples.js`) | `features/temples` |
| Devotees | `modules/users` | `/api/users` | `User` | `features/users` | `features/profile` |
| Operators | `modules/operators` | `/api/admin/operators` | `Operator` | `features/operators` | — |
| Coin packs & wallets | `modules/coins`, `modules/wallet` | `/api/coins/packs`, `/api/wallet`, `/api/admin/coin-packs` | `CoinPack`, `Wallet`, `WalletTxn` | `features/coins` | `features/wallet` |
| Astrologers | `modules/astrologers` | `/api/astrologers`, `/api/admin/astrologers` | `Astrologer` | `features/astrologers` | `features/astrologers`, `features/astrologer-mode` |

Fields: camelCase; bilingual text is `<name>` + `<name>Hi` (existing:
`prediction`/`predictionHi`); day keys are local `YYYY-MM-DD` strings;
booleans read as states (`enabled`, `blocked`), never negatives.

---

## 13. Mobile app — `poojaappclone/`

### 13.1 Current structure

```
poojaappclone/
├── src/
│   ├── app/                  ROUTES ONLY (expo-router). Each file is a shim (≤ ~15 lines, bar `_layout.tsx`):
│   │   ├── _layout.tsx       provider tree, RootGate (→ AuthGate / AstrologerShell / tabs), ErrorBoundary
│   │   ├── (tabs)/           index · pooja · temples · bhajan · profile
│   │   ├── (astrologer)/     astro-home · astro-calls · astro-earnings · astro-profile
│   │   ├── call/[id].tsx · call/summary/[id].tsx
│   │   └── alarm.tsx  …      `export default function Alarm() { return <AlarmScreen/> }`
│   │
│   ├── features/             ONE FOLDER PER FEATURE — see §13.2
│   │   ├── home/  pooja/  temples/  temples-map/  bhajan/  profile/  saved-temples/
│   │   ├── alarm/  ringtone/  wallpaper/  gallery/  journal/  panchang/  horoscope/
│   │   ├── festivals/  booking/  my-poojas/  chadhava/  darshan/  knowledge/  help-support/
│   │   ├── auth/             AuthGate, LoginScreen, CreateProfileScreen, LanguageScreen
│   │   ├── wallet/  astrologers/  call/  astrologer-mode/     (§19.7)
│   │   └── <feature>/index.ts    public surface (the Screen + anything others may use)
│   │
│   ├── components/
│   │   ├── ui/               THE KIT (§4). Flat files (button, field, sheet, switch, toast,
│   │   │                     type, icon, …); `card/` is a folder (Card, Badge, Chip, ListRow, …)
│   │   ├── illustrations/    deity-idol, thali, temple-scene, flame, clouds, marigold …
│   │   └── app-tabs.tsx · call-icons.tsx      shell-level components
│   │
│   ├── providers/            app-wide state, one folder each — §13.3
│   │   └── content/  auth/  admin/  wallet/
│   │
│   ├── theme/                tokens · palette · typography · fonts · contrast · provider
│   ├── i18n/                 LanguageProvider · use-language · strings · en/ · hi/ — §13.3
│   ├── lib/                  cross-feature, framework-free: api/ (folder), firebase-auth.ts, geo.ts, …
│   ├── hooks/                cross-feature hooks only (use-location.ts)
│   ├── constants/            config.ts, support.ts — deployment/dev defaults; plus bundled
│   │                         fallback catalogues (deities, temples, festivals, poojas) and the
│   │                         older token sets (sacred.ts, color.ts — §10)
│   └── global.css
├── modules/                  local native modules: expo-alarm, expo-wallpaper
├── types/                    ambient `.d.ts` files (outside `src/`)
└── docs/ARCHITECTURE.md      the app's own architecture note
```

### 13.2 Inside a feature (the template)

The alarm feature, as it exists:

```
features/alarm/
├── AlarmScreen.tsx           container: wires hook(s) → view components
├── components/               sub-components used ONLY by this feature
│   ├── ReminderList.tsx      maps data → <ReminderRow/>, owns the empty state
│   ├── ReminderRow.tsx       one row: label, time, toggle, actions
│   ├── AddReminder.tsx
│   ├── TimePicker/           folder once it has parts of its own
│   │   ├── TimePicker.tsx
│   │   ├── HourMinuteFields.tsx · StepGroup.tsx · PickerActions.tsx
│   │   └── index.ts
│   ├── ToneCard.tsx
│   └── PermissionBanner.tsx · FullScreenNotice.tsx
├── hooks/
│   ├── use-alarm-screen.ts   the container's state
│   ├── use-reminders.ts      reminders the devotee owns (bundle − tombstones + custom)
│   ├── use-reminder-store.ts · use-reminder-sync.ts · use-reminder-permission.ts · use-now.ts
├── lib/                      pure logic and native wrappers (unit-testable)
│   ├── schedule.ts · time.ts · rings-in.ts · reminder-state.ts (+ .test.mjs)
│   └── native-alarm.ts · notifications.ts · fallback-notifications.ts
├── constants/                reminders.ts (bundled daily cycle), storage.ts
├── types.ts
└── index.ts                  export { AlarmScreen } …  ← nothing else is public
```

Rules specific to the app:

- **`app/*.tsx` is a route shim.** It imports a `*Screen` from `@/features/x`
  and renders it. All layout lives in the feature. This keeps routing
  concerns (params, redirects, `Stack.Screen` options) out of UI code.
- **A Screen is a container:** it calls hooks, reads providers, handles
  navigation, and passes plain props down. **Sub-components are presentational:**
  props in, JSX out, no `useRouter`, no providers (except `useTheme`), no
  fetching. That is what makes them reusable.
- **Features may import:** `@/components/ui`, `@/theme`, `@/i18n`/`useLanguage`,
  `@/lib`, `@/providers`, `@/hooks`. **Features may not import another
  feature's folder** except its `index.ts` (enforced by ESLint
  `no-restricted-imports` in `poojaappclone/eslint.config.js`). Shared between
  two features → move it down to `ui/`, `lib/` or `hooks/`.
- **Native modules** (`modules/expo-alarm`, `modules/expo-wallpaper`) are
  wrapped by one file in the owning feature's `lib/` (`features/alarm/lib/native-alarm.ts`,
  `features/wallpaper/lib/native-wallpaper.ts`) — screens never import a
  native module directly, so a rebuild-only change stays in one place. The same
  rule holds for third-party native SDKs: `features/wallet/lib/razorpay.ts` and
  `features/call/lib/rtc-client.ts` are the only files that may import the
  payment and voice SDKs.
- **Sign-in is a feature.** `features/auth` owns the language, login and
  create-profile screens plus `AuthGate`; `app/_layout.tsx`'s `RootGate` renders
  it until a profile exists.

### 13.3 Providers and i18n (the two formerly oversized files)

`context/content.tsx` (609 lines) and `context/language.tsx` (572, mostly
`STRINGS`) were the app's biggest non-screen files. They are now:

```
providers/content/
├── ContentProvider.tsx       fetch + cache + merge only
├── use-content.ts            the hook the app imports
├── context.ts · types.ts · build-value.ts · cache.ts
├── resources/                one selector module per resource
│   ├── deities.ts  temples.ts  festivals.ts  sevas.ts  settings.ts
│   └── (each: normalise remote → app shape + bundled-fallback merge)
├── assets.ts                 assetUrl(), deityImage(), toneSound()
└── index.ts

providers/{auth,admin,wallet}/   same pattern: a Provider, a context/hook, an index.ts (`wallet/` is just
                                 WalletProvider.tsx + index.ts)

i18n/
├── index.ts                  public surface: t(), useLanguage(), LanguageProvider
├── LanguageProvider.tsx · context.ts · use-language.ts · strings.ts
├── en/  common.ts  home.ts  pooja.ts  booking.ts  chadhava.ts  coins.ts  astrologer.ts  auth.ts  …
├── hi/  (same file names — enforced by a test)
└── i18n.test.mjs             asserts both trees export identical key sets
```

The same-file-name rule for `en/` and `hi/` plus `i18n.test.mjs` (run in CI) turns "add keys
to BOTH" (AGENTS.md §5) from a convention into a failing build.

---

## 14. Backend API — `pooja-api/`

### 14.1 History

The API used to be a flat `src/`: `models.js` (all 16 models), `content.js`
(generic CRUD for nine resources + upload + users + public content), `auth.js`,
`admin.js` (the gate, login, role policy), `db.js` (connect **and** seeds),
`broadcast.js`, `files.js`, `firebase.js`, `operators.js`, `index.js` (app
assembly and boot) and `routes.js` (flags, ingest, payments, visitors). Those files
are gone; their contents moved into the module layout below (§10 has the
before/after table, §18 the mapping).

### 14.2 Current structure — feature modules

```
pooja-api/src/
├── index.js                  2 lines: imports server.js
├── server.js                 boot only: load env → connect db → ensureFirstOperator → seedModules → start jobs → listen
├── app.js                    builds the Express app: middleware order, mounts modules,
│                             the gate, static/SPA, one generic error handler.  No business logic.
├── health.js                 /api/health (reports commit)
├── models.js                 barrel re-exporting every module's model
├── seed.js                   `npm run seed` — fake sessions/events for a local dashboard
│
├── config/
│   ├── env.js                parse + validate process.env once; export `config`
│   └── cors.js               origin policy (the credentialed-CORS rules)
│
├── middleware/
│   ├── access.js             THE GATE — fail-closed: the PUBLIC allowlist + area/permission check
│   └── require-auth.js       devotee Firebase ID token (403s blocked accounts)
│
├── access/                   roles and permissions (§21)
│   ├── permissions.js        ROLE_PERMISSIONS — the one definition of admin / editor / viewer
│   ├── routes.js             the path → area table (ROUTE_AREAS)
│   ├── redact.js             masking of devotee PII at the serializer
│   ├── settings-guard.js     money-key writes in /content/settings need `money:edit`
│   └── access.test.mjs
│
├── lib/                      framework-free helpers
│   ├── async-handler.js      asyncRouter — a rejected handler cannot crash the process
│   ├── http-error.js         HttpError + httpErrorHandler
│   ├── settings.js           getSetting / getNumberSetting / getBoolSetting / ensureSetting
│   └── coin-pack.js          describePack / packProblem (pure; the dashboard keeps a copy)
│
├── db/
│   ├── connect.js            mongoose connection, then seedDefaults()
│   └── seed.js               seedDefaults(): flags, content, booking backfill, policies
│
├── modules/                  ONE FOLDER PER FEATURE — §14.3
│   ├── index.js              mounts the seven newer modules (open / admin) + their seeds and jobs
│   ├── auth/         devotee sign-in sync + profile: auth.routes.js · profile.js · firebase.js
│   ├── operators/    dashboard login/session/CRUD: login.routes.js · operators.routes.js ·
│   │                 operators.service.js · operator.model.js · session.js · passwords.js ·
│   │                 login-limiter.js · audit.js · audit.model.js
│   ├── users/        devotee list/update/block/delete
│   ├── flags/        flag.model.js · flag.defaults.js · flags.seed.js · flags.routes.js
│   ├── analytics/    ingest, events, visitors (analytics.model.js · analytics.routes.js)
│   ├── announcements/   model · resource · routes (CRUD + push)
│   ├── horoscope/    model · resource · routes (+ /day/:date copy endpoints)
│   ├── panchang/     model · resource · routes
│   ├── policies/     model · routes · seed
│   ├── media/        GridFS: files.js · upload.routes.js (POST /content/upload) · uploads.routes.js (/uploads)
│   ├── content/      deities · temples · aartis · festivals · sevas · knowledge · faqs · hero ·
│   │                 reminders · tones · wallpaper styles · settings — one `crud.factory.js`,
│   │                 `models/*.model.js`, `resources/*.resource.js`, `content.seed.js`, `seed-content.json`
│   ├── public/       the phone app's read endpoints (GET /content) — assembles from
│   │                 other modules' models; owns none
│   ├── wallet/       model · service (the ONLY writer of balances) · routes · test
│   ├── coins/        model · service · routes · billing-rules.routes.js · providers.js
│   │                 (mock + Razorpay) · seed · test
│   ├── bookings/     model · service · routes · test
│   ├── chadhava/     model (Offering, ChadhavaOrder) · service · routes · test
│   ├── astrologers/  model · service · routes · claim.js (sign-in claim) · guard · test
│   ├── calls/        model · service (state machine) · routes · billing.ticker.js ·
│   │                 rtc.provider.js · call.push.js · test
│   ├── payouts/      model (AstrologerEarning, Payout) · service · routes · test
│   ├── _harness.mjs · test-kit.mjs      test support (fake `requireAuth`, in-memory app)
│   └── <module>/index.js    each module's public surface
│
└── security.test.mjs         cross-cutting gate/security regression tests

pooja-api/scripts/            smoke.mjs (gate regression) · migrate-media.mjs · media-check.mjs
```

### 14.3 Inside a module (the template, and how far it is built)

What a newer module (`coins/`, `wallet/`, `calls/` …) looks like:

```
modules/coins/
├── coins.model.js            Mongoose schema + indexes ONLY
├── coins.service.js          all logic & queries; plain functions; no req/res
├── coins.routes.js           paths, validation, HTTP status + JSON; calls the service
├── billing-rules.routes.js   a second router when the module has a second surface
├── providers.js              adapter behind an interface (mock | Razorpay)
├── seed.js                   default data (optional)
├── coins.test.mjs            service + route tests (`node --test`)
└── index.js                  exports { routers({ requireAuth }), seed?, start? }
```

The fuller template the design called for — add `*.schema.js` (request
validation), `*.controller.js` (HTTP only) and `*.types.js` (JSDoc contract) — was
**not built**; `routes` plays the controller's role and validates inline. Older
modules are thinner still (routes + model + helpers). Treat the rules below as
**in force** unless marked *aspirational*:

- **Services never see `req`/`res`** (newer modules). A service is callable from a script
  (`scripts/`), a test, or another module with no HTTP in sight. `wallet.service` is the only
  code that touches `Wallet`/`WalletTxn`. *Aspirational:* a controller layer
  (`routes → controller → service → model`) and "controllers never import a model".
- **Modules talk through services, never models** — followed by the money modules;
  `modules/public` (and the old routers) still query models directly.
- **Access is a table, enforced centrally.** Fail-closed and complete, but **not declared
  per route**: `middleware/access.js` holds the `PUBLIC` allowlist of endpoints the phone app
  needs, `access/routes.js` maps every other path to an area (§21.5), and an unmapped path is
  admin-only. A new route is private until someone names it, and
  `pooja-api/scripts/smoke.mjs` asserts public = 200 and admin = 401/403. *Aspirational:* the
  `access.public/auth/admin/adminOnly` helper beside each route, which would remove the
  two-table edit.
- **Validation at the edge.** Today it is inline in the route (e.g. `packProblem` for coin
  packs, `HttpError(400, …)` for bad input). *Aspirational:* one `*.schema.js` per module.
  The rule that identity comes from the verified token, never the body, is in force.
- **One error shape, additive:** `{ "error": "<human message>", "code": "<machine_code>", …extra }`
  — `error` stays a string so installed clients keep working. Services throw `HttpError`
  (`lib/http-error.js`); routers that throw it mount `httpErrorHandler`; `app.js` ends with
  a generic 500 handler that never echoes internals.
- **Content CRUD stays generic, not copy-pasted.** `modules/content/crud.factory.js`
  exports `crud(ModelName, Model, sort)`, which builds list/create/update/delete (bad id → 400,
  duplicate → 409); each resource is a 3-line `*.resource.js` (`{ path, name, Model }`) in
  `content/resources/`. Special behaviour (horoscope's day-copy, announcements' push) is a *module*, not
  a branch in the factory. *Open:* the factory writes `req.body` as-is (no field allowlist).
- **Seeds are per module** (`flags.seed.js`, `policies.seed.js`, `content.seed.js`,
  `coins/seed.js`, the chadhava `seed()` …); `db/seed.js` runs the older ones in a fixed
  order and `modules/index.js` runs the newer modules' `seed()`. One-shot jobs live in `scripts/`.
- **Config is read once** in `config/env.js`, which also produces the boot-time Firebase-project
  check and the production refusals (no operators and no `ADMIN_PASSWORD`). Exception: the
  payment and RTC adapters (`coins/providers.js`, `calls/rtc.provider.js`) read their own
  `RAZORPAY_*` / `RTC_PROVIDER` / `AGORA_*` variables.
- **Backward compatibility is a rule, not a courtesy.** Installed apps cannot be
  force-updated, and the app ships config at bundle time. API changes are
  **additive** (new field/endpoint); removing or renaming a field the app reads
  needs a deprecation window and the `410 Gone` treatment already used for
  `POST /users`. (§20.7 records the one deliberate exception.)

---

### 14.x Microservices layout (pointer — `backend/`)

§14.1–14.3 describe `pooja-api/`, which is now the fallback monolith. Its replacement is `backend/` (npm workspaces):
`packages/common`, six services (`engagement, identity, catalog, wallet, orders, calls`; each `src/{config.js,server.js,app.js,
routes/ or modules/…}`, own `package.json`, tests, `.env.example`, `Dockerfile`) and two BFFs (`bff/mobile`, `bff/admin`). The rules
of §14 carry over unchanged (one `config.js` is the only reader of `process.env`; a new route needs an area entry; the gate fails
closed). Cross-service rules: a service never reads another's database; calls between services carry a signed service token
(`@bhakti/common`), money moves only through the wallet with an idempotency key, and the BFFs are the only public routes. See
`docs/MICROSERVICES.md` for the contract and `docs/MICROSERVICES_CUTOVER.md` for deployment.

## 15. Admin dashboard — `pooja-admin/`

### 15.1 History

`App.jsx` was 770 lines: the shell, the sidebar, **all** field configuration for
every content type, `Overview`, `Flags`, the tab `if`-chain and the Horoscope
state. `ContentManager.jsx` (330) was table + row + modal + every field-type
input in one component, and `api.js` one flat object. All three are decomposed
as described below (before/after in §10).

### 15.2 Current structure

```
pooja-admin/
├── index.html · vite.config.js · package.json · render.yaml
├── scripts/                  check-deps.mjs (feature isolation) · check-access.mjs (permission matrix);
│                             both run by `npm run build`
└── src/client/
    ├── main.jsx              mount; imports styles.css + styles/*
    ├── api.js                re-export shim: `export * from './lib/api/index.js'`
    ├── app/
    │   ├── App.jsx           session gate → <AdminShell/> or <LoginPage/>
    │   ├── AdminShell.jsx    <Sidebar/> + <main> + hash routing + access filtering
    │   ├── Sidebar.jsx       brand · <NavItem/>s · ApiStatus · whoami · sign-out
    │   ├── NavItem.jsx · ApiStatus.jsx
    │   ├── tab-areas.js      one row per tab: { id, group?, area } — which permission area it needs
    │   ├── tabs.js           THE TAB REGISTRY: tab-areas rows + the page component for each
    │   └── providers.jsx     <ToastProvider> + <ConfirmProvider>
    │
    ├── ui/                   THE KIT (§4): Button/IconButton, Modal, ViewOnlyModal, ConfirmDialog,
    │   └── index.js          Toast, Field/FileField/ReadoutField, Badge, Switch, Card, StatCard/StatGrid,
    │                         DataTable, ProgressBar, ErrorNote, States (Banner, EmptyState, ErrorState,
    │                         Skeleton, TableSkeleton), ViewOnly (StatusText, ReadOnlyBadge, ReadOnlyList)
    │
    ├── features/             ONE FOLDER PER TAB / DOMAIN — §15.3
    │   ├── overview/  flags/  policies/ (the "Rules" tab)  visitors/
    │   ├── content/          the generic CRUD manager + per-resource field configs; also serves the
    │   │                     Deities, Temples, Aartis, Festivals, Sevas, Knowledge, FAQs, Home Slides,
    │   │                     Panchang, Announcements, Reminders, Alert Tones, Wallpapers and Settings tabs
    │   ├── horoscope/  offerings/  bookings/  coin-orders/
    │   ├── astrologers/  coins/  calls/              (§19.8)
    │   ├── operators/  users/  login/
    │   └── <feature>/index.js    public surface
    │
    ├── lib/
    │   ├── api/              client.js (req, credentials, Unauthorized/forbidden handlers)
    │   │                     resources.js (api.horoscopes, api.deities …) · index.js
    │   ├── access/           AccessContext.jsx (useAccess, <Can>) · permissions.js (visibleTabs) · forbidden.js
    │   ├── hooks/            useLoader · usePoll · useHashRoute · useBillingRules
    │   └── dates.js · money.js · csv.js · ids.js
    │
    └── styles/               tokens.css · ui.css · shell.css · features.css   (+ styles.css base rules)
```

`tabs.js` replaced both the `TABS`/`ADMIN_TABS` sets and the 15-branch
`{current === 'X' && …}` chain: adding a tab is one row in `tab-areas.js` and one
entry in `tabs.js`, and the role filter, sidebar and renderer all read the same list.
(`#Components`, the planned gallery, is not built.)

### 15.3 Inside a feature — worked example: Horoscope

`HoroscopeBoard.jsx` (427 lines) used to do data loading, derived counts,
date maths, the day bar, the week strip, the progress bar, twelve cards, the
edit modal and a copy-day action. Now:

```
features/horoscope/
├── HoroscopePage.jsx         container: useHoroscope() → composes the parts (91 lines)
├── components/
│   ├── DayBar.jsx            ‹ date › Today · picker · [Show all dates] [Copy previous day]
│   ├── WeekStrip.jsx         seven <DayChip/>s
│   ├── DayChip.jsx
│   ├── DaySummary.jsx        <ProgressBar/> + <StatusLegend/> + the message line
│   ├── StatusLegend.jsx
│   ├── RashiGrid.jsx         12 × <RashiCard/>, owns the loading state
│   ├── RashiCard.jsx         presentational: <Badge/>, excerpt, lucky meta, actions
│   ├── LanguageTags.jsx      the EN/HI chips
│   ├── ReadingViewModal.jsx  read-only view (viewer role)
│   └── ReadingModal/
│       ├── ReadingModal.jsx  <Modal> shell + footer actions
│       ├── ReadingForm.jsx   <Field>s: EN/HI pair, lucky row, visibility
│       └── index.js
├── hooks/
│   ├── useHoroscope.js       list, byDate map, per-day counts, status derivation
│   ├── useDayScope.js        which day the table is scoped to
│   ├── useReadingEditor.js   editing draft, save, delete, dirty-check
│   └── useCopyPreviousDay.jsx
├── lib/
│   └── status.js             isWritten / statusOf  (pure)
├── constants/
│   ├── rashis.js             RASHIS (name, English, Devanagari)
│   └── fields.js
└── index.js                  export { HoroscopePage }
```

What moved *down* into the shared kit as a result: the maroon button →
`Button`; `.horo-pill` → `Badge`; `.horo-icon` → `IconButton`; the modal chrome →
`Modal`; `.horo-track` → `ProgressBar`; the bare `confirm()` →
`ConfirmDialog`; `shiftDate`/`todayKey` → `lib/dates.js`.

### 15.4 `ContentManager` decomposition

```
features/content/
├── ContentManager.jsx        wires useContentResource() to the pieces below (100 lines)
├── ContentPage.jsx           contentPage(resourceConfig) → a tab page around ContentManager
├── components/
│   ├── ContentToolbar.jsx    count + scope note + "+ Add"
│   ├── ContentTable.jsx      <DataTable/> with columns from the field config
│   ├── ContentRow.jsx        thumb, cells, <RowActions/>
│   ├── RowActions.jsx        custom rowAction, Edit, Delete (ConfirmDialog)
│   ├── EditModal.jsx         <Modal> + <FieldList/>
│   ├── ViewModal.jsx         read-only view for roles without `edit` (§21.6)
│   ├── FieldList.jsx
│   └── fields/               ONE component per field type, one registry
│       ├── TextField.jsx  TextareaField.jsx  NumberField.jsx  DateField.jsx
│       ├── SelectField.jsx  EnumListField.jsx  BoolField.jsx
│       ├── MediaField.jsx    (image | audio: URL + upload + preview)
│       └── index.js          { text: TextField, textarea: …, image: MediaField, … }
├── hooks/
│   └── useContentResource.js list/create/update/remove/toggle + optimistic rollback
├── lib/                      display.js (cell formatting) · fields.js (field helpers)
├── resources/                field configs — DATA, not components
│   ├── deities.js  temples.js  aartis.js  festivals.js  sevas.js  knowledge.js  faqs.js  hero.js
│   ├── panchang.js  announcements.js  reminders.js  tones.js  wallpaper-styles.js  settings.js
│   └── index.js
└── index.js
```

The `if (f.type === …)` ladder in the modal became a lookup in
`fields/index.js`; a new field type is one file plus one registry line. The
`*_FIELDS` constants left `App.jsx` for `resources/`.

---

## 16. Component decomposition rules (apply to every project)

### 16.1 Size budgets (soft limits — exceed only with a reason in the PR)

| Unit | Budget | If exceeded |
|---|---|---|
| Route / tab entry / controller | ~60–80 lines | It is doing a feature's job — extract the feature |
| Screen / page container | ~120 lines | Extract sub-components and hooks |
| Presentational component | ~150 lines | Extract the repeated or independently-stateful part |
| Hook / service function | ~40 lines per function | Extract named steps |
| Config / data module | no limit | It is data; keep it flat and boring |

### 16.2 When to split — any one is enough

1. **A second reason to change.** The file would change for two unrelated
   product reasons (data shape *and* card layout).
2. **A block with its own state.** An `useState` that only one JSX region uses
   belongs inside a component for that region.
3. **Repetition.** Same markup twice → extract to the feature. Three times or
   clearly generic → promote to the shared kit (§9.2).
4. **A list item.** Anything rendered inside `.map()` is its own `*Row`/`*Card`
   component.
5. **A conditional tree.** Nested ternaries / more than two `&&` branches →
   named sub-components (`Loading`, `Empty`, `Populated`).
6. **A name you had to comment.** If a region needs a heading comment to be
   understood, it wants to be a component with that name.

### 16.3 Container / presentational / hook

| Piece | Knows about | Never does |
|---|---|---|
| **Container** (`*Screen`, `*Page`) | routing/tab context, providers, which hook(s) to use | styling details, raw data shaping |
| **Hook** (`use*`) | fetching, caching, derived state, side effects, actions | return JSX, import UI |
| **Presentational component** | props, theme/tokens, kit | fetch, read providers, navigate, mutate external state |
| **`lib/` function** | its arguments | React, `window`, the network, time (pass `now` in) |

A data hook returns one stable shape: `{ data, status, error, actions }`
with `status ∈ 'loading' | 'ready' | 'error'` — so every consumer renders the
five data states of §7.5 the same way.

### 16.4 Composition over configuration

- Prefer **children and slots** to boolean-prop explosions
  (`<Modal><Modal.Header/>…</Modal>` or `header`/`footer` props, not
  `showClose showFooter footerAlign`).
- Variants are a **closed set of strings** (`variant`, `tone`, `size`) — if a
  component grows a third boolean that changes its look, it needs a variant.
- Pass **data down, events up.** Callbacks are named by what happened
  (`onSelectDay`, `onSave`), not by the effect (`setDate`).
- No prop drilling past **two** levels: lift into a hook the container passes
  or, if truly cross-cutting, a provider.

### 16.5 Where state lives (use the lowest rung that works)

1. Local `useState` in the component that owns the interaction.
2. Lifted to the nearest common parent (the container).
3. A feature hook / feature context (`useHoroscope`).
4. An app-wide provider — **only** for: auth/session, language, theme, feature
   flags, remote content, toasts. Adding to this list needs a reason.

Server state (lists the API owns) is fetched by a feature hook and
**re-fetched after writes**, not hand-synchronised in several components.

### 16.6 Files, exports, tests

- One component per file, file named for its export (`RashiCard.jsx`). A
  component with parts becomes a **folder** with its own `index` once it has
  more than one file.
- Co-locate: styles, tests and types sit beside the code they cover.
- `index` exports **only** the public surface. Deep imports into another
  feature or kit folder are a review rejection.
- Tests, by layer: `lib/` and services → unit tests (cheap, most value);
  hooks → with a thin harness; kit components → a gallery entry per variant ×
  state; features → smoke/E2E for the critical path. Existing checks are the seed: `*.test.mjs` beside the API modules (`node --test`),
  `pooja-api/scripts/smoke.mjs`, the dashboard's `scripts/check-*.mjs`, and the app's
  `src/i18n/i18n.test.mjs` and `features/alarm/lib/reminder-state.test.mjs`.
- **Comments explain why, not what**, matching the surrounding code's density
  (the codebase's long "why" docblocks are the house style — keep them on
  non-obvious decisions, not on obvious ones).

---

## 17. Cross-project contract

- **The API is the interface between all three.** The written contract is
  `docs/COINS_AND_ASTROLOGERS.md` (coins, bookings, calls, access) plus the module code itself
  — the per-module `*.types.js` the design proposed were not created. The dashboard's
  `lib/api/resources.js` and the app's `lib/api/` (`client.ts` and one file per area:
  `wallet.ts`, `calls.ts`, `bookings.ts`, …) mirror those shapes. A response-shape change
  updates all three in one PR (or is additive, §14.3). *Trade-off accepted:* no shared
  package — three small hand-kept mirrors beat a monorepo tooling migration at
  this size. Revisit if drift bites.
- **Same envelope, same errors.** Success returns the resource (or
  `{ items, … }` for lists); failure returns `{ error, code, …extra }` (`error` is the human
  string, `code` the machine value); clients map `code` to a toast/ErrorState, never to
  string-matching the message.
- **Identity and money are server-side.** Prices, fees and support contacts
  come from the API settings; identity from the verified token; clients never
  send either as trusted input.
- **Everything operators can edit has a dashboard feature, an API module and an
  app fallback.** A new editable thing is a vertical slice across §12.1's table
  — add all three columns or record the gap.
- **Config:** each project's `.env.example` lists every variable it reads;
  `config/env.js` (API) is the main reader (§14.3 lists the payment/RTC exceptions). Public (`EXPO_PUBLIC_*`,
  `VITE_*`) values are never secret.

---

## 18. Migration roadmap (strangler, not big-bang) — a record, and what remains

The migration this section planned has been carried out for the app and the dashboard and,
for the API, in its file-moving half. The rules of engagement below are still how the
codebase should keep changing; the tables record what happened; the last list is what is
honestly left.

**Rules of engagement**

1. **New code lands in the new structure immediately**, even if its neighbours
   haven't moved. A new feature is born as `features/<x>/` / `modules/<x>/`.
2. **Move PRs change no behaviour.** A PR that relocates/splits files contains
   no logic change, so the diff is reviewable and `git mv` history survives.
   Behaviour changes ride separate PRs.
3. **Move when touched, or in a scheduled pass** — whichever comes first; never
   leave a half-moved feature (a feature is either wholly in the new layout or
   not started).
4. **Green gates after every step:** app `tsc --noEmit` + `lint`; dashboard
   `npm run build` (dependency check, permission-matrix check, `vite build`); API boot +
   `pooja-api/scripts/smoke.mjs` (locally and in CI).
5. Update §4 / §10 / this section in the same PR.

**Measured starting point and where each file went** (sizes are the original line counts)

| Was | Lines | Became |
|---|---|---|
| `pooja-admin/src/client/App.jsx` | 770 | `app/*` shell + `app/tabs.js` / `tab-areas.js`; `features/overview`, `flags`; `features/content/resources/*` |
| `pooja-admin/src/client/HoroscopeBoard.jsx` | 427 | `features/horoscope/*` (§15.3) |
| `pooja-admin/src/client/ContentManager.jsx` | 330 | `features/content/*` (§15.4) |
| `pooja-api/src/models.js` | 660 | a 28-line barrel over `modules/*/<x>.model.js` (content models in `modules/content/models/`) |
| `pooja-api/src/content.js` | 372 | `modules/content` (+ `crud.factory.js`), `modules/users`, `modules/media`, `modules/public` |
| `pooja-api/src/auth.js` / `admin.js` / `operators.js` | 352 / 300 / — | `modules/auth`, `modules/operators`, `middleware/{access,require-auth}.js`, `access/*` |
| `pooja-api/src/db.js` | 282 | `db/connect.js` + `db/seed.js` + per-module seeds |
| `pooja-api/src/routes.js` / `broadcast.js` / `files.js` / `firebase.js` | — | `modules/{flags,analytics}`, `modules/announcements`, `modules/media/files.js`, `modules/auth/firebase.js` |
| `poojaappclone/.../alarm.tsx` | 817 | `features/alarm/*` |
| `(tabs)/pooja.tsx` · `(tabs)/index.tsx` · `gallery.tsx` | 706 · 557 · 519 | `features/pooja`, `home`, `gallery` |
| `context/content.tsx` · `context/language.tsx` | 609 · 572 | `providers/content/*`, `i18n/{en,hi}/*` |
| `components/auth/login-screen.tsx` | 940 | `features/auth/*` |

**Order and status**

| # | Project | Step | Status |
|---|---|---|---|
| 1 | Dashboard | `styles/tokens.css` + kit primitives (§10 steps 1–3) | **Done** |
| 2 | Dashboard | `lib/api/` split, `lib/dates.js`, `tabs.js` registry, `app/` shell | **Done** |
| 3 | Dashboard | `features/horoscope/` (§15.3) | **Done** |
| 4 | Dashboard | `features/content/` (§15.4) + field configs in `resources/` | **Done** |
| 5 | Dashboard | Remaining tabs → `features/*`; delete dead CSS | **Done** (the kit is adopted everywhere; see §10 for the markup that stays bespoke) |
| 6 | API | `config/env.js`, `server.js`/`app.js` split, `middleware/*` extracted, error envelope | **Done, except the envelope**: errors are `{ error, code, …extra }` on purpose (existing clients read `error` as a string), not the nested `{ error:{code,message} }` the design sketched |
| 7 | API | `modules/horoscope` as the pilot module with full model→schema→service→controller→routes→types→tests layering | **Not done.** `modules/horoscope` is model + resource + routes. The layering exists only in spirit, in the newer modules (service/routes/model/tests) |
| 8 | API | Per-route access declarations (`access.public/auth/admin/adminOnly`) and a central `access.js` | **Not built.** Replaced by something different: `middleware/access.js` (the `PUBLIC` allowlist) + `access/routes.js` (a path → area table) + `access/permissions.js` (roles as permission sets) — §21. Fail-closed, and `smoke.mjs` plus `access/access.test.mjs` check it |
| 9 | API | Remaining modules one at a time (flags, panchang, policies, announcements, users, operators, auth, analytics, media, content + factory, public) | **Files moved into `modules/*`; schema/controller layering and the `routers({requireAuth})` contract not applied** to the older ones |
| 10 | App | `features/` created with `festivals` and `horoscope`; `components/illustrations/` rename | **Done** |
| 11 | App | `providers/content/*` and `i18n/{en,hi}/*` splits, with the key-parity test | **Done** |
| 12 | App | Big screens, one per PR: `alarm` → `pooja` → `home` → `gallery` → rest; auth screens → `features/auth` | **Done** (26 feature folders; `src/app/` is route shims) |
| 13 | App | Kit gaps (`danger` Button, `Switch`, `Sheet`), sweep raw hex, retire `constants/theme.ts` | **Partly:** `theme.ts` retired; `Switch`/`Sheet` exist; **no `danger` Button variant**; raw-hex sweep open (~98 literals, §10) |
| 14 | All | Lint/stylelint ratchet, dependency-direction check, contrast test | **Partly:** app ESLint `no-restricted-imports` and dashboard `scripts/check-deps.mjs` enforced; `check-access.mjs` added for §21; stylelint, the colour-literal rule and the contrast test not built |
| 15 | All | Feature specs: astrologer calls & coins (§19), coins as currency (§20), access control (§21) | **Built** — see Part C and `docs/COINS_AND_ASTROLOGERS.md` |

**What remains** (the honest list; §10 has the detail)

- Schema / controller / types layering inside the API modules, and the pilot it was meant to prove.
- Per-route `access.*` declarations — or a decision to keep the two-table gate and amend §14.3.
- The nested error envelope — or a decision to keep `{ error, code }` and amend §14.3 (the code already does).
- `routers({ requireAuth })` for the older routers (mount order in `app.js` is gate-sensitive).
- App: raw-colour literals, the `danger` Button variant, folding `constants/sacred.ts` and
  `constants/color.ts` into `@/theme`, and the files over §16.1 budgets (`ui/icon-glyphs.tsx`, `ui/toast.tsx`).
- The `#Components` gallery and the colour/stylelint/contrast enforcement from §9.4.

**Dependency-direction check (step 14).** Encodes §12 rule 2 mechanically: features may not
import other features' internals (`eslint.config.js` in the app, `scripts/check-deps.mjs` in the
dashboard), and in the dashboard `ui/` and `lib/` may not import `features/` or `app/`.
*Not yet encoded:* the same shared-never-imports-a-feature rule for the app's `components/ui`,
`lib/`, `theme/`; a controller may not import a model (there are no controllers). A rule nobody
enforces is a suggestion; the ones above are CI failures.

**Definition of "migrated" for a feature:** wholly inside its folder; route/tab
is a shim; no file over budget (§16.1) without a reason; no raw colours or
bespoke buttons/pills/modals; strings in both languages; all five data states;
public surface in `index`; checklist §9.3 ticked.


---
---

# Part C — Feature specs

> **Built.** §19–§21 are implemented (API, dashboard and app). `docs/COINS_AND_ASTROLOGERS.md` is the authoritative API contract; where it and this part differ, it wins, and so does the code. Known differences from the design as first written: API errors are `{ error, code, … }` (not a nested envelope) to stay compatible with existing clients; modules expose `routers({ requireAuth })` (public / devotee / admin) and are gated by the area table in `access/routes.js` instead of per-route `access.*` declarations; modules have `model` / `service` / `routes` / `test` but no `schema` / `controller` / `types` files; owner keys are Firebase `uid` strings; **no native Razorpay or Agora SDK is installed in the app** (`features/wallet/lib/razorpay.ts` and `features/call/lib/rtc-client.ts` load them lazily and degrade to a "needs a new build" message — see `docs/PAYMENTS_SETUP.md`, `docs/CALLS_SETUP.md`); the dashboard kit (`ui/`) exists but the `#Components` gallery page does not.

## 19. Astrologer calls & coins

**Status:** built (API modules, dashboard pages, app features), except the two native SDKs
(voice, payments), which need a development build and a business account to switch on. Design
canvas: https://claude.ai/artifact/PEM4Zhpy3tUacBALPaPhSG (9 app screens, 4 dashboard pages).

A devotee taps **Talk to an Astrologer** on Home, browses astrologers, and
starts a **voice call**. They pay **in-app coins**, charged **per minute**.
Coins are bought through a recharge flow. Astrologers use the same app in an
**astrologer mode**. Operators manage astrologers, coin packs, wallets, calls
and payouts from the dashboard.

### 19.1 Decisions (settled with the product owner)

| Topic | Decision |
|---|---|
| Call type | Voice only (chat is a later phase) |
| Transport | In-app VoIP through a hosted SDK (Agora or ZegoCloud — choose at build; the server code isolates it behind `rtc.provider.js`) |
| Astrologer side | Same app, **astrologer mode** (a role on the account, switched on from the dashboard) |
| Coin purchase | Razorpay — see risks R1 and R2 |

### 19.2 Billing rules (the part that must be exactly right)

1. **Server-authoritative.** The phone never decides what a call costs, how
   long it lasted, or what a balance is. The client displays; the server charges.
2. **Per started minute, charged at the start of the minute.** Minute 1 is
   charged when the astrologer *answers* (not when the devotee taps Call).
   Minute 2 at 01:00, and so on. Ending mid-minute uses that minute. The UI
   states this before the call (Start-call sheet) and after (receipt).
3. **Minimum to start:** balance ≥ `minMinutes × rate` (default 3 minutes).
   Below that the app shows the Not-enough-coins sheet instead of calling.
4. **Auto-end at zero.** If the next minute's charge cannot be made, the server
   ends the call (`ended: out_of_coins`). A warning is pushed one minute before.
5. **Rate is snapshotted per call.** Editing an astrologer's rate affects the
   next call only.
6. **Nothing is charged** if the call is declined, unanswered, or fails to
   connect. A connect failure after the first charge is **refunded** by the
   billing job (`refund` ledger entry).
7. **No negative balances, ever.** A debit is a single conditional atomic update
   (`balance >= amount`), not read-then-write.

### 19.3 Domain model

Mongoose models (each in its own module, §14.3). **Field names below are the design's;** the
built ones key owners by Firebase `uid` (`uid`, `devoteeUid`, `astrologerUid`), store pack and
order prices as whole rupees (`price`) plus `amountPaise` on the order, and differ in small ways —
read `modules/*/*.model.js` and `docs/COINS_AND_ASTROLOGERS.md` for exact shapes:

| Model | Key fields | Notes |
|---|---|---|
| `Astrologer` | `uid` (set on first sign-in), `signInEmail` / `signInPhone` (what the operator typed; normalised), `name`, `bio`, `specialities[]`, `languages[]`, `yearsExperience`, `photoUrl`, `ratePerMin` (coins), `platformSharePct`, `listed`, `status` (`invited\|active\|suspended`), `presence` (`offline\|online\|busy`), `lastSeenAt`, `ratingAvg`/`ratingCount` (derived, hidden until real) | `presence` is soft state: stale `lastSeenAt` ⇒ treated offline |
| `Wallet` | `uid` (unique), `balance` (integer coins), `applied[]` (ids of recent folded-in transactions, so a crash cannot apply one twice) | Cached sum of the ledger; never set directly |
| `WalletTxn` | `uid`, `type` (`recharge\|bonus\|booking_debit\|chadhava_debit\|call_debit\|refund\|adjustment`), `status` (`pending\|posted\|failed`), `amount` (signed int), `balanceAfter`, `refType/refId` (`order\|call\|admin`), `idempotencyKey` (unique), `note`, `createdBy` | **Append-only ledger.** Source of truth; `Wallet.balance` must equal its sum (a nightly check job asserts it) |
| `CoinPack` | `coins` (total credited), `price` (whole ₹), `showSale`, `saleEndsAt?`, `order`, `active` | Price is read from here at payment time. Extra coins and sale % are **derived**, never stored — see §20.2 |
| `CoinOrder` | `uid`, `packId`, `coins`/`price` snapshot, `amountPaise`, `provider` (`razorpay\|mock`), `razorpayOrderId`, `razorpayPaymentId`, `status` (`created\|paid\|failed`), `walletTxnId` | Credit happens once per order (idempotent) |
| `CallSession` | `devoteeUid`, `astrologerId`/`astrologerUid`, `status`, `ratePerMinSnapshot`, `shareSnapshot`, `requestedAt`, `answeredAt`, `endedAt`, `minutesBilled`, `coinsCharged`, `nextBillAt`, `endReason`, `rtcChannel` | State machine below |
| `AstrologerEarning` | `astrologerId`, `callId`, `minute`, `coins`, `paise` (at the then-current payout rate), `at`, `voidedAt?` | One row per billed minute; sum = what is owed |
| `Payout` | `astrologerId`, `amountPaise`, `paidAt`, `reference`, `recordedBy` | Recorded manually; this system does not move bank money |
| settings (existing `Setting`) | `minMinutes`, `ringTimeoutSec`, `defaultSharePct`, `payoutPaisePerCoin`, `callsEnabled` | Edited in the dashboard; also gated by a feature flag |

### 19.4 Call state machine

```
requested ──(astrologer accepts)──▶ connected ──(end / out of coins / drop)──▶ ended
    │                                   │
    ├─(declined | ringTimeout)──▶ ended (declined|missed)      first minute charged on →connected
    └─(devotee cancels)────────▶ ended (cancelled)             next charge at nextBillAt
```

- **`POST /calls`** (devotee, `auth`): validates astrologer listed + online,
  balance ≥ minimum, devotee has no other live call → creates `requested`,
  pushes an incoming-call notification, returns `{ callId }`.
- **`POST /calls/:id/accept|decline`** (astrologer): `accept` atomically flips
  `requested → connected`, takes the first-minute debit, issues **short-lived
  RTC tokens** for exactly these two users and one channel, sets astrologer
  `presence=busy`.
- **`POST /calls/:id/end`** (either party), the admin force-end and the billing
  ticker's silent-call sweep all converge on `callService.end()`, which is
  idempotent; server timestamps are the authoritative duration and client
  timestamps are never trusted. (The design also called for voice-SDK
  "user left channel" webhooks; none is wired — the only webhook is Razorpay's.)
- **Billing ticker** (`modules/calls/billing.ticker.js`, started by `modules/index.js`
  `startModuleJobs`): every connected call stores `nextBillAt`. A sweeper
  (`setInterval` ~5 s, plus a catch-up pass at boot — the container restarts on
  every deploy) finds calls with `nextBillAt <= now`, attempts the debit, and
  either advances `nextBillAt += 60 s` or ends the call. Debits use the call id +
  minute index as the `idempotencyKey`, so a double tick or a crash mid-tick
  cannot double-charge.
- **Orphan cleanup:** the same sweeper ends calls whose heartbeat/webhook has
  gone silent beyond a grace period, and expires `requested` calls past the ring
  timeout.
- **Real-time to clients:** the app polls `GET /calls/:id` every 2–3 s while a
  call is live (balance left, seconds to next charge, status) and also receives
  a push for state changes (`modules/calls/call.push.js`). Plain HTTP polling first; a WebSocket
  channel is an optimisation, not a prerequisite.

### 19.5 Coin recharge (Razorpay)

1. App: `POST /wallet/orders { packId }` (`auth`). Server loads the pack,
   creates a Razorpay order for **its** price, stores a `CoinOrder`, returns
   `{ orderId, keyId, amount }`. **The client never sends a price.**
2. App opens Razorpay checkout (`features/wallet/lib/razorpay.ts`, which replaced the
   old dummy `razorpay-checkout.tsx`), pays. With the `mock` provider (development only —
   refused in production) the app completes the purchase with `{ mock: true }` and no money moves.
3. App: `POST /wallet/orders/:id/verify` with Razorpay's
   `payment_id + signature`. Server verifies the HMAC, then credits.
4. **Webhook** `POST /api/webhooks/razorpay` (signature-verified, `public` access
   with its own auth) credits the same order if verify never arrived (app
   killed after paying). Both paths call `creditOrder()`, which is idempotent on
   `orderId`, so a coin pack is credited exactly once.
5. Credit writes one `recharge` ledger row for the pack's full `coins` (the order
   snapshot keeps the extras for reporting) and updates the wallet in one
   transaction. The `bonus` type is for welcome/goodwill credits only.

### 19.6 Backend modules (`pooja-api/src/modules/`, §14)

```
astrologers/   astrologer.model · .service · .routes · .guard · claim.js (sign-in claim)
               public:  GET /astrologers, GET /astrologers/:id       (app; active + listed only)
               auth:    GET /astrologer/me, PUT /astrologer/me/presence, POST /astrologer/me/heartbeat,
                        GET /astrologer/me/incoming, /calls, /earnings   (astrologer role)
               admin:   GET/POST/PUT/DELETE /admin/astrologers, POST …/:id/suspend|reactivate
wallet/        wallet.model (Wallet, WalletTxn) · wallet.service (credit/debit/refund/adjust — the ONLY writers)
               auth:    GET /wallet, GET /wallet/transactions
               admin:   GET /admin/wallets, GET /admin/wallet-transactions,
                        POST /admin/wallet/adjust (reason required, audited)
coins/         coins.model (CoinPack, CoinOrder) · coins.service · coins.routes · billing-rules.routes ·
               providers.js (mock | Razorpay, plain fetch) · seed
               public:  GET /coins/packs      auth: POST /wallet/orders, /wallet/orders/:id/verify
               webhook: POST /webhooks/razorpay
               admin:   /admin/coin-packs CRUD, GET /admin/coin-orders, /admin/coin-stats,
                        GET|PUT /admin/billing/rules
bookings/      booking.model · bookings.service · bookings.routes   (§20)
chadhava/      chadhava.model (Offering, ChadhavaOrder) · chadhava.service · chadhava.routes   (§20)
calls/         call.model (CallSession) · call.service (state machine) · billing.ticker.js ·
               rtc.provider.js (token issue; Agora | mock behind one interface) · call.push.js
               auth:    POST /calls, /calls/:id/accept|decline|cancel|end|rating, GET /calls/:id
               admin:   GET /admin/calls, POST /admin/calls/:id/end (force), POST …/refund
payouts/       payout.model (AstrologerEarning, Payout) · payout.service · payout.routes
               admin:   GET /admin/payouts/summary, GET|POST /admin/payouts (record)
```

Each module's tests sit beside it (`*.test.mjs`, run in CI). Rules that keep this safe:
- **`wallet.service` is the only code that touches `Wallet`/`WalletTxn`.** Calls,
  coins, bookings, chadhava and admin adjustments all go through `credit()`, `debit()`, `refund()`.
- **Every money write has an idempotency key** (order id, `callId:minute`,
  client `requestId`, admin request id).
- **`astrologer` is a role on the *devotee* `User`** (`User.role` is `devotee | astrologer`,
  set when the sign-in claim matches an operator-added `Astrologer`) — it grants only
  the `/astrologer/me/*` endpoints. The dashboard roles (`admin | editor | viewer`, §21) live on
  `Operator` and are a different thing; `Operator ≠ User` stands (AGENTS.md §5).
- Routes are gated by area (§14.3, §21.5); `scripts/smoke.mjs` asserts the public packs +
  astrologer list answer 200, wallet/calls/bookings answer 401 without a token, every admin route
  401s, and the Razorpay webhook refuses an unsigned body.
- Feature flag `astrologerCalls` (default **on**) hides the Home card; the
  `callsEnabled` setting is the kill switch the server enforces on `POST /calls`.

### 19.6a Astrologer onboarding and sign-in

Astrologers are **added by an operator in the dashboard** — nobody becomes one by
asking. They then sign in **exactly like a devotee** (Google or mobile OTP, same
login screen) but skip the Create Profile (name / date-of-birth) page and land
directly in the astrologer view.

1. **Operator adds the astrologer** (dashboard → Astrologers → *Add astrologer*):
   display name, specialities, languages, rate, platform share, and the
   **sign-in email or mobile number** they will use. Status = `invited`. No
   password, no invite email: the identifier is the key.
2. **Astrologer signs in** with that Google account or number. Firebase verifies it
   (nothing new on the client).
3. **`POST /auth/sync` claims the invite** (`modules/auth/auth.routes.js` calls `modules/astrologers/claim.js`). The existing sync already reads the
   verified email/phone from the ID token, never the request body. After creating
   or finding the `User`, it looks for an `Astrologer` with `status` `invited` or
   `active` whose `signInEmail` / `signInPhone` equals that **verified** value
   (email lower-cased; phone in E.164). On a match it:
   - sets `Astrologer.userId`, flips `invited → active`;
   - sets `User.role = 'astrologer'` and copies the **display name** onto the
     `User` so the profile counts as complete (`needsProfile = false`);
   - returns the profile with `role: 'astrologer'` and the astrologer record.
4. **The app routes by role.** `RootGate` order is unchanged — language → login —
   but after login: `role === 'astrologer'` ⇒ astrologer shell (§19.7); otherwise
   `needsProfile` ⇒ Create Profile; otherwise the devotee tabs. The Create Profile
   page is **never shown to an astrologer**.
5. **Rules at the edges**
   - Only a **provider-verified** identifier can claim an invite. A phone-OTP user
     who merely *typed* an email (the sync accepts that, unverified) cannot claim
     an invite by email.
   - One identifier maps to one astrologer; a duplicate is rejected when saving in
     the dashboard.
   - An existing devotee who is later added keeps their account, wallet and
     history; the role is added on their next sync. Their wallet is unaffected.
   - **Suspending** an astrologer (dashboard) sets `status = suspended`, forces
     presence offline, ends nothing in flight without a prompt, and the app
     returns them to the devotee view on next sync. **Deleting** an astrologer
     removes the role the same way; call history is kept.
   - Changing the sign-in identifier unlinks the old account on its next sync
     and re-opens the invite; the dashboard shows **Invited · not signed in yet**
     until someone signs in with the new one.
   - Role is read from the server on every authenticated call (`requireAuth`
     attaches it); the app's local "switch to devotee view" is cosmetic and never
     grants or removes server permissions.
6. **Dashboard shows the state:** *Invited · not signed in yet* → *Signed in* (with
   last sign-in) → *Suspended*, plus a count tile for invited astrologers.

### 19.7 App features (`poojaappclone/src/features/`, §13)

```
features/astrologers/
├── AstrologersScreen.tsx        list screen (container)
├── components/
│   ├── AstrologerCard.tsx       avatar + presence, name, specialities, rate, call button
│   ├── AstrologerEntryCard.tsx  the entry point shown on Home
│   ├── PresenceBadge.tsx        Online / Busy / Offline (word + shape, not colour alone)
│   ├── FilterChips.tsx          All · Online now · speciality
│   ├── SearchField.tsx
│   └── StartCallSheet/          StartCallSheet · CostBreakdown · BillingNote
├── hooks/  use-astrologers.ts
├── lib/    filter.ts · max-minutes.ts                (pure)
└── index.ts

features/call/                   the live call
├── CallScreen.tsx · CallSummaryScreen.tsx
├── components/  CallTimer · LiveMeter · LowBalanceBanner · CallControls · Receipt · RatingPicker
├── hooks/  use-call-session.ts (poll) · use-start-call.ts · use-rtc.ts (SDK join/leave/mute/speaker)
└── lib/    rtc-client.ts      ← the ONLY file that imports the voice SDK
            end-reason.ts · permissions.ts · words.ts

features/wallet/
├── WalletScreen.tsx
├── components/  BalanceCard · PackGrid · PackCard · AddCoinsSheet · ShortfallPicks · PayButton ·
│                TestModeBanner · TransactionList · TransactionRow · WalletChip
├── hooks/  use-coin-packs.ts · use-recharge.ts (order → checkout → verify) · use-transactions.ts
└── lib/    razorpay.ts       ← the ONLY file that imports the payment SDK
            packs.ts · transactions.ts

features/astrologer-mode/        simple, astrologer-only experience (see below)
├── AstrologerShell.tsx · AstrologerHomeScreen.tsx   online switch · earnings hero · today's numbers · recent calls
├── CallLogScreen.tsx            full call history (date, devotee, minutes, earned)
├── EarningsScreen.tsx           month/week totals, paid out vs due, payout history
├── AstrologerProfileScreen.tsx · IncomingCallScreen.tsx
├── components/  AvailabilityCard · EarningsHero · TodayStats · CallLogRow · PayoutRow · IncomingActions
├── hooks/  use-presence.ts (online toggle + heartbeat) · use-incoming-call.ts · use-astrologer-earnings.ts ·
│           use-my-calls.ts · use-app-active.ts
└── lib/    money.ts
```

**Astrologer mode is a separate, minimal shell, not the devotee app with an extra
tab.** When the signed-in account has the astrologer role, `RootGate`
(`app/_layout.tsx`) renders `AstrologerShell` — a 4-tab bar, **Home · Calls · Earnings ·
Profile**, in the `app/(astrologer)/` route group — and hides Pooja, Temples,
Bhajan and every other devotee feature. Home shows availability, earnings and
recent calls; there is nothing else to learn. A "Switch to devotee view" entry in Profile
lets the same person use the app as a devotee; that choice is local, and the role
itself is granted only from the dashboard.

- **Routes:** `app/astrologers.tsx`, `app/call/[id].tsx`, `app/call/summary/[id].tsx`,
  `app/wallet.tsx`, `app/incoming-call.tsx`, plus the `app/(astrologer)/` group
  (`astro-home`, `astro-calls`, `astro-earnings`, `astro-profile`) — each a one-line shim (§13.2).
- **Providers:** `providers/wallet` (`WalletProvider`, `useWallet()`) holds the live balance (used by
  the Home chip, the list, the call screen); refreshed after every call/recharge and on app focus.
- **Kit additions** (§4, built first): `Sheet` (bottom sheet), `Switch`, `Avatar`
  (initials fallback, presence), `ProgressBar`, `Coins`/`CoinDisc`, `BillRow`. All reusable
  beyond this feature. (The design also listed an app `ConfirmDialog`; the app still uses
  `Alert.alert` for real choices.)
- **Strings:** `i18n/{en,hi}/astrologer.ts` and `coins.ts` (call and wallet strings live there).
- **Money display:** `formatCoins()` / `formatRupees()` in `lib/format.ts`, plus
  `features/astrologer-mode/lib/money.ts` for paise; no screen formats numbers itself.

### 19.8 Dashboard features (`pooja-admin/src/client/features/`, §15)

```
features/astrologers/   AstrologersPage · components/(AstrologerTable · AstrologerRow · AstrologerFilters ·
                        AstrologerViewModal · PresenceBadge · LiveStrip · Avatar ·
                        AstrologerModal/(AstrologerForm · PricingFieldset))
                        hooks/useAstrologers · lib/(earnings-preview · presence · contact · form).js
features/coins/         CoinsPage · components/(StatCards · PackTable · PackRow · PackViewModal ·
                        PackModal/(PackForm · PackPreview · WorkedOutPanel) · TransactionTable ·
                        TxnTypeBadge · AdjustWalletForm · WalletPicker)
                        hooks/(useCoins · useTransactions · useWalletSearch) · lib/(coin-pack · packs).js
features/calls/         CallsPage · components/(LiveCallBanner · CallTable · CallRow · CallFilters ·
                        CallDetailModal/(ChargeBreakdown · RefundForm) · PayoutsPanel · PayoutRow ·
                        MarkPaidModal · BillingRulesForm · BillingRulesView · OutcomeBadge)
                        hooks/(useCalls · usePayouts) · lib/(charges · outcome · rules).js
features/bookings/      BookingsPage · BookingTable · ChadhavaTable      (the paid-in-coins orders, §20.6)
features/coin-orders/   CoinOrdersPage · OrderTable                      (coin purchases)
features/offerings/     OfferingsPage                                    (chadhava catalogue)
```

The tab registry (`app/tab-areas.js`) gives these a **group**, *Astrologer calls* →
Astrologers · Coins & Wallets · Calls & Payouts. Each tab is shown by **area**, not by a blanket
role: an **editor** or **viewer** sees them read-only (money, wallets, orders and calls masked, §21), and
writes — wallet adjustment, payout, rate and billing-rule changes — need `money:edit`,
`wallets:edit`, `payouts:edit` and so on, which only an admin holds. Destructive/financial
actions use `ConfirmDialog` (never `confirm()`), and every adjustment/payout shows who did it.

### 19.9 Sequencing (history — each was a shippable PR set; all done)

1. **Kit & foundations:** dashboard tokens + kit pieces (§10 steps 1–3); app kit
   `Sheet`/`Switch`/`Avatar`; `config/env.js` entries for provider + Razorpay keys.
2. **Wallet + ledger (API)** with tests — the riskiest code, so first: atomic
   debit, idempotency, balance==sum(ledger) check (`wallet.service.verifyWallet`, `reconcilePending`).
3. **Coins + Razorpay adapter** (replaced the dummy checkout), packs CRUD in the
   dashboard, wallet screen in the app. *Native SDK still to be installed.*
4. **Astrologers module + list screen + dashboard CRUD**; presence; flag.
5. **Calls**: session state machine, RTC tokens, billing ticker; start-call sheet, call
   screen, summary. Needs the voice SDK build and a two-device test (`docs/CALLS_SETUP.md`).
6. **Astrologer mode**: role linking, presence heartbeat, incoming-call screen +
   push, earnings.
7. **Payouts, call log, billing-rules settings, reports.**
8. Hardening: reconciliation job, orphan-call cleanup (in the billing ticker); load/soak and
   abuse limits **not done**.

### 19.10 Risks and open items

| # | Risk | Mitigation / decision needed |
|---|---|---|
| **R1** | **Store policy.** Google Play requires Google Play Billing for in-app digital currency; paying with Razorpay for coins may get the app rejected or removed. | **Open.** Decide before launch: check current Play policy for India (including alternative-billing programmes) and, if needed, switch the recharge provider. The wallet/coins modules are provider-agnostic (`coins/providers.js`) so only the purchase adapter changes. |
| **R2** | **Real payments need an account and a native SDK.** *Code resolved:* the dummy checkout is gone; the API has a `mock` provider (refused in production) and a real Razorpay adapter, and the app has `features/wallet/lib/razorpay.ts`. *Still open:* `react-native-razorpay` is not installed (needs a development build), and a Razorpay business account (KYC), keys and webhook secret are needed. | Follow `docs/PAYMENTS_SETUP.md`. Needs the business account. |
| R3 | **Incoming calls on a locked/background Android phone** need a high-priority push plus full-screen-intent / foreground service handling — beyond what `expo-notifications` does by default, and the reason many apps ship a separate astrologer app. Same-app mode is workable if astrologers keep the app open, but background reliability is the weak spot. | **Open; not device-verified.** `IncomingCallScreen` and `call.push.js` exist; a native module is likely if reliability is poor (the repo already has local Expo modules). If not, fall back to a dedicated astrologer app later. |
| R4 | Voice SDK cost and region (per-minute RTC pricing; India latency). | Agora is the implemented provider (`rtc.provider.js`, `agora-token`); confirm price + India points of presence. |
| R5 | Astrologer authenticity and conduct (identity verification, content, complaints). Because operators add astrologers by hand, vetting happens before the invite (a business step, not a code path). A report/complaint path is still needed. | Business process: vet before adding. Add "Report" to the Summary screen + a dashboard queue later (not built). |
| R6 | Coin refund/expiry policy and tax/GST treatment of coins. | Business/legal. The design shows placeholder text ("coins never expire…") — **confirm or change** before launch. |
| R7 | Render deploys restart the container; billing is timer-driven. | **Resolved in code:** persisted `nextBillAt` + boot-time catch-up (19.4) — no in-memory-only timers. |
| R8 | Backward compatibility: installed apps can't be force-updated. | All endpoints additive (§14.3); the app hides the feature when `GET /flags` or `/coins/packs` is unavailable. |

### 19.11 Not in scope (yet)

Chat and video; bookmarks/favourites and "notify me when online"; free first
call and promo codes; scheduled consultations; automatic bank payouts;
astrologer-set rates; multi-language call matching beyond the language filter.


---

## 20. Coins as the only in-app currency (payments overhaul)

**Status:** built (API, dashboard, app). Exact endpoint shapes are in `docs/COINS_AND_ASTROLOGERS.md`, which wins over this section. Same canvas as §19 (new/changed boards: Wallet,
Not-enough-coins, Booking checkout, Booking short on coins, e-Chadhava, Booking
confirmed, Dashboard Coin packs, Edit coin pack).

**Rule:** inside the app a devotee pays **only in coins**. Razorpay appears in
exactly one place — buying coins. Pooja/seva booking, e-Chadhava offerings, the
prasad delivery fee and astrologer calls all spend coins. **1 coin = ₹1** is the
base value; packs can give more coins than rupees paid.

### 20.1 What was wrong (found in the code) — and where it stands

The audit that motivated this section, all of it now resolved in code:

- **Payments were a dummy.** `components/payment/razorpay-checkout.tsx` was a
  look-alike sheet with no gateway or keys; after its fake "success" the app itself
  created the booking, and nothing on the server verified a payment. *Now:* the
  component is deleted; `POST /bookings` debits the wallet server-side; real money enters
  only through `features/wallet` → `POST /wallet/orders` + `/verify` + the Razorpay webhook.
- **Payment analytics was a client-side claim, not a charge** (the app posted
  `logPayment({amount, method, status})`). *Now:* the call and its ingest route are removed;
  the dashboard's record of real money is the **coin orders** list (`features/coin-orders`,
  `GET /admin/coin-orders`) and the coin stats cards.
- **e-Chadhava had no server record.** Offering prices (flowers 11, prasad 5, vastram 10) and the
  service fee (5) were hardcoded in `chadhava.tsx`. *Now:* the `Offering` catalogue and
  `ChadhavaOrder` live in `modules/chadhava`, seeded from those values; the fee and minimum are
  settings.
- **The prasad delivery fee** was an admin setting (`prasadDelivery`) with a bundled fallback and
  sevas carried an admin-set `price` in ₹; both are now read **as coins** by the server.

### 20.2 Coin packs and the automatic sale %

An operator defines each pack with **two numbers: coins and price** (e.g. 30 coins
for ₹20). Everything else is computed, so it can never disagree with them:

```
baseCoins = price × coinsPerRupee            coinsPerRupee = 1 (a Setting; default 1)
extraCoins = coins − baseCoins               (≤ 0 ⇒ no sale)
salePct    = round(extraCoins ÷ baseCoins × 100)         ← the label shown: "50% EXTRA"
costPerCoin = price ÷ coins ; discountPct = 1 − costPerCoin   (dashboard only: "33% cheaper")
```

Example: 30 coins for ₹20 → base 20, extra 10, **50% EXTRA** (each coin costs ₹0.67,
33% cheaper). Rules:
- The label shows when `showSale` is on **and** `extraCoins > 0` **and** the optional
  `saleEndsAt` has not passed. After the end date the pack stays on sale for coins
  but the label disappears; no operator action is needed.
- Validation on save: `coins` and `price` must be positive integers; if
  `coins < baseCoins` the save is blocked (we do not sell coins at a premium).
  A sale under 1% is not labelled.
- The same function (`lib/coin-pack.js`, a pure module) is used by the API when
  serving packs **and** by the dashboard form for its live preview, so the preview
  can never differ from what devotees see. The app receives `{coins, price,
  extraCoins, salePct, onSale}` and only formats it.
- Razorpay charges the **price**; the wallet is credited the pack's **coins** — both
  read from the `CoinOrder` snapshot taken when the order was created, so editing a
  pack mid-payment cannot change what that payment buys.

### 20.3 Spending coins — server-authoritative

Every spend is one server call that **prices, debits and records in a single
transaction**; the phone sends *what* it wants, never *how much*.

| Spend | Call | Server work |
|---|---|---|
| Book a seva | `POST /bookings` `{sevaSlug, templeSlug, date, devoteeName, gotra, prasad, requestId}` (final shape: contract doc §2) | Price = `seva.price` (+ `prasadFee` if prasad) **from the database**; `wallet.debit(total, key=requestId)`; create `Booking` with `coinsPaid`, `walletTxnId`, and the price snapshot |
| Cancel a booking | `DELETE /bookings/:id` | If before the cancellation cut-off (Setting `bookingCancelHours`, default: until the seva date) → `wallet.refund(coinsPaid)`; else cancel without refund, and say so before confirming |
| e-Chadhava | `POST /chadhava` `{templeSlug, amount, items[], requestId}` | Amount ≥ minimum; item prices from the **Offering catalogue** (below); service fee from Setting `chadhavaServiceFee`; debit; create `ChadhavaOrder` |
| Astrologer call | §19 | Per-minute debits |

- **Idempotency:** `requestId` is a UUID the app generates per confirm tap. A retry
  after a dropped connection returns the original result and never double-charges.
- **Insufficient balance** returns `402 { code: "insufficient_coins", needed,
  balance, shortfall }`. The app opens the **Add coins** sheet (suggesting the
  smallest pack that covers the shortfall, and the best-value pack), and after
  payment returns to the same checkout.
- **Everything is a `WalletTxn`** (`booking_debit`, `chadhava_debit`, `call_debit`,
  `refund`, …) with `refType/refId`, so the wallet history, receipts and the
  dashboard all read one ledger.
- **New catalogue:** `Offering` (admin-managed: name, nameHi, coins, order,
  enabled) replaces the hardcoded flowers/prasad/vastram list. Seeded from today's
  values so a fresh database matches the bundle (AGENTS.md §5 pattern).
- **Prices are coins.** `Seva.price`, the prasad fee, offering prices and the service
  fee keep their numbers (1 coin = ₹1, so nothing changes numerically) but are
  *labelled and stored as coins*; the dashboard fields read "Price (coins)".

### 20.4 App changes (`poojaappclone/`)

- **Deleted:** `components/payment/razorpay-checkout.tsx` and every client-side payment-log
  call in booking/chadhava. The Razorpay SDK is imported **only** in
  `features/wallet/lib/razorpay.ts` (§19.7) — and is not yet installed in the app.
- **Price display (decided):** coins only on spend screens — a coin icon plus the
  number ("251"), never "₹251" — and rupees only on coin-purchase screens. One
  `<Coins value={…}/>` component and `formatCoins()` render every amount, so the
  icon and number format are never retyped. Strings: add `coins`, `balance`,
  `extra`, `x_percent_extra`, `add_coins`, `insufficient_coins` etc. to **both**
  `en` and `hi` (`i18n/{en,hi}/coins.ts`).
- **Booking** (`features/booking/`): `BookingScreen` (summary, prasad switch, bill in
  coins, balance-after, confirm), `BookingBill`, `PrasadOption`, `use-checkout.ts`
  (confirm → handle `insufficient_coins` → resume), `BookedScreen` (receipt);
  `my-poojas` lists and cancels. **e-Chadhava** (`features/chadhava/`): `ChadhavaScreen`,
  `AmountPicker`, `OfferingList`, `ChadhavaBill`, `use-chadhava.ts`, `use-offerings.ts`.
- **Shared:** `providers/wallet` exposes `useWallet()`; `features/wallet` exposes
  `<WalletChip/>` and the `AddCoinsSheet` (with `ShortfallPicks`, which pre-selects the
  smallest pack that covers a shortfall) — booking, chadhava and calls all use the same
  sheet, so "not enough coins" looks and behaves identically.
- **Flag `payments`** is renamed in the dashboard to **Coin purchases** ("Razorpay
  checkout" ⇒ buying coins). Spending coins on bookings is never blocked by a
  payments outage; only *buying* is. The offline rule (flags default on) still
  applies, but a spend needs the server, so spend buttons show a clear "connect to
  the internet" state rather than failing silently.

### 20.5 API changes (`pooja-api/`)

- **Modules:** `bookings` (create/cancel charge the wallet), `chadhava` (the
  `Offering` catalogue **and** `ChadhavaOrder` — it is not a resource inside `content`),
  `coins` and `wallet` (§19). Real money lives in `CoinOrder`, real balances in
  `Wallet/WalletTxn`; the old client-reported payment analytics is retired.
- **`bookings.service`** calls `wallet.service.debit()` first, then creates the booking, and
  **refunds** if the booking write fails (the compensating-refund option — no multi-document
  transaction, so it works on a standalone Mongo).
- **Closing the old hole:** `POST /bookings` is `auth` access and ignores any
  client-sent price; the old `price`/`totalAmount` body fields are removed, not
  tolerated (older builds are not supported, §20.7).
- **Settings** (dashboard-editable): `coinsPerRupee`, `chadhavaServiceFee`,
  `chadhavaMinAmount`, `prasadDelivery` (existing, now coins),
  `bookingCancelHours`.
- **Tests:** `scripts/smoke.mjs` asserts unauthenticated `POST /bookings` → 401 and
  `GET /coins/packs` → 200; the zero-balance → 402 and same-`requestId`-twice → one debit cases
  are covered by `modules/bookings/bookings.test.mjs` and `modules/wallet/wallet.test.mjs`.

### 20.6 Dashboard changes (`pooja-admin/`)

- **Coins & Wallets → Coin packs:** table columns Coins · Price · Extra coins ·
  **Sale label (auto)** · Sale ends · Sold · Active; **Edit pack** modal with the two
  inputs, a "Worked out for you" panel (normal-rate coins, extra coins, sale %,
  cost per coin), a *Show as a sale* switch, optional end date and an app-preview
  card. Built on `features/coins/` (§19.8) with `PackForm` calling its copy of the shared
  `coin-pack` function (`features/coins/lib/coin-pack.js`, kept identical to the API's
  `src/lib/coin-pack.js` by `coin-pack.test.mjs` in CI) for the live preview.
- **Sevas / Chadhava offerings / Settings** forms relabel prices as **coins**; an
  **Offerings** tab (`features/offerings`) is the catalogue CRUD.
- **Bookings** (`features/bookings`) show the coins paid and, on cancel, the refund outcome,
  with a table for chadhava orders; the wallet transactions list filters by type
  (booking, chadhava, call, recharge, refund, adjustment).
- **Reports:** `GET /admin/coin-stats` feeds the coins page's `StatCards` — coin sales (₹ in),
  coins spent by use (booking / chadhava / calls), unspent coins (a liability to track); the
  **Coin Orders** tab (`features/coin-orders`) lists every purchase attempt.

### 20.7 Migration and rollout

Decided: **older app builds do not matter.** There is no deprecation window and no
dual path — the old booking and checkout behaviour is removed outright.

1. **Build the backend:** wallet, packs, spend endpoints, offerings, settings.
2. **Seed** packs, offerings and settings. No price conversion is needed (1:1).
3. **Cut over in one release.** `POST /bookings` stops accepting a client-sent price
   and charges coins; the old client-reported payment logging is deleted from the app
   and its ingest route is retired. Builds that predate the change simply stop being
   able to book or pay until updated; that is accepted.
4. **Delete** the dummy checkout in the same change. *(Done.)*
5. **Existing bookings** keep their stored price; they have no `walletTxnId`.

This is a deliberate, one-off exception to the additive-API rule in §14.3 (which
exists because installed apps cannot be force-updated). It does not change that
rule for later work.

### 20.8 Risks and decisions for you

| # | Item | Note |
|---|---|---|
| C1 | **Google Play billing policy** (R1 in §19.10 applies to *all* spending now) | **Open.** With coins as the only currency, nearly all in-app commerce depends on the coin-purchase route. The purchase flow is built; resolve R1 before launch. |
| C2 | **Refund policy on cancellation** | Built as designed: full refund until the seva date (`bookingCancelHours` = 0). Confirm, or set a cut-off (e.g. 24) in the dashboard. |
| C3 | **Coin expiry / cash-out** | Designed text says coins do not expire and are not refundable as cash. Confirm with legal; changes the receipt and terms copy. |
| C4 | **GST / accounting for coins** | Prepaid-instrument treatment varies; get advice. The ledger already records everything needed for reports. |
| C5 | **Prasad delivery is a physical shipment paid in coins** | Fine functionally; confirm the temple/courier settlement happens outside the app. |
| C6 | **Rate change later** (`coinsPerRupee` ≠ 1) | Only affects *new* pack sale labels; existing packs and balances are unaffected. Prices stay in coins. |


---

## 21. Dashboard access control (roles and permissions)

**Status:** implemented. API: `pooja-api/src/access/{permissions,routes,redact,settings-guard}.js`, the gate in `middleware/access.js`, matrix tests in `access/access.test.mjs` and `security.test.mjs`. Dashboard: `src/client/lib/access/` (`useAccess`, `<Can>`, `visibleTabs`), `app/tab-areas.js`, and the permission-matrix check `scripts/check-access.mjs`, run by `npm run build`.

The dashboard serves three kinds of operator. What a person may **see** and what they may
**change** are decided on the server and reflected — never invented — by the dashboard.

### 21.1 Roles (decided)

| Role | Meaning |
|---|---|
| **admin** | Sees and edits everything, including operators and roles. |
| **editor** | Edits **content** (§21.3). Everywhere else they can look but not touch. |
| **viewer** | Read-only. Opens screens, changes nothing. |

**Custom roles (microservices stack only, docs/ROLES.md):** the three above are built-in presets; an admin can define more
(`roles` area). `Operator.role` is a role *key*; identity resolves key → permissions from the store (built-ins from code) and the
admin BFF caches that for a few seconds. `releases`, `approvals`, `audit` and `roles` exist only in `backend/` (pooja-api never gets them;
`access-parity.test.mjs` exempts them). `audit` and `roles` are admin-only presets, like `operators`.

### 21.2 Permissions

A permission is `<area>:<level>` where level is `view` or `edit`. **`edit` implies `view`.**
Roles are *sets of permissions*, defined **once**, in `pooja-api/src/access/permissions.js`:

```
ROLE_PERMISSIONS = {
  admin:  all permissions
  editor: every  <area>:view   except  operators  devotees(PII)  push
          +  content:edit  horoscope:edit  panchang:edit  announcements:edit
  viewer: every  <area>:view   except  operators  devotees(PII)  push
}
```

The dashboard does **not** keep its own copy. `GET /api/admin/session` returns
`{ role, permissions: ["content:edit", "money:view", …] }` and the UI derives everything
from that list, so changing a role is a one-file server change and the UI cannot drift.

### 21.3 Areas and who may do what

| Area | What it covers | admin | editor | viewer |
|---|---|---|---|---|
| `overview` | Overview, visitors, analytics | edit | view | view |
| `content` | Deities, temples, aartis, festivals, sevas, knowledge, FAQs, home slides, offerings, reminders, tones, wallpapers, settings (non-money) | edit | **edit** | view |
| `horoscope`, `panchang` | Daily readings, panchang overrides | edit | **edit** | view |
| `announcements` | Create/edit announcements | edit | **edit** | view |
| `push` | Sending an announcement to every device | edit | — | — |
| `flags` | Feature flags | edit | view | view |
| `policies` | Terms/rules devotees accept | edit | view | view |
| `devotees` | Devotee accounts: list, block, delete | edit | — | — |
| `astrologers` | Astrologer records, rates, shares, presence, suspend | edit | view | view |
| `money` | Coin packs, billing rules | edit | view | view |
| `wallets` | Wallet lookup, transactions, adjustments | edit | view *(masked)* | view *(masked)* |
| `orders` | Coin orders, bookings, chadhava orders | edit | view *(masked)* | view *(masked)* |
| `calls` | Call log, live calls, force-end, goodwill refund | edit | view *(masked)* | view *(masked)* |
| `payouts` | Earnings summaries, recording a payout | edit | view | view |
| `events` | Events, event types, badges, participants (docs/EVENTS.md) | edit | **edit** | view *(masked)* |
| `operators` | Dashboard accounts, which role each holds, passwords | edit | — | — |
| `releases` | App releases, the version policy (minimum / recommended / blocked builds, OS floor, maintenance), adoption by build (docs/RELEASES.md; microservices stack only) | edit | view | view |
| `approvals` | The second-person approval queue for risky version changes; the on/off switch | edit | view | view |
| `audit` | The audit log with before/after (docs/RELEASES.md §5) | view | — | — |
| `roles` | Creating custom roles and choosing per-area view/edit (docs/ROLES.md) | edit | — | — |

"—" means the area is **absent**: no sidebar entry, and the API answers 403. Only
**operators** is wholly admin-only for visibility, as decided; devotee accounts and the push
send are also withheld from editor and viewer because they expose personal data or reach every
device. If that should be relaxed, change the table and nothing else.

### 21.4 Personal data is masked, not just hidden

Roles without `devotees:edit` never receive devotee **name, phone, email** or the astrologers'
**sign-in identifier**. Server responses are *redacted at the serializer*, not in the browser:
a devotee appears as a stable pseudonym (`Devotee ••4821`, from the last digits of a hash of the
uid) so a viewer can still follow a story across the call log, wallet and booking screens.
Wallet **search by name/phone** is `devotees`-gated, because a search by PII leaks PII.
A masked value is never sent and then hidden with CSS.

### 21.5 Server enforcement (the gate)

1. **One table maps every API path to an area** (`access/routes.js`): `{ method-class, path
   pattern, area }`. `GET/HEAD` need `<area>:view`; `POST/PUT/PATCH/DELETE` need `<area>:edit`.
   Special actions get their own area (`push`).
2. **Fail closed.** A path with no entry is `operators`-grade (admin only). This table replaced
   the old hand-kept `ADMIN_ONLY` denylist; the `PUBLIC` allowlist of app endpoints stays in
   `middleware/access.js`. A new route is therefore private until someone names its area.
   `access/access.test.mjs` asserts that every area has a representative route that resolves to
   it and that an unmapped path is admin-only. *(A check that **every registered `/api/admin`
   route has an entry** was planned and is not built.)*
3. The gate attaches `req.operator = { id, username, role, permissions }` and `req.can(perm)`;
   services never read the role — route handlers pass what the service needs, and masking
   (`access/redact.js`) is applied to the response object, in one place per resource.
4. A role change takes effect on the **next request** (the session carries the operator id; the
   role and permissions are read from the record every call, as `requireAdmin` already does).
5. Refusals are `403 { error, code: "forbidden", needs: "money:edit" }` so the UI can say what
   was missing. Unauthenticated stays `401`.
6. **Defence in depth for money:** the money endpoints still validate their own invariants
   (idempotency keys, positive amounts, `reason` required on adjustments). Permission says who
   may *attempt* an action, not that the action is valid.
7. Audit: every write by an operator records `{ operator, role, area, action, targetId, at }`
   (append-only audit log: `modules/operators/audit.js` + `audit.model.js`, written by the
   `auditWrites` middleware; the Operators screen shows it via `AuditLog.jsx`). Operator sign-in
   is rate-limited (`modules/operators/login-limiter.js`). Money adjustments and payouts
   already record `createdBy`/`recordedBy`.

### 21.6 Dashboard behaviour

The UI never decides permissions; it reads the list from the session and renders accordingly.

- **One hook:** `useAccess()` → `{ role, can(perm), canView(area), canEdit(area) }`, provided by
  the session provider. **One component:** `<Can edit="money">…</Can>` for inline gating.
  No component compares `role === 'admin'`; it asks `can(...)`.
- **Sidebar** is built from the tab registry (`app/tabs.js`, areas in `app/tab-areas.js`) filtered by
  `canView(tab.area)` (`visibleTabs` in `lib/access/permissions.js`).
  A tab whose area is hidden does not appear, and a stale `#Hash` to it falls back to the first
  visible tab (existing behaviour).
- **Decided: hide actions, show read-only forms.** Without `edit`: Add / Edit / Delete / row
  actions / bulk actions are **not rendered**; on/off **Switches render as plain status text**
  ("On"/"Off") instead of controls; opening a row shows its details in a **read-only modal**
  (values as text, a "View only" note, a single Close button), and the table header shows a
  small "View only" `Badge`. A page whose only content is an action (e.g. "Adjust a wallet")
  is omitted entirely.
- Every kit component that mutates takes its permission from context rather than a prop soup:
  `ContentManager` takes the tab's `area` (handed down by the registry) and derives its read-only
  mode from `canEdit(area)`, implementing the behaviour above once (`ViewModal`, `ViewOnlyModal`,
  `StatusText`); feature pages pass nothing extra.
- Masked fields display as returned (`Devotee ••4821`); the UI never tries to reconstruct them.
- The UI tolerates a `403` from an action it should not have offered (stale session after a role
  change): show a toast "You don't have permission for that", refetch the session, re-render.
- Accessibility: read-only content is real text (not disabled inputs), so it is readable by
  screen readers and selectable/copyable.

### 21.7 Testing and definition of done

- **Matrix test (API):** `pooja-api/src/access/access.test.mjs` — for every `(role × area × {view, edit})` call one representative route
  and assert 200/403 against the table in §21.3 — generated from `ROLE_PERMISSIONS`, so the
  table and the code cannot disagree.
- **Masking test:** as `editor` and `viewer`, no response from `wallets`, `orders`, `calls`,
  `astrologers` contains a real devotee name/phone/email or astrologer sign-in identifier;
  as `admin` it does.
- **Smoke:** `pooja-api/scripts/smoke.mjs` signs in one operator per role (built).
- **Dashboard:** `pooja-admin/scripts/check-access.mjs` asserts which tabs each role sees and
  which are read-only, and that no component compares a role name; `vite build` stays green.
- A new area, route or screen is not done until it appears in §21.3, `ROLE_PERMISSIONS`, the
  route→area table and the sidebar registry.

### 21.8 Assumptions to confirm

These were not explicitly decided; the table above encodes them as defaults:
1. **Editors can only view money, flags, policies and astrologers** (previously they could not
   even see them). They keep full edit rights on content, horoscope, panchang and announcements.
2. **Sending a push notification** is admin-only (it reaches every device).
3. **Devotee accounts** are withheld entirely from editor and viewer (personal data), not
   shown masked.
4. **Astrologers' sign-in email/phone** are masked for editor and viewer.
5. **Analytics and visitors** (no personal data) are viewable by editor and viewer.
