import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

type Props = {
  title: string;
  message: string;
  /** A small line under the message (minimum version, "back by …"). */
  detail?: string;
  action?: { label: string; onPress: () => void; loading?: boolean };
  /** Further buttons under the main one (call / email / sign out). */
  secondaryActions?: { label: string; onPress: () => void; variant?: 'outline' | 'glass' | 'secondary' }[];
};

/**
 * Full-screen, undismissable state drawn over the whole app. A transparent-less `Modal` is used so it
 * sits above sheets and toasts (which are Modals too), and the Android back button is swallowed
 * (`onRequestClose` does nothing) — there is nothing behind it for the devotee to reach.
 */
export function BlockingScreen({ title, message, detail, action, secondaryActions }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View
        accessibilityViewIsModal
        style={[styles.root, { backgroundColor: c.surface, paddingTop: insets.top + Space.lg, paddingBottom: insets.bottom + Space.lg }]}>
        <ScrollView contentContainerStyle={styles.body} bounces={false}>
          <Type v="display" tone="primary" center accessibilityElementsHidden importantForAccessibility="no">
            ॐ
          </Type>
          <Type v="headlineMd" center accessibilityRole="header">
            {title}
          </Type>
          <Type v="bodyLg" tone="onSurfaceVariant" center>
            {message}
          </Type>
          {!!detail && (
            <Type v="labelLg" tone="goldInk" center>
              {detail}
            </Type>
          )}
        </ScrollView>
        {action && <Button label={action.label} block size="lg" loading={action.loading} onPress={action.onPress} />}
        {secondaryActions?.map((a) => (
          <Button key={a.label} label={a.label} block variant={a.variant ?? 'outline'} onPress={a.onPress} style={styles.secondary} />
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: Space.lg },
  secondary: { marginTop: Space.sm },
  body: { flexGrow: 1, justifyContent: 'center', gap: Space.md, paddingVertical: Space.lg },
});
