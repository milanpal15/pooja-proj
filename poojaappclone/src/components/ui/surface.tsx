/**
 * Screen scaffolding: `Screen`, `AppBar`, `SanctumBackdrop`.
 *
 * Every screen in the app currently repeats the same twenty lines — a root
 * `View` with a hardcoded background, a `SafeAreaView`, a three-column header
 * with a `‹` character for back, and a `ScrollView` with hand-tuned bottom
 * padding to clear the tab bar. Those twenty lines drifted: five screens use
 * five different header heights and three different back affordances.
 *
 * `Screen` owns that scaffolding, including the tab-bar inset, so a screen
 * body starts at its actual content.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';


import { BottomTabInset, Fill, Space, Surface, type SurfaceMode, useTheme } from '@/theme';

import { IconButton } from './button';
import { Mandala } from './mandala';
import { Type } from './type';

/* ─────────────────────────────────────────────────────────── backdrop ── */

/** The ember wash behind sanctum screens, with its mandala halo. */
function SanctumBackdrop({ children }: { children?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <LinearGradient
      colors={c.emberWash as unknown as [string, string, string]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[Fill, { pointerEvents: 'none' }]}>
      <Mandala
        size={520}
        opacity={0.09}
        petals={20}
        style={{ position: 'absolute', top: '12%', alignSelf: 'center' }}
      />
      {children}
    </LinearGradient>
  );
}

/* ───────────────────────────────────────────────────────────── screen ── */

export type ScreenProps = {
  children: React.ReactNode;
  /** `cream` reading surface (default) or the immersive `sanctum`. */
  mode?: SurfaceMode;
  /** Reserve space for the bottom tab bar. Off for modal / auth screens. */
  tabBar?: boolean;
  /** A faint mandala watermark on the cream surface. */
  watermark?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  mode = 'cream',
  tabBar = true,
  watermark = false,
  style,
}: ScreenProps) {
  return (
    <Surface mode={mode}>
      <ScreenInner tabBar={tabBar} watermark={watermark} style={style}>
        {children}
      </ScreenInner>
    </Surface>
  );
}

function ScreenInner({
  children,
  tabBar,
  watermark,
  style,
}: Omit<ScreenProps, 'mode'> & { tabBar: boolean; watermark: boolean }) {
  const { c, isSanctum } = useTheme();

  return (
    // `overflow: hidden` is load-bearing, not cosmetic. The decorative mandala
    // sits at `right: -140`, and without clipping here it widens the screen's
    // layout box — on a 420pt viewport the content box measured 520, so every
    // percentage width overflowed and the tab bar ran off the right edge.
    <View style={[{ flex: 1, backgroundColor: c.surface, overflow: 'hidden' }, style]}>
      <StatusBar style={isSanctum ? 'light' : 'dark'} />
      {isSanctum && <SanctumBackdrop />}
      {!isSanctum && watermark && (
        <Mandala
          size={440}
          opacity={0.05}
          style={{ position: 'absolute', top: -80, right: -140 }}
        />
      )}
      <View style={{ flex: 1, paddingBottom: tabBar ? BottomTabInset : 0 }}>{children}</View>
    </View>
  );
}

/** Bottom padding for a ScrollView inside a `Screen` with a tab bar. */
export function useScrollPadding(extra: number = Space.xl) {
  const insets = useSafeAreaInsets();
  return { paddingBottom: insets.bottom + extra };
}

/* ───────────────────────────────────────────────────────────── appbar ── */

export type AppBarProps = {
  title?: string;
  subtitle?: string;
  /** Show a back control. Defaults to true when the router can go back. */
  back?: boolean;
  onBack?: () => void;
  /** Rendered at the trailing edge — usually an `IconButton`. */
  right?: React.ReactNode;
  /** A wordmark instead of a centred title, as on Home and Profile. */
  brand?: string;
  /** Tint the bar with the accent container, as the Journal screen does. */
  tinted?: boolean;
  /** Left-aligned bold title in the primary ink (the list/detail design) instead of a centred gold one. */
  leftTitle?: boolean;
};

export function AppBar({
  title,
  subtitle,
  back,
  onBack,
  right,
  brand,
  tinted = false,
  leftTitle = false,
}: AppBarProps) {
  const { c } = useTheme();
  const router = useRouter();
  const showBack = back ?? router.canGoBack();

  return (
    <SafeAreaView
      edges={['top']}
      style={[
        tinted && { backgroundColor: c.accentContainer },
        tinted && { borderBottomWidth: 1, borderBottomColor: c.goldHairline },
      ]}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {showBack && (
            <IconButton
              name="back"
              label="Go back"
              size={40}
              onPress={onBack ?? (() => router.back())}
              color={c.onSurface}
            />
          )}
        </View>

        <View style={[styles.center, leftTitle && { alignItems: 'flex-start', paddingLeft: Space.sm }]}>
          {brand ? (
            <Type v="headlineMd" tone="primary" numberOfLines={1}>
              {brand}
            </Type>
          ) : (
            <>
              {!!title && (
                <Type
                  v="titleLg"
                  tone={leftTitle ? 'onSurface' : 'goldInk'}
                  center={!leftTitle}
                  numberOfLines={1}
                  style={leftTitle ? { fontSize: 17, fontWeight: '700' } : undefined}>
                  {title}
                </Type>
              )}
              {!!subtitle && (
                <Type v="labelSm" tone="onSurfaceFaint" center numberOfLines={1}>
                  {subtitle}
                </Type>
              )}
            </>
          )}
        </View>

        <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
  },
  // Rails size to their content rather than a fixed 88pt: at 360pt that
  // reserved 176pt of a 360pt bar and clipped the wordmark to "Shri M…".
  // `minWidth` keeps the title from sliding around as the rails change.
  side: { minWidth: 40, justifyContent: 'center' },
  center: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
});
