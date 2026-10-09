import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Type } from '@/components/ui';
import { useTheme } from '@/theme';

import { Banner } from './Banner';
import { SectionHead } from './SectionHead';

/** "Your next seva": the devotee's soonest live booking with its status chip. */
export function NextSeva({
  title,
  link,
  seed,
  name,
  line,
  status,
  onLink,
  onOpen,
}: {
  title: string;
  link: string;
  seed: string;
  name: string;
  line: string;
  status: string;
  onLink: () => void;
  onOpen: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      <SectionHead title={title} link={link} onLink={onLink} />
      <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onOpen}>
        <Card style={styles.card}>
          <Banner seed={seed} style={styles.thumb} />
          <View style={styles.body}>
            <Type v="titleSm" numberOfLines={2}>
              {name}
            </Type>
            {!!line && (
              <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
                {line}
              </Type>
            )}
            <View style={[styles.chip, { backgroundColor: c.successContainer }]}>
              <View style={[styles.dot, { backgroundColor: c.success }]} />
              <Type v="labelSm" tone="success">
                {status}
              </Type>
            </View>
          </View>
        </Card>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  card: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 16 },
  body: { flex: 1, gap: 3 },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
