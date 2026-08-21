/**
 * Theme provider.
 *
 * Two independent axes:
 *
 *   scheme  light | dark      follows the OS, overridable by the user
 *   mode    cream | sanctum   declared per screen
 *
 * Keeping them separate is the point. The immersive pooja screen is dark
 * because it is a sanctum, not because the phone is in dark mode — and it
 * should stay a sanctum in either scheme. Screens declare intent (`sanctum`);
 * the system decides the hexes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  type ColorRoles,
  Elevation,
  Motion,
  Radius,
  type Scheme,
  Schemes,
  Space,
  type SurfaceMode,
} from './tokens';

type ThemeValue = {
  /** Colour roles for the current scheme + surface mode. */
  c: ColorRoles;
  scheme: Scheme;
  mode: SurfaceMode;
  /** True on the immersive ember surface — handy for status-bar style. */
  isSanctum: boolean;
  space: typeof Space;
  radius: typeof Radius;
  elevation: typeof Elevation;
  motion: typeof Motion;
};

function build(scheme: Scheme, mode: SurfaceMode): ThemeValue {
  return {
    c: Schemes[scheme][mode],
    scheme,
    mode,
    isSanctum: mode === 'sanctum',
    space: Space,
    radius: Radius,
    elevation: Elevation,
    motion: Motion,
  };
}

const ThemeContext = createContext<ThemeValue>(build('light', 'cream'));

/**
 * What the devotee chose, as opposed to what the OS reports.
 *
 * `system` is the default and stays the default: an app that ignores the
 * phone's own setting is the more common annoyance. The explicit choices
 * exist because this app is often opened in a dark temple or at 4am for
 * Mangala Aarti, when the OS setting is not what the moment calls for.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const PREF_KEY = 'pooja.theme';

type PrefValue = { pref: ThemePreference; setPref: (p: ThemePreference) => void };
const PrefContext = createContext<PrefValue>({ pref: 'system', setPref: () => {} });

export function useThemePreference() {
  return useContext(PrefContext);
}

export function ThemeProvider({
  children,
  scheme,
}: {
  children: React.ReactNode;
  /** Force a scheme, ignoring both the OS and the saved preference. */
  scheme?: Scheme;
}) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(PREF_KEY)
      .then((raw) => {
        if (raw === 'light' || raw === 'dark' || raw === 'system') setPrefState(raw);
      })
      .catch(() => {});
  }, []);

  const setPref = useCallback((p: ThemePreference) => {
    setPrefState(p);
    AsyncStorage.setItem(PREF_KEY, p).catch(() => {});
  }, []);

  // An explicit `scheme` prop still wins — the gallery uses it to preview both
  // without disturbing what the devotee chose.
  const resolved: Scheme =
    scheme ?? (pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref);

  const value = useMemo(() => build(resolved, 'cream'), [resolved]);
  const prefValue = useMemo(() => ({ pref, setPref }), [pref, setPref]);

  return (
    <PrefContext.Provider value={prefValue}>
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    </PrefContext.Provider>
  );
}

/**
 * Switches the surface mode for its subtree.
 *
 *   <Surface mode="sanctum">
 *     <PoojaScreen />   // cards, buttons and the tab bar all re-tone
 *   </Surface>
 */
export function Surface({
  mode,
  children,
}: {
  mode: SurfaceMode;
  children: React.ReactNode;
}) {
  const { scheme } = useContext(ThemeContext);
  const value = useMemo(() => build(scheme, mode), [scheme, mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
