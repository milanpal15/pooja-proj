import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';

export type MapStatusKind = 'loading' | 'empty' | 'error' | 'hint' | 'styleFailed';

/**
 * One honest line about the nearby search: finding, none found, couldn't load (with Retry), or a
 * nudge to zoom in. Pins already on the map are never hidden by any of these.
 */
export function MapStatus({
  kind,
  message,
  actionLabel,
  onAction,
}: {
  kind: MapStatusKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={styles.chip}
      accessibilityRole={kind === 'error' || kind === 'styleFailed' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite">
      {kind === 'loading' ? <ActivityIndicator size="small" color="#FFC13D" /> : null}
      <Type v="labelMd" color="#FFFFFF" style={styles.text} numberOfLines={2}>
        {message}
      </Type>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          style={styles.action}>
          <Type v="labelMd" color="#FFC13D">
            {actionLabel}
          </Type>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    maxWidth: '92%',
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(24,8,6,0.88)',
  },
  text: { flexShrink: 1 },
  action: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
