/**
 * `Sheet` — a bottom sheet.
 *
 * A Modal, so it sits above the tab bar and the keyboard handling is the
 * platform's. Two consequences worth knowing:
 *
 *  - A Modal is its own native window, so the app's toasts draw BEHIND it.
 *    Anything that fails inside a sheet should say so inside the sheet.
 *  - The theme still applies: React context crosses the Modal boundary.
 */

import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Space, useTheme } from '@/theme';

import { Type } from './type';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.root}>
        {/* The scrim is a real control: tapping outside dismisses. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              maxHeight: height * 0.88,
              paddingBottom: Math.max(insets.bottom, Space.md) + Space.sm,
            },
          ]}>
          <View style={[styles.handle, { backgroundColor: c.outlineVariant }]} />
          {!!title && (
            <Type v="titleLg" accessibilityRole="header" style={styles.title}>
              {title}
            </Type>
          )}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.xl + 4,
    borderTopRightRadius: Radius.xl + 4,
    paddingHorizontal: Space.margin,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Space.md,
  },
  title: { marginBottom: Space.sm },
  body: { gap: Space.md, paddingBottom: Space.sm },
});
