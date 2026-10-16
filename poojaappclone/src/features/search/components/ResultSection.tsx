import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

import type { Section } from '../hooks/use-search';
import type { Entry } from '../lib/entries';
import { SkeletonRows } from './SkeletonRows';

/** One group of results: heading, up to five rows, and "See all" when a list screen has more. */
export function ResultSection({
  section,
  title,
  seeAllLabel,
  seeAllA11y,
  openLabel,
  loadingLabel,
  onOpen,
  onSeeAll,
}: {
  section: Section;
  title: string;
  seeAllLabel: string;
  seeAllA11y: string;
  /** `Open {title}` with the placeholder still in it. */
  openLabel: string;
  loadingLabel: string;
  onOpen: (e: Entry) => void;
  onSeeAll: (href: string) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Type v="titleMd" accessibilityRole="header" style={styles.title}>
          {title}
        </Type>
        {!!section.seeAll && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={seeAllA11y}
            hitSlop={6}
            onPress={() => onSeeAll(section.seeAll!)}
            style={styles.seeAll}>
            <Type v="labelMd" tone="primary">
              {seeAllLabel}
            </Type>
          </Pressable>
        )}
      </View>

      {section.hits.length > 0 ? (
        <Card variant="sunken" style={styles.card}>
          {section.hits.map((e, i) => (
            <Pressable
              key={e.key}
              accessibilityRole="button"
              accessibilityLabel={openLabel.replace('{title}', e.title)}
              onPress={() => onOpen(e)}
              style={({ pressed }) => [
                styles.row,
                i < section.hits.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.outlineVariant },
                pressed && { backgroundColor: c.container },
              ]}>
              <View style={[styles.medallion, { backgroundColor: c.accentContainer }]}>
                <Icon name={section.icon} size={18} color={c.primary} />
              </View>
              <View style={styles.text}>
                <Type v="titleMd" tone="goldInk" numberOfLines={1}>
                  {e.title}
                </Type>
                {!!e.subtitle && (
                  <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
                    {e.subtitle}
                  </Type>
                )}
              </View>
              <Icon name="forward" size={16} color={c.onSurfaceFaint} />
            </Pressable>
          ))}
        </Card>
      ) : (
        <SkeletonRows label={loadingLabel} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  title: { flex: 1 },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingLeft: Space.md },
  card: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, minHeight: 56, paddingVertical: 10, paddingHorizontal: Space.md },
  medallion: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
});
