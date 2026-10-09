import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui';
import { Family, useTheme } from '@/theme';

/** The Home search box. Submitting opens the pooja list with the query. */
export function SearchBar({ placeholder, onSubmit }: { placeholder: string; onSubmit: (q: string) => void }) {
  const { c } = useTheme();
  const [q, setQ] = useState('');

  return (
    <View style={[styles.box, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <Icon name="search" size={20} color={c.onSurfaceFaint} />
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => onSubmit(q)}
        returnKeyType="search"
        placeholder={placeholder}
        placeholderTextColor={c.onSurfaceFaint}
        accessibilityLabel={placeholder}
        style={[styles.input, { color: c.onSurface, fontFamily: Family.body[500] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 48, borderRadius: 24, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  input: { flex: 1, fontSize: 14, paddingVertical: 0 },
});
