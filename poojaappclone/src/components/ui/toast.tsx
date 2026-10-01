/**
 * Sacred Devotion toasts.
 *
 * Every confirmation in the app used to be `Alert.alert`, which draws the
 * platform's own dialog — Material grey on Android, nothing like the sanctum
 * palette, and modal for a message nobody needs to acknowledge. "Saved to
 * gallery" does not deserve a button press.
 *
 * This is the in-app replacement: themed, non-blocking, self-dismissing.
 * `Alert` still has a job — an actual question with a choice, like
 * "Discard this booking?" — and those stay as dialogs.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success('Wallpaper set');
 *   toast.error('Could not save', { description: e.message });
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icon';
import { Type } from './type';
import { Radius, Space, useTheme } from '@/theme';

export type ToastVariant = 'success' | 'error' | 'info';

export type ToastOptions = {
  /** Second line, for the detail behind the headline. */
  description?: string;
  /** Milliseconds on screen. Errors default longer — they are read, not glanced at. */
  duration?: number;
};

type ToastItem = ToastOptions & {
  id: number;
  message: string;
  variant: ToastVariant;
};

const ICONS: Record<ToastVariant, IconName> = {
  success: 'check',
  error: 'close',
  info: 'sparkle',
};

/** Errors linger; a success is a glance. */
const DEFAULT_MS: Record<ToastVariant, number> = {
  success: 2600,
  error: 4200,
  info: 3200,
};

/* ─────────────────────────────────────────────────────────── provider ── */

type ToastApi = {
  show: (message: string, variant?: ToastVariant, opts?: ToastOptions) => void;
  success: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
  info: (message: string, opts?: ToastOptions) => void;
  dismiss: () => void;
};

/*
 * A module-level ref rather than React context.
 *
 * Toasts get raised from callbacks, catch blocks and helper functions that
 * are not always inside a component — and a context read would force every
 * one of those to become a hook. The provider registers itself here on
 * mount; `useToast()` returns a stable object either way, so calling it
 * before the provider mounts is a no-op rather than a crash.
 */
let emit: ((t: Omit<ToastItem, 'id'>) => void) | null = null;
let clear: (() => void) | null = null;

const api: ToastApi = {
  show: (message, variant = 'info', opts) => emit?.({ message, variant, ...opts }),
  success: (message, opts) => emit?.({ message, variant: 'success', ...opts }),
  error: (message, opts) => emit?.({ message, variant: 'error', ...opts }),
  info: (message, opts) => emit?.({ message, variant: 'info', ...opts }),
  dismiss: () => clear?.(),
};

/** Stable across renders — safe in dependency arrays. */
export function useToast(): ToastApi {
  return api;
}

/** Also callable outside React, for helpers and catch blocks. */
export const toast = api;

/* ──────────────────────────────────────────────────────────── surface ── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const queue = useRef<ToastItem[]>([]);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `useState` initialiser rather than `useRef(new Animated.Value(0)).current`:
  // reading `.current` during render is exactly what the compiler warns about,
  // and a lazily-created state value is just as stable.
  const [anim] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();
  const { c } = useTheme();

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(anim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      const next = queue.current.shift() ?? null;
      setCurrent(next);
    });
  }, [anim]);

  // Register the module-level emitter for the life of the provider.
  useEffect(() => {
    emit = (t) => {
      const item = { ...t, id: ++seq.current };
      // One at a time: a stack of toasts over a devotional screen is noise.
      setCurrent((cur) => {
        if (cur) {
          queue.current.push(item);
          return cur;
        }
        return item;
      });
    };
    clear = () => hide();
    return () => {
      emit = null;
      clear = null;
    };
  }, [hide]);

  // Animate in, announce, and schedule the exit whenever the toast changes.
  useEffect(() => {
    if (!current) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();

    // Screen readers get the text; the visual timing is irrelevant to them.
    AccessibilityInfo.announceForAccessibility?.(
      current.description ? `${current.message}. ${current.description}` : current.message,
    );

    timer.current = setTimeout(hide, current.duration ?? DEFAULT_MS[current.variant]);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current, anim, hide]);

  const accent = useMemo(() => {
    if (!current) return c.gold;
    return current.variant === 'error'
      ? c.error
      : current.variant === 'success'
        ? c.success
        : c.gold;
  }, [current, c]);

  return (
    <View style={{ flex: 1 }}>
      {children}

      {!!current && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            /*
             * Top, not bottom.
             *
             * Almost every screen here ends in a full-width call to action —
             * Save, Pay Now, Set on both, Complete Profile — and a bottom
             * toast landed straight on top of them, hiding the control the
             * devotee had just used. The tab bar takes the rest of that edge.
             * The top edge only ever holds the app bar, which a transient
             * banner may cover.
             */
            { top: insets.top + Space.xs },
            {
              opacity: anim,
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) },
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={current.message}
            accessibilityHint="Dismiss"
            onPress={hide}
            style={[
              styles.toast,
              {
                backgroundColor: c.containerLowest,
                borderColor: c.goldHairline,
                // A colour-blind devotee should not have to read the tint to
                // know this went wrong, hence the icon as well as the bar.
                shadowColor: '#000',
              },
            ]}>
            <View style={[styles.rail, { backgroundColor: accent }]} />
            <View style={[styles.iconWrap, { backgroundColor: accent }]}>
              <Icon name={ICONS[current.variant]} size={15} color={c.containerLowest} />
            </View>
            <View style={styles.body}>
              <Type v="labelMd" numberOfLines={2}>
                {current.message}
              </Type>
              {!!current.description && (
                <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={3}>
                  {current.description}
                </Type>
              )}
            </View>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Space.margin,
    right: Space.margin,
    alignItems: 'stretch',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 0,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      android: { elevation: 8 },
      default: {
        shadowOpacity: 0.28,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
    }),
  },
  /** The variant's colour as a spine, so the tint reads even in dark mode. */
  rail: { width: 4, alignSelf: 'stretch' },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  body: { flex: 1, gap: 1 },
});
