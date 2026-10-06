import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  ArchImage,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  type IconName,
  IconButton,
  ListRow,
  Mandala,
  Screen,
  SectionHeader,
  Segmented,
  Type,
} from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useContent } from '@/context/content';
import {
  type ColorRoles,
  contrast,
  Elevation,
  grade,
  Radius,
  type Scheme,
  Space,
  Surface,
  type SurfaceMode,
  ThemeProvider,
  Type as TypeScale,
  type TypeVariant,
  useTheme,
} from '@/theme';

/**
 * Design system gallery.
 *
 * Every token and component in one scrollable route, with live scheme and
 * surface toggles — the point being that you can watch the whole kit re-tone
 * rather than trusting that it does. Dev-only; reached from Profile.
 *
 * The contrast column is deliberate. The export's gold headings measured
 * 2.3:1 on cream and shipped anyway, because swatches look fine next to each
 * other. Printing the measured ratio makes that failure mode loud.
 */
export default function GalleryScreen() {
  const [scheme, setScheme] = useState<Scheme>('light');
  const [mode, setMode] = useState<SurfaceMode>('cream');

  return (
    <Screen tabBar={false}>
      <AppBar title="Design System" subtitle="SACRED DEVOTION" />

      {/* The controls live outside the previewed theme so they stay legible
          whatever the preview is set to. */}
      <View style={styles.controls}>
        <Segmented
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={scheme}
          onChange={setScheme}
        />
        <Segmented
          options={[
            { value: 'cream', label: 'Cream' },
            { value: 'sanctum', label: 'Sanctum' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>

      <ThemeProvider scheme={scheme}>
        <Surface mode={mode}>
          <Preview />
        </Surface>
      </ThemeProvider>
    </Screen>
  );
}

function Preview() {
  // A design-system showcase, so any published artwork will do — there is
  // no bundled still to reach for any more, and none is fine: ArchImage
  // renders its frame without one.
  const { deityArt, deityList } = useContent();
  const sampleArt = deityList.map((d) => deityArt(d.id)).find(Boolean);

  const { c, isSanctum } = useTheme();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      {isSanctum && (
        <Mandala size={460} opacity={0.08} petals={20} style={styles.backdropMandala} />
      )}

      <Section title="Contrast">
        <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
          Each row measures the pair as it is actually rendered — button ink on
          button fill, not on the page. The only permitted Fail is `gold`,
          which is why it is ornament and never text.
        </Type>
        <Card variant="sunken" padded={false}>
          {PAIRS.map((pair, i) => (
            <ContrastRow key={pair.label} {...pair} last={i === PAIRS.length - 1} />
          ))}
        </Card>
      </Section>

      <Section title="Surfaces">
        <View style={styles.wrap}>
          {(
            [
              'surface',
              'containerLowest',
              'containerLow',
              'container',
              'containerHigh',
              'containerHighest',
            ] as (keyof ColorRoles)[]
          ).map((k) => (
            <View key={k} style={styles.surfaceChip}>
              <View
                style={[
                  styles.surfaceSwatch,
                  { backgroundColor: c[k] as string, borderColor: c.outlineVariant },
                ]}
              />
              <Type v="labelSm" tone="onSurfaceFaint">
                {k}
              </Type>
            </View>
          ))}
        </View>
      </Section>

      {/* ── The demo that justifies the third typeface ───────────────── */}
      <Section title="Type scale">
        <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
          Each step shown in both scripts. Devanagari resolves to Noto Sans at
          a matched weight — without it every Hindi string would fall back to
          the platform face.
        </Type>
        {(Object.keys(TypeScale) as TypeVariant[]).map((v) => (
          <View key={v} style={styles.typeRow}>
            <Type v="labelSm" tone="onSurfaceFaint">
              {v} · {TypeScale[v].fontSize}/{TypeScale[v].lineHeight} · {TypeScale[v].weight}
            </Type>
            <Type v={v} numberOfLines={1}>
              {SAMPLES[v].en}
            </Type>
            <Type v={v} tone="onSurfaceVariant" numberOfLines={1}>
              {SAMPLES[v].hi}
            </Type>
          </View>
        ))}
      </Section>

      <Section title="Icons">
        <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
          The five navigation icons carry a filled variant for the active
          state; utility icons are line-art only.
        </Type>
        <Card variant="sunken">
          <Type v="labelSm" tone="onSurfaceFaint">
            NAVIGATION — OUTLINE / FILLED
          </Type>
          <View style={[styles.wrap, { marginTop: Space.sm }]}>
            {NAV_ICONS.map((n) => (
              <View key={n} style={styles.iconCell}>
                <View style={styles.iconPair}>
                  <Icon name={n} size={26} color={c.onSurfaceVariant} />
                  <Icon name={n} size={26} color={c.primary} filled />
                </View>
                <Type v="labelSm" tone="onSurfaceFaint">
                  {n}
                </Type>
              </View>
            ))}
          </View>
        </Card>
        <View style={[styles.wrap, { marginTop: Space.sm }]}>
          {UTIL_ICONS.map((n) => (
            <View key={n} style={styles.iconCell}>
              <Icon name={n} size={24} color={c.onSurface} />
              <Type v="labelSm" tone="onSurfaceFaint">
                {n}
              </Type>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Buttons">
        <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
          One `primary` per screen — the scarcity is what makes it read as the
          button. `glass` is for sanctum surfaces only.
        </Type>
        <View style={styles.stack}>
          <Button label="Pay ₹106.00" icon="gift" block />
          <Button label="Navigate" variant="secondary" icon="mapPin" block />
          <Button label="Logout" variant="outline" icon="logout" block />
          <Button label="Resend code" variant="ghost" block />
          <Button label="Shankh Naad" variant="glass" icon="shankh" block />
          <View style={styles.row}>
            <Button label="Small" size="sm" />
            <Button label="Medium" size="md" />
          </View>
          <View style={styles.row}>
            <Button label="Loading" loading />
            <Button label="Disabled" disabled />
          </View>
          <View style={styles.row}>
            <IconButton name="back" label="Back" />
            <IconButton name="settings" label="Settings" variant="glass" />
            <IconButton name="heart" label="Like" variant="solid" />
          </View>
        </View>
      </Section>

      <Section title="Cards">
        <View style={styles.stack}>
          <Card>
            <Type v="titleMd">Plain</Type>
            <Type v="bodySm" tone="onSurfaceVariant">
              White container, hairline border. The default list card.
            </Type>
          </Card>
          <Card variant="ornate">
            <Type v="titleMd" tone="goldInk">
              Ornate
            </Type>
            <Type v="bodySm" tone="onSurfaceVariant">
              Gold hairline and a mandala watermark at 5%. Featured content
              only — an ornament used everywhere stops being one.
            </Type>
          </Card>
          <Card variant="sunken">
            <Type v="titleMd">Sunken</Type>
            <Type v="bodySm" tone="onSurfaceVariant">
              Tonal, borderless. Settings groups and payment summaries.
            </Type>
          </Card>
          <Card variant="glass">
            <Type v="titleMd">Glass</Type>
            <Type v="bodySm" tone="onSurfaceVariant">
              Frosted. Switch the surface toggle to Sanctum to see it work.
            </Type>
          </Card>
        </View>
      </Section>

      <Section title="Temple arch">
        <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
          DESIGN.md calls this the signature shape; the export never drew it —
          every featured image came back a plain rounded rectangle.
        </Type>
        <ArchImage source={sampleArt} height={210}>
          <View style={styles.archOverlay}>
            <Badge label="LIVE" tone="live" />
            <Badge label="15.4K VIEWS" tone="primary" />
          </View>
        </ArchImage>
      </Section>

      <Section title="Rows">
        <Card variant="sunken" padded={false}>
          <ListRow icon="diya" title="My Poojas" subtitle="Upcoming & past bookings" onPress={noop} />
          <ListRow icon="temple" title="Saved Temples" subtitle="Your spiritual destinations" onPress={noop} />
          <ListRow icon="globe" title="Language" subtitle="हिंदी" onPress={noop} last />
        </Card>
      </Section>

      <Section title="Chips & badges">
        <View style={styles.wrap}>
          {['₹51', '₹101', '₹251', '₹501'].map((amt, i) => (
            <Chip key={amt} label={amt} selected={i === 1} onPress={noop} />
          ))}
          <Chip label="Near Me" icon="mapPin" onPress={noop} />
        </View>
        <View style={[styles.wrap, { marginTop: Space.md }]}>
          <Badge label="LIVE" tone="live" />
          <Badge label="NEW" tone="accent" />
          <Badge label="VERIFIED" tone="success" />
          <Badge label="AARTI 7 PM" tone="primary" />
        </View>
      </Section>

      <Section title="Segmented">
        <SegmentedDemo />
      </Section>

      <Section title="Divider">
        <Card variant="sunken">
          <Type v="bodySm">Neutral</Type>
          <View style={{ height: Space.sm }} />
          <Divider />
          <View style={{ height: Space.md }} />
          <Type v="bodySm">Gold — ornamental separation</Type>
          <View style={{ height: Space.sm }} />
          <Divider gold />
        </Card>
      </Section>

      <Section title="Elevation">
        <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
          Aura-glow, not grey shadow: a diffused saffron cast, so elements read
          as radiating light.
        </Type>
        <View style={styles.row}>
          {(['low', 'mid', 'high'] as const).map((step) => (
            <View
              key={step}
              style={[
                styles.elevBox,
                Elevation[step],
                { backgroundColor: c.containerLowest, shadowColor: c.glowTint },
              ]}>
              <Type v="labelSm" tone="onSurfaceFaint">
                {step}
              </Type>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Mandala">
        <View style={styles.mandalaRow}>
          <Mandala size={132} opacity={0.5} petals={16} />
          <Mandala size={132} opacity={0.5} petals={12} color={c.primary} />
          <Mandala size={132} opacity={0.28} petals={24} />
        </View>
      </Section>

      <View style={{ height: Space.xxl }} />
    </ScrollView>
  );
}

/* ───────────────────────────────────────────────────────────── pieces ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

/** A foreground/background pair, named the way it is actually used. */
type Pair = {
  fg: keyof ColorRoles;
  bg: keyof ColorRoles;
  label: string;
  /** Expected to fail — ornament, not text. */
  ornament?: boolean;
};

const PAIRS: Pair[] = [
  { fg: 'onSurface', bg: 'surface', label: 'Body text' },
  { fg: 'onSurfaceVariant', bg: 'surface', label: 'Secondary text' },
  { fg: 'onSurfaceFaint', bg: 'surface', label: 'Placeholders & meta' },
  { fg: 'primary', bg: 'surface', label: 'Wordmark, active tab' },
  { fg: 'goldInk', bg: 'surface', label: 'Gold-feeling headings' },
  { fg: 'onAccent', bg: 'accent', label: 'Primary button' },
  { fg: 'onPrimary', bg: 'primary', label: 'Secondary button' },
  { fg: 'onPrimaryContainer', bg: 'primaryContainer', label: 'Selected chip' },
  { fg: 'onSurface', bg: 'containerLowest', label: 'Text on a card' },
  { fg: 'error', bg: 'surface', label: 'Error text' },
  { fg: 'gold', bg: 'surface', label: 'Ornament — must not carry text', ornament: true },
];

function ContrastRow({ fg, bg, label, ornament, last }: Pair & { last: boolean }) {
  const { c, isSanctum } = useTheme();
  const fgHex = c[fg] as string;
  const bgHex = c[bg] as string;
  // Pass the surface as the base so translucent container tokens — most of
  // the sanctum's — flatten onto what's actually behind them.
  const ratio = contrast(fgHex, bgHex, c.surface);
  const g = grade(ratio);
  // Text that fails is a bug. `gold` is expected to fail on cream, which is
  // why it is ornament — but on the dark sanctum it legitimately passes, so
  // the expectation only applies to the light surface.
  const bad = ornament ? !isSanctum && g !== 'Fail' : g === 'Fail';
  const verdict = ornament && !isSanctum ? (g === 'Fail' ? 'ornament ✓' : 'too strong') : g;

  return (
    <View
      style={[
        styles.swatchRow,
        !last && { borderBottomWidth: 1, borderBottomColor: c.outlineVariant },
      ]}>
      <View style={[styles.swatch, { backgroundColor: bgHex, borderColor: c.outlineVariant }]}>
        <Type v="titleSm" color={fgHex}>
          Aa
        </Type>
      </View>
      <View style={{ flex: 1 }}>
        <Type v="titleSm">{label}</Type>
        <Type v="labelSm" tone="onSurfaceFaint">
          {fg} on {bg}
        </Type>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Type v="labelMd" numeric tone={bad ? 'error' : 'onSurface'}>
          {ratio ? `${ratio.toFixed(2)}:1` : '—'}
        </Type>
        <Type v="labelSm" tone={bad ? 'error' : 'success'}>
          {verdict}
        </Type>
      </View>
    </View>
  );
}

function SegmentedDemo() {
  const [tab, setTab] = useState<'amount' | 'item'>('amount');
  return (
    <Segmented
      options={[
        { value: 'amount', label: 'Amount' },
        { value: 'item', label: 'Item' },
      ]}
      value={tab}
      onChange={setTab}
    />
  );
}

const noop = () => {};

const NAV_ICONS: IconName[] = ['home', 'diya', 'temple', 'music', 'person'];

const UTIL_ICONS: IconName[] = [
  'back', 'forward', 'close', 'check', 'bell', 'settings', 'search', 'calendar',
  'mapPin', 'star', 'heart', 'share', 'plus', 'minus', 'play', 'pause', 'globe',
  'logout', 'support', 'gift', 'sparkle', 'lotus', 'marigold', 'shankh',
];

/** Latin and Devanagari samples, sized so each step stays on one line. */
const SAMPLES: Record<TypeVariant, { en: string; hi: string }> = {
  display: { en: 'Virtual Pooja', hi: 'वर्चुअल पूजा' },
  headlineLg: { en: 'Live Darshan', hi: 'लाइव दर्शन' },
  headlineMd: { en: 'Kashi Vishwanath', hi: 'काशी विश्वनाथ' },
  titleLg: { en: 'Popular Temples', hi: 'लोकप्रिय मंदिर' },
  titleMd: { en: 'Daily Gratitude', hi: 'दैनिक कृतज्ञता' },
  titleSm: { en: 'Service Fee', hi: 'सेवा शुल्क' },
  bodyLg: { en: 'Offer flowers to the deity', hi: 'देवता को पुष्प अर्पित करें' },
  bodyMd: { en: 'Varanasi, Uttar Pradesh', hi: 'वाराणसी, उत्तर प्रदेश' },
  bodySm: { en: 'Mangala Aarti · 3:00 AM', hi: 'मंगला आरती · प्रातः ३:००' },
  labelLg: { en: 'Pay Now', hi: 'अभी भुगतान करें' },
  labelMd: { en: 'Book Pooja', hi: 'पूजा बुक करें' },
  labelSm: { en: 'SECURE PAYMENT', hi: 'सुरक्षित भुगतान' },
  mantra: { en: 'Om Namah Shivaya', hi: 'ॐ नमः शिवाय' },
  numeral: { en: '108', hi: '१०८' },
};

const styles = StyleSheet.create({
  controls: { paddingHorizontal: Space.margin, paddingBottom: Space.md, gap: Space.sm },
  scroll: { paddingHorizontal: Space.margin, paddingTop: Space.md },
  backdropMandala: { position: 'absolute', top: 40, alignSelf: 'center' },
  section: { marginBottom: Space.xl },
  note: { marginBottom: Space.sm },
  stack: { gap: Space.sm },
  row: { flexDirection: 'row', gap: Space.sm, alignItems: 'center', flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, alignItems: 'center' },

  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: 10,
    paddingHorizontal: Space.cardPadding,
  },
  swatch: {
    width: 44,
    height: 40,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  surfaceChip: { alignItems: 'center', gap: 4, width: 96 },
  surfaceSwatch: { width: 96, height: 44, borderRadius: Radius.md, borderWidth: 1 },

  typeRow: { marginBottom: Space.md, gap: 2 },

  iconCell: { alignItems: 'center', gap: 4, width: 76 },
  iconPair: { flexDirection: 'row', gap: 6 },

  archOverlay: {
    position: 'absolute',
    top: Space.md,
    left: Space.md,
    flexDirection: 'row',
    gap: 6,
  },

  elevBox: {
    width: 92,
    height: 72,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mandalaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
