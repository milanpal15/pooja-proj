/**
 * The bottom tab bar. One bar, one geometry, every screen.
 *
 * The Stitch export shipped five different bottom bars across twelve screens.
 * An earlier pass here cut that to two — a seated bar on cream screens and a
 * floating glass pill on the immersive ones — on the theory that the sanctum
 * deserved its own treatment. Rendering all five tab screens side by side
 * showed why that was wrong:
 *
 *   - the bar changed *shape and position* as you moved between tabs, which
 *     reads as a bug rather than as atmosphere;
 *   - the two skins had different heights, so `BottomTabInset` was correct for
 *     one and wrong for the other — the Bhajan track list scrolled underneath
 *     the floating bar and its mini-player collided with it;
 *   - the active indicator was a circle on some screens and a rounded rect on
 *     others, because each skin had grown its own.
 *
 * Navigation furniture should be the most stable thing on screen. The bar has
 * exactly one geometry, one active indicator and one tone — see TabBar for why
 * the tone stopped following the screen too.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName, Type } from '@/components/ui';
import { type StringKey, useLanguage } from '@/i18n';
import { Radius, Surface, useTheme } from '@/theme';

export type TabDef = { name: string; href: string; icon: IconName; labelKey: StringKey };

/** The five tabs. */
const TABS: TabDef[] = [
  { name: 'index', href: '/', icon: 'home', labelKey: 'tab_home' },
  { name: 'pooja', href: '/pooja', icon: 'diya', labelKey: 'tab_pooja' },
  { name: 'temples', href: '/temples', icon: 'temple', labelKey: 'tab_temples' },
  { name: 'bhajan', href: '/bhajan', icon: 'music', labelKey: 'tab_bhajan' },
  { name: 'profile', href: '/profile', icon: 'person', labelKey: 'tab_profile' },
];

export default function AppTabs({ tabs = TABS }: { tabs?: TabDef[] }) {
  const { t } = useLanguage();

  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <TabBar>
          {tabs.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href as never} asChild>
              <TabButton icon={tab.icon} label={t(tab.labelKey)} />
            </TabTrigger>
          ))}
        </TabBar>
      </TabList>
    </Tabs>
  );
}

function TabBar({ children }: { children?: React.ReactNode }) {
  // Always the app's base surface, never the sanctum.
  //
  // The bar used to take its tone from whichever screen was open, so moving
  // to Pooja or Bhajan flipped it from cream to ember mid-navigation. That was
  // defensible in theory — the bar matching its screen — and wrong in
  // practice: the one element that is present on every screen was the one
  // element that kept changing. A light nav bar under a dark player is normal;
  // a nav bar that changes colour as you tab is a glitch.
  return (
    <Surface mode="cream">
      <TabBarSkin>{children}</TabBarSkin>
    </Surface>
  );
}

function TabBarSkin({ children }: { children?: React.ReactNode }) {
  const { c } = useTheme();

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[c.containerLowest, c.containerLow]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ borderTopWidth: 1, borderTopColor: c.goldHairline }}>
        <SafeAreaView edges={['bottom']} style={styles.bar}>
          {children}
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

type TabButtonProps = TabTriggerSlotProps & { icon: IconName; label: string };

function TabButton({ icon, label, isFocused, ...props }: TabButtonProps) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();

  // Below ~360pt five labels can't sit side by side without truncating to
  // "Temp…". Dropping to the icon alone for the inactive tabs is honest;
  // clipping a word is not.
  const compact = width < 360;
  const tint = isFocused ? c.primary : c.onSurfaceFaint;

  return (
    // `{...props}` MUST come before `style`. TabTrigger passes its own style
    // through the slot, and spreading it last silently replaced `flex: 1` —
    // every tab then sized to its content, the row grew past the viewport,
    // and the fifth tab fell off the right edge on every screen.
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      accessibilityLabel={label}
      style={styles.item}>
      {/* One indicator shape, everywhere: a soft kumkum pill behind the icon.
          Active state is carried by three things at once — the pill, the
          filled icon variant and the label colour — so it never rests on
          colour alone. */}
      <View style={[styles.pill, isFocused && { backgroundColor: c.primaryContainer }]}>
        <Icon name={icon} size={22} color={tint} filled={!!isFocused} strokeWidth={1.8} />
      </View>
      {(!compact || isFocused) && (
        <Type v="labelSm" color={tint} numberOfLines={1} style={styles.label}>
          {label}
        </Type>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 8,
  },
  item: {
    flex: 1,
    // `minWidth: 0` lets a long label shrink instead of forcing the row wider
    // than the viewport — without it the fifth tab was pushed off-screen.
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 2,
    height: 54,
  },
  pill: {
    // Circular, not a stadium — a 52x30 rounded rect read as a square badge.
    // `overflow: hidden` alongside the radius: on Android the background of a
    // rounded View is not always clipped by the radius on its own.
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { maxWidth: '100%', textAlign: 'center' },
});
