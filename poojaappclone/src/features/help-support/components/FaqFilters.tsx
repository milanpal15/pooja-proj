import { StyleSheet, View } from 'react-native';

import { Chip, Field } from '@/components/ui';
import { Space } from '@/theme';

import type { FAQCategory } from '../types';

/** Search box and category chips. */
export function FaqFilters({
  placeholder,
  query,
  onQuery,
  categories,
  selected,
  onSelect,
}: {
  placeholder: string;
  query: string;
  onQuery: (q: string) => void;
  categories: { key: FAQCategory; label: string }[];
  selected: FAQCategory;
  onSelect: (key: FAQCategory) => void;
}) {
  return (
    <>
      {/* Search Input */}
      <View style={styles.searchWrap}>
        <Field placeholder={placeholder} value={query} onChangeText={onQuery} icon="search" />
      </View>

      {/* Category Chips */}
      <View style={styles.chipsRow}>
        {categories.map((cat) => (
          <Chip
            key={cat.key}
            label={cat.label}
            selected={selected === cat.key}
            onPress={() => onSelect(cat.key)}
          />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    marginTop: 2,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
});
