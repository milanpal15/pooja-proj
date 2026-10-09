import { ScrollView, StyleSheet } from 'react-native';

import { Screen, SectionBand, Type } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';
import { useReminders } from '@/features/alarm';
import { Space } from '@/theme';

import { NotRingtoneNote } from './components/NotRingtoneNote';
import { ToneRow } from './components/ToneRow';
import { useTonePreview } from './hooks/use-tone-preview';

/**
 * Alert tone — the "Ringtone" tile.
 *
 * ⚠️ This sets what THIS APP plays for its reminders, not the phone's system
 * ringtone. Replacing the device ringtone needs Android's RingtoneManager and
 * the WRITE_SETTINGS permission, neither of which exists in Expo Go — it would
 * take a native module and a development build.
 *
 * That limit is stated on the screen rather than hidden, because a setting
 * that silently does less than its name implies is worse than one that
 * explains itself. Choosing the app's own alert sound is real, works today,
 * and is what most devotees actually want from this.
 */
export function RingtoneScreen() {
  const { tones } = useContent();
  const { lang } = useLanguage();
  const hi = lang === 'hi';
  const { state, setTone } = useReminders();
  const { playing, preview } = useTonePreview();

  return (
    <Screen tabBar={false}>
      <AppBar
        title={hi ? 'अलर्ट ध्वनि' : 'Alert Tone'}
        subtitle={hi ? 'आरती अलार्म के लिए' : 'FOR AARTI REMINDERS'}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionBand title={hi ? 'ध्वनि चुनें' : 'Choose a tone'} tone="gold">
          {tones.map((tone, i) => (
            <ToneRow
              key={tone.slug}
              tone={tone}
              hi={hi}
              on={state.tone === tone.slug}
              playing={playing === tone.slug}
              last={i === tones.length - 1}
              onPress={() => {
                setTone(tone.slug);
                preview(tone);
              }}
            />
          ))}
        </SectionBand>

        <Type v="bodySm" tone="onSurfaceVariant">
          {hi
            ? 'तुरंत सुनने के लिए किसी ध्वनि पर टैप करें।'
            : 'Tap a tone to hear it. The change applies to every reminder you have on.'}
        </Type>

        <NotRingtoneNote hi={hi} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.md },
});
