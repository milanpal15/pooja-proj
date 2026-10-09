import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui';
import { Space } from '@/theme';

/** Where a devotee would want to go next. */
export function NextSteps({
  showPooja,
  showBhajan,
  poojaLabel,
  bhajanLabel,
  onPooja,
  onBhajan,
}: {
  showPooja: boolean;
  showBhajan: boolean;
  poojaLabel: string;
  bhajanLabel: string;
  onPooja: () => void;
  onBhajan: () => void;
}) {
  return (
    <View style={styles.cta}>
      {showPooja && <Button label={poojaLabel} icon="diya" size="lg" block onPress={onPooja} />}
      {showBhajan && (
        <Button label={bhajanLabel} variant="outline" icon="music" block onPress={onBhajan} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cta: { gap: Space.sm, marginTop: Space.sm },
});
