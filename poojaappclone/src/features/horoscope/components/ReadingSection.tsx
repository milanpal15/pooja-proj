import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon, SectionBand, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

import type { Reading } from '../types';

import { Lucky } from './Lucky';

/** Today's reading for the chosen sign: loading, the text, or one of two silences. */
export function ReadingSection({
  hi,
  readings,
  reading,
  failed,
}: {
  hi: boolean;
  /** Null until the first response (or failure). */
  readings: Reading[] | null;
  reading: Reading | undefined;
  failed: boolean;
}) {
  const { c } = useTheme();
  const body = hi ? reading?.predictionHi || reading?.prediction : reading?.prediction;
  const colour = hi ? reading?.luckyColorHi || reading?.luckyColor : reading?.luckyColor;

  return (
    <SectionBand title={hi ? 'आज का राशिफल' : "Today's Reading"} tone="purple">
      {readings === null && !failed ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.gold} />
        </View>
      ) : body ? (
        <View style={{ gap: Space.md }}>
          <Type v="bodyMd">{body}</Type>
          {(!!colour || !!reading?.luckyNumber) && (
            <View style={styles.pair}>
              {!!colour && (
                <Lucky label={hi ? 'शुभ रंग' : 'Lucky colour'} value={colour} icon="marigold" />
              )}
              {!!reading?.luckyNumber && (
                <Lucky
                  label={hi ? 'शुभ अंक' : 'Lucky number'}
                  value={reading.luckyNumber}
                  icon="sparkle"
                />
              )}
            </View>
          )}
        </View>
      ) : (
        /*
         * Two different silences, told apart on purpose: the temple has
         * not published today, or this device cannot reach it.
         */
        <View style={styles.empty}>
          <Icon name={failed ? 'close' : 'calendar'} size={22} color={c.onSurfaceFaint} />
          <Type v="titleSm" center>
            {failed
              ? hi
                ? 'राशिफल लोड नहीं हो सका'
                : 'Could not load the reading'
              : hi
                ? 'आज का राशिफल अभी प्रकाशित नहीं हुआ'
                : 'No reading published for today yet'}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant" center>
            {failed
              ? hi
                ? 'इंटरनेट जाँचकर पुनः प्रयास करें।'
                : 'Check your connection and try again.'
              : hi
                ? 'मंदिर द्वारा प्रकाशित होते ही यहाँ दिखेगा।'
                : 'It will appear here once the temple publishes it.'}
          </Type>
        </View>
      )}
    </SectionBand>
  );
}

const styles = StyleSheet.create({
  centre: { paddingVertical: Space.xl, alignItems: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: Space.lg },
  pair: { flexDirection: 'row', gap: Space.sm },
});
