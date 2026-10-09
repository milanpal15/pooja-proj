import { StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

import { NAV_ICONS, UTIL_ICONS } from '../constants/samples';

import { Section } from './Section';

export function IconsSection() {
  const { c } = useTheme();
  return (
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
  );
}

const styles = StyleSheet.create({
  note: { marginBottom: Space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, alignItems: 'center' },
  iconCell: { alignItems: 'center', gap: 4, width: 76 },
  iconPair: { flexDirection: 'row', gap: 6 },
});
