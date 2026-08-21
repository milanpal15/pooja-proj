# Pooja App — how it's built

A Sri Mandir–style devotional app: a scrolling deity strip that swaps the murti in
a temple sanctum, and a gesture-driven aarti where you carry a thali in circles
around the idol.

Everything visual is drawn with plain React Native `View`s — there are **no image
assets for the deities, temple, bells, flowers or flame**. That was a deliberate
constraint so the app runs with zero art dependencies; see
[Replacing the procedural art](#replacing-the-procedural-art) for how to swap in
real artwork.

---

## Packages

**No animation or UI libraries were added.** Everything below except ESLint
shipped with `create-expo-app`. The two that do the real work — Reanimated and
Gesture Handler — were already in the template.

| Package | Version | What it does here |
| --- | --- | --- |
| `expo` | ~57.0.8 | SDK / build tooling |
| `expo-router` | ~57.0.8 | File-based routing; `src/app/*.tsx` → routes |
| `react-native` | 0.86.0 | Core primitives — every shape is a `View` |
| `react` | 19.2.3 | React Compiler is enabled (see `app.json`) |
| `react-native-reanimated` | 4.5.0 | **All animation.** Shared values, `useAnimatedStyle`, `useDerivedValue`, `useAnimatedReaction`, springs/timings |
| `react-native-worklets` | 0.10.0 | Reanimated 4's worklet runtime (peer dep, not imported directly) |
| `react-native-gesture-handler` | ~2.32.0 | The thali drag (`Gesture.Pan`) and the map camera (`Pan` + `Pinch`) |
| `react-native-safe-area-context` | ~5.7.0 | Notch insets |
| `react-native-screens` | ~4.26.0 | Native screen backing for the router |
| `expo-image` | ~57.0.1 | Used by template screens only |
| `expo-splash-screen`, `expo-symbols` | ~57.0.x | Template chrome |

Dev: `typescript ~6.0.3`, `eslint ^9`, `eslint-config-expo ~57`.

> `eslint` / `eslint-config-expo` were added by `npx expo lint` on first run, not
> chosen manually.

### Why Reanimated rather than `Animated`

Every frame of the aarti runs on the UI thread. The thali's position is derived
from an angle that a gesture callback mutates, and the idol's halo brightness is
derived from the same accumulated rotation. Doing that through the JS bridge
would drop frames on every drag. Reanimated worklets keep it at 60fps and let
the gesture handler write shared values directly.

**Skia was not needed.** The original plan considered `@shopify/react-native-skia`
for a game-like isometric scene, but once this became an app rather than a game,
plain `View`s + Reanimated transforms were sufficient and far lighter.

---

## File map

```
src/
├─ app/                          # expo-router routes
│  ├─ _layout.tsx                # GestureHandlerRootView + ThemeProvider + tabs
│  ├─ index.tsx                  # template home screen (untouched)
│  ├─ explore.tsx                # template (untouched)
│  ├─ pooja.tsx        (503 ln)  # ★ the mandir screen
│  └─ temples.tsx      (353 ln)  # pilgrimage map with pan/pinch camera
│
├─ components/
│  ├─ mandir/                    # ★ the mandir screen's parts
│  │  ├─ deity-idol.tsx  (343)   # procedural murti, per-deity attributes
│  │  ├─ temple-scene.tsx(245)   # backdrop + pillars, toran arch, hanging bells
│  │  ├─ deity-strip.tsx (132)   # the horizontal selector
│  │  └─ marigold.tsx    (122)   # marigold bloom + falling rain
│  │
│  ├─ pooja/
│  │  ├─ flame.tsx       (131)   # diya flame + fake radial Glow (shared widely)
│  │  └─ temple-glyph.tsx(102)   # stepped gopuram, used on the map
│  │
│  ├─ app-tabs.tsx / app-tabs.web.tsx   # tab bars (native / web)
│  └─ …template components
│
└─ constants/
   ├─ deities.ts       (165)     # ★ the 8 deities + panchang line
   ├─ temples.ts       (114)     # 5 temples + map coordinates
   ├─ color.ts                   # mixHex(), for faking gradients
   └─ theme.ts                   # template colors + tab insets
```

---

## The mandir screen (`src/app/pooja.tsx`)

### Layout

Gold app bar → `DeityStrip` → sanctum (`flex: 1`, measured via `onLayout`).
Inside the sanctum, stacked back to front:

1. `TempleBackdrop` — gradient bands, stone pillars, centre glow
2. Scenery layer, `pointerEvents="none"` — marigold rain, murti, panchang banner
3. The thali — the **only** interactive element in the scene
4. `Toran` + two `HangingBell`s (tappable)
5. Ritual rail (left), music button (right), progress pill (bottom)

The sanctum's measured size drives the orbit geometry:

```ts
const cx = stage.w / 2;                          // orbit centre
const cy = stage.h * 0.44;
const rRest = Math.min(stage.w, stage.h) * 0.34; // resting radius
```

### Deity swapping

`DeityStrip` is a horizontal `ScrollView` of pills. Tapping one calls
`selectDeity`, which sets state and resets the aarti. A `swap` shared value
drives a 420ms fade+scale so the murti cross-fades rather than popping:

```ts
useEffect(() => {
  swap.value = 0;
  swap.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
}, [deity.id, swap]);
```

The title pill, sacred mark, halo colour, offerings and mantra all read from the
same `Deity` object, so they re-theme together.

### The aarti — how progress is counted

This is the fiddliest part. `turned` (total radians carried) is the **single
source of truth**; everything else derives from it.

```ts
const progress = useDerivedValue(() => turned.value / TOTAL);   // 0..1
const angle = useDerivedValue(() =>                             // where to draw
  auto.value === 1 ? autoBase.value + turned.value : dragAngle.value,
);
```

Four things had to be handled deliberately:

**1. Unwrapping the seam.** `Math.atan2` jumps from `+π` to `−π` when you cross
the left of the circle. Each frame's delta is corrected before use:

```ts
let d = a - lastAngle.value;
if (d > Math.PI) d -= TWO_PI;
if (d < -Math.PI) d += TWO_PI;
```

This is only safe because per-frame deltas are small — it would break if a single
sample could exceed π.

**2. Clockwise only.** Aarti is traditionally clockwise, so backward motion is
ignored rather than subtracted: `if (d > 0) turned.value += d`. This is also what
lets the thali spring home on release without losing progress.

**3. Drag by translation, not position.** The gesture lives on the thali itself,
so `e.x`/`e.y` are relative to the plate and useless for finding the orbit angle.
Instead it records the thali's offset from centre at grab time and adds
`e.translationX/Y`. Side benefit: the plate never teleports under the fingertip.

**4. Auto and manual can't disagree.** "Auto Aarti" animates `turned` straight to
`TOTAL` and derives the angle from it; manual drag accumulates into the same
`turned`. Because `TOTAL` is an exact multiple of 2π, the auto arc finishes
precisely at the resting angle, so handing control back is seamless.

Circle count reaches React via a reaction on the UI thread:

```ts
useAnimatedReaction(
  () => Math.floor(turned.value / TWO_PI),
  (cur, prev) => { if (prev !== null && cur !== prev) runOnJS(onCircles)(cur); },
);
```

### Return to rest

On release the thali springs back to the bottom of the orbit, taking the **short
way round** — `nearestRest` picks the congruent angle within ±π instead of
unwinding several full turns:

```ts
function nearestRest(current: number) {
  'worklet';
  return ANGLE_REST + Math.round((current - ANGLE_REST) / TWO_PI) * TWO_PI;
}
```

---

## Drawing without art assets

| Effect | Technique |
| --- | --- |
| Gradients | `mixHex()` across ~10–12 stacked bands (`constants/color.ts`) |
| Radial glow | `Glow` — concentric circles, opacity falling with radius |
| Flame | 3 stacked teardrops (`borderRadius` with one sharp corner) flickering on **uneven** durations so it doesn't read as a metronome |
| Marigold | 8 petal circles ringed around a darker centre |
| Toran | Gold bar + row of half-circle scallops + beaded trim |
| Bell | Rounded trapezoid + lip + clapper, rotated about a pivot above it |
| Gopuram | Stacked tiers of decreasing width + kalash finial |
| Murti | Crown / head / torso / robe / garland / lotus, composed per deity |

**Falling particles use a phase offset, not a delay.** An early version used
`withDelay(random)`, which meant the shrine opened with an empty sky for up to
6 seconds. Now every bloom shares one 0→1 loop and offsets inside the style, so
flowers are mid-fall on the very first frame:

```ts
const p = (t.value + phase) % 1;
```

---

## Adding a deity

Append to `DEITIES` in `src/constants/deities.ts`. Nothing else needs touching —
the strip, idol, title and offerings all read from it.

```ts
{
  id: 'saraswati',
  name: 'सरस्वती माँ',      // strip label
  title: 'माँ सरस्वती',      // app-bar pill
  body: '#F2D6B8',          // skin/murti tone
  robe: '#FFFFFF',
  accent: '#FFE08A',        // halo + glow
  trim: '#C9A227',          // crown, garland, jewellery
  crown: 'mukut',           // 'jata' | 'mukut' | 'tall' | 'plain'
  mark: 'ऐं',
  mantra: 'ॐ सरस्वत्यै नमः',
  offerings: ['श्वेत पुष्प', 'वीणा', 'अक्षत'],
}
```

Optional attribute flags: `crescent`, `serpent` (Shiva), `elephant` (Ganesha),
`mace` (Hanuman).

### Replacing the procedural art

The stylised murtis are the biggest visual gap versus the real app, which uses
painted artwork. `Deity` takes an optional `image`; when present `DeityIdol`
renders it **instead** of the procedural figure, and the halo, aarti orbit,
marigolds and progress all keep working unchanged:

```ts
image: require('@/assets/images/deities/shiva.png'),   // transparent PNG/WebP
```

---

## The map screen (`src/app/temples.tsx`)

A separate pilgrimage map of 5 temples on a 620×900 canvas, markers placed on
roughly real geography, linked by dotted routes.

The camera is **one shared transform over the whole canvas** rather than moving
each marker — `Pan` and `Pinch` composed with `Gesture.Simultaneous`:

```ts
transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }]
```

Pan uses `.minDistance(8)` so taps still reach the markers underneath. Selecting
one springs the camera to centre it:

```ts
tx.value = withSpring(-(t.map.x - MAP_W / 2) * s);
```

---

## Gotchas worth knowing

**`GestureHandlerRootView` is required.** Added in `src/app/_layout.tsx`. Without
it, gestures silently do nothing.

**React Compiler flags Reanimated as a false positive.** `sharedValue.value = x`
trips `react-hooks/immutability`, but that *is* the library's API and isn't React
state. `eslint.config.js` disables that one rule for the animation files only.

**`StyleSheet.absoluteFillObject` isn't in RN 0.86's types** — use explicit
`position: 'absolute'` + insets.

**The web tab bar goes compact under 620px.** Adding tabs pushed the row past
phone-width viewports; `app-tabs.web.tsx` hides the brand and Docs link on narrow
screens. `TopTabInset` in `theme.ts` offsets screen content because the web tab
bar is absolutely positioned at the top (on native it's a bottom bar).

**Headless Chrome can't verify animation.** Reanimated's rAF timeline doesn't
advance under `--virtual-time-budget`, so screenshots show everything at its
initial value. Static layout is verifiable; motion and touch need a real device.
Also, headless Chrome clamps its window to a 500px minimum while still writing a
smaller screenshot — a narrower `--window-size` silently crops the right edge and
looks like a layout bug.

---

## Commands

```bash
npm start          # dev server on :8081
npm run web        # browser
npm run android    # emulator / device
npm run lint
npx tsc --noEmit
npx expo export --platform web   # full bundle check
```

Routes: `/` · `/temples` · `/pooja` · `/explore`

---

## Known gaps

- **Deity art is procedural**, not painted. Use the `image` field above.
- **No audio.** The bell swings silently and "अभी सुनें" is inert — no
  `expo-audio`/`expo-av` installed. No haptics either.
- **Node v20.1.0 is below RN 0.86's required `>=20.19.4`.** It runs but warns on
  every start; `nvm install 22`.
- **iOS simulator unavailable** on this machine — only Command Line Tools are
  installed, not full Xcode, so `simctl` is missing.
- **Ritual rail is partly wired**: diya → Auto Aarti, flowers → extra shower,
  shankh → reset, संग्रह → placeholder.
- **The strip's "भक्ति रील्स" and "+" pills are inert**, as is the coin counter.
- One pre-existing lint error in the template's `use-color-scheme.web.ts`
  (`setState` in an effect) — left alone rather than change hydration behaviour.
