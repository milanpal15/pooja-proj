import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, Icon, IconButton } from '@/components/ui';
import { Space, useTheme } from '@/theme';

/** Back, and the autofocused search input with its clear button. */
export function SearchHeader({
  value,
  onChange,
  onSubmit,
  onBack,
  placeholder,
  backLabel,
  clearLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  placeholder: string;
  backLabel: string;
  clearLabel: string;
}) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={['top']}>
      <View style={styles.bar}>
        <IconButton name="back" label={backLabel} onPress={onBack} color={c.onSurface} />
        <Field
          containerStyle={styles.field}
          icon="search"
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          accessibilityLabel={placeholder}
          returnKeyType="search"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          right={
            value.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={clearLabel}
                hitSlop={4}
                onPress={() => onChange('')}
                style={styles.clear}>
                <Icon name="close" size={18} color={c.onSurfaceFaint} />
              </Pressable>
            ) : null
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Space.sm, paddingTop: Space.xs, paddingBottom: Space.sm },
  field: { flex: 1, alignSelf: 'auto' },
  clear: { width: 44, height: 44, marginVertical: -12, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
});
