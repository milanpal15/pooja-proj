import { View } from 'react-native';

import { Sheet, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { ChadhavaListingDetail } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Radius, Space, useTheme } from '@/theme';

/** "How your offering is made" — the listing's own numbered steps. */
export function HowSheet({
  visible,
  onClose,
  steps,
}: {
  visible: boolean;
  onClose: () => void;
  steps: ChadhavaListingDetail['howItWorks'];
}) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('cs_how')}>
      {steps.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: Space.sm + 4, alignItems: 'flex-start' }}>
          <View style={{ width: 26, height: 26, borderRadius: Radius.full, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Type v="labelMd" tone="onPrimary">
              {i + 1}
            </Type>
          </View>
          <Type v="bodyMd" style={{ flex: 1 }}>
            {pick(lang, s.text, s.textHi)}
          </Type>
        </View>
      ))}
    </Sheet>
  );
}
