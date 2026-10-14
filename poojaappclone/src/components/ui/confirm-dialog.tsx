/**
 * Themed confirm dialog — the replacement for `Alert.alert` on real questions.
 *
 * `Alert` draws the platform's own grey Material dialog, which looks like nothing else in the app
 * and ignores the light/dark switch. Toasts cover messages nobody needs to answer; this covers the
 * ones that need a yes or a no ("Cancel this booking?", "End the call?").
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (await confirm({ title, message, confirmLabel, cancelLabel, destructive: true })) { … }
 *
 * It is a Modal (its own native window, so it sits above everything, tab bar included); the theme
 * still applies because React context crosses the Modal boundary. Resolves `false` for the cancel
 * button, a tap outside, and the Android back button — never rejects.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Space, useTheme } from '@/theme';

import { Button } from './button';
import { Type } from './type';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Draws the confirm button in the warning colour instead of the main call-to-action. */
  destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { c, elevation } = useTheme();
  const [open, setOpen] = useState<ConfirmOptions | null>(null);
  const settle = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // A second question while one is open answers the first with "no" rather than leaking it.
        settle.current?.(false);
        settle.current = resolve;
        setOpen(options);
      }),
    [],
  );

  const close = (ok: boolean) => {
    const done = settle.current;
    settle.current = null;
    setOpen(null);
    done?.(ok);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal visible={!!open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => close(false)}>
        <View style={styles.root}>
          {/* The scrim is a real control: tapping outside is "no". */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={open?.cancelLabel}
            onPress={() => close(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
          />
          {open && (
            <View
              accessibilityViewIsModal
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.outlineVariant }, elevation.high]}>
              <Type v="titleLg" accessibilityRole="header">
                {open.title}
              </Type>
              {!!open.message && (
                <Type v="bodyMd" tone="onSurfaceVariant">
                  {open.message}
                </Type>
              )}
              <View style={styles.actions}>
                <Button label={open.cancelLabel} variant="outline" block onPress={() => close(false)} style={styles.btn} />
                <Button
                  label={open.confirmLabel}
                  variant={open.destructive ? 'secondary' : 'primary'}
                  block
                  onPress={() => close(true)}
                  style={styles.btn}
                />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </ConfirmContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space.lg },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Space.lg,
    gap: Space.sm + 4,
  },
  actions: { flexDirection: 'row', gap: Space.sm + 2, marginTop: Space.sm },
  btn: { flex: 1 },
});
