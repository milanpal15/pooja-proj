import { StyleSheet, View } from 'react-native';

import { Card, Type } from '@/components/ui';

import type { PanchangCell } from '../lib/panchang-summary';
import { SectionHead } from './SectionHead';

/** "Aaj ka Panchang": a 2-column grid of whatever could be computed. Missing cells are simply absent. */
export function PanchangCard({
  title,
  link,
  cells,
  labels,
  onCalendar,
}: {
  title: string;
  link: string;
  cells: PanchangCell[];
  labels: Record<PanchangCell['key'], string>;
  onCalendar: () => void;
}) {
  return (
    <Card style={styles.card}>
      <SectionHead title={title} link={link} onLink={onCalendar} />
      <View style={styles.grid}>
        {cells.map((cell) => (
          <View key={cell.key} style={styles.cell}>
            <Type v="labelSm" tone="onSurfaceVariant">
              {labels[cell.key]}
            </Type>
            <Type v="titleSm">{cell.value}</Type>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  cell: { width: '50%', gap: 2, paddingRight: 8 },
});
