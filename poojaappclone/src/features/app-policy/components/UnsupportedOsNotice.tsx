import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, Space, useTheme } from '@/theme';

import { pickMessage, type Policy } from '../lib/policy';

/** `unsupported_os`: a courtesy notice, not a block. Dismissed once per launch (the gate holds the flag). */
export function UnsupportedOsNotice({ policy, onDismiss }: { policy: Policy; onDismiss: () => void }) {
  const { t, lang } = useLanguage();
  const { c } = useTheme();
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('ap_os_dismiss')} onPress={onDismiss} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} />
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: c.surface, borderColor: c.outlineVariant }]}>
          <Type v="titleLg" accessibilityRole="header">
            {t('ap_os_title')}
          </Type>
          <Type v="bodyMd" tone="onSurfaceVariant">
            {pickMessage(policy, lang, t('ap_os_body'))}
          </Type>
          <Button label={t('ap_os_dismiss')} block onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space.lg },
  card: { width: '100%', maxWidth: 420, borderRadius: Radius.xl, borderWidth: 1, padding: Space.lg, gap: Space.md },
});
