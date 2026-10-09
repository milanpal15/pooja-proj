import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui';
import { Space } from '@/theme';

import type { WallpaperTarget } from '../lib/native-wallpaper';

/**
 * Setting the wallpaper is the point of the screen, so it leads.
 * Saving to the gallery stays for anyone who wants the file itself.
 * Separate home/lock targets need Android 7+; below that the device
 * has one wallpaper and offering the choice would be a lie.
 */
export function ApplyActions({
  hi,
  canSet,
  splitTargets,
  applying,
  saving,
  onApply,
  onSave,
}: {
  hi: boolean;
  canSet: boolean;
  splitTargets: boolean;
  applying: WallpaperTarget | null;
  saving: boolean;
  onApply: (target: WallpaperTarget) => void;
  onSave: () => void;
}) {
  return (
    <>
      {canSet ? (
        splitTargets ? (
          <>
            <View style={styles.actionRow}>
              <View style={{ flex: 1 }}>
                <Button
                  label={hi ? 'होम स्क्रीन' : 'Home screen'}
                  icon="home"
                  size="lg"
                  block
                  loading={applying === 'home'}
                  disabled={!!applying || saving}
                  onPress={() => onApply('home')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={hi ? 'लॉक स्क्रीन' : 'Lock screen'}
                  variant="secondary"
                  icon="star"
                  size="lg"
                  block
                  loading={applying === 'lock'}
                  disabled={!!applying || saving}
                  onPress={() => onApply('lock')}
                />
              </View>
            </View>
            <Button
              label={hi ? 'दोनों पर लगाएँ' : 'Set on both'}
              variant="secondary"
              icon="check"
              size="lg"
              block
              loading={applying === 'both'}
              disabled={!!applying || saving}
              onPress={() => onApply('both')}
            />
          </>
        ) : (
          <Button
            label={hi ? 'वॉलपेपर सेट करें' : 'Set as wallpaper'}
            icon="check"
            size="lg"
            block
            loading={!!applying}
            disabled={saving}
            onPress={() => onApply('both')}
          />
        )
      ) : null}

      <Button
        label={hi ? 'गैलरी में सहेजें' : 'Save to gallery'}
        variant={canSet ? 'ghost' : 'primary'}
        icon="share"
        size="lg"
        block
        loading={saving}
        disabled={!!applying}
        onPress={onSave}
      />
    </>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', gap: Space.sm },
});
