import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, Field } from '@/components/ui';
import type { LocationState } from '@/hooks/use-location';
import { Space } from '@/theme';

import { LocationStatus } from './LocationStatus';

/** Search box, the three filter chips, and the inline location status. */
export function TempleFilters({
  placeholder,
  query,
  onQuery,
  labels,
  nearMe,
  loc,
  onlySaved,
  onToggleNearMe,
  onToggleSaved,
  onViewMap,
  onRetryLocation,
}: {
  placeholder: string;
  query: string;
  onQuery: (q: string) => void;
  labels: { nearMe: string; saved: string; viewOnMap: string };
  nearMe: boolean;
  loc: LocationState;
  onlySaved: boolean;
  onToggleNearMe: () => void;
  onToggleSaved: () => void;
  onViewMap: () => void;
  onRetryLocation: () => void;
}) {
  return (
    <SafeAreaView edges={['top']} style={styles.head}>
      <Field
        icon="search"
        value={query}
        onChangeText={onQuery}
        placeholder={placeholder}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <View style={styles.controls}>
        <Chip
          label={labels.nearMe}
          icon="mapPin"
          selected={nearMe && loc.status === 'granted'}
          onPress={onToggleNearMe}
        />
        <Chip label={labels.saved} icon="heart" selected={onlySaved} onPress={onToggleSaved} />
        <Chip label={labels.viewOnMap} icon="temple" onPress={onViewMap} />
      </View>

      {nearMe && <LocationStatus loc={loc} onRetry={onRetryLocation} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: Space.margin, paddingTop: Space.sm, gap: Space.sm },
  controls: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
});
