import { StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { type StringKey, useLanguage } from '@/i18n';
import type { Booking, BookingStatus } from '@/lib/api';
import { formatStamp } from '@/lib/pooja-dates';
import { Radius, Saffron, useTheme } from '@/theme';

import { timelineSteps } from '../lib/timeline';

const COPY: Record<BookingStatus, { title: StringKey; sub: StringKey }> = {
  booked: { title: 'ps_st_booked', sub: 'ps_st_booked_sub' },
  sankalp: { title: 'ps_st_sankalp', sub: 'ps_st_sankalp_sub' },
  performed: { title: 'ps_st_performed', sub: 'ps_st_performed_sub' },
  cancelled: { title: 'ps_st_cancelled', sub: 'ps_st_cancelled_sub' },
};

/** Booked -> Sankalp -> Performed, from the server's `statusHistory`. */
export function StatusTimeline({ booking }: { booking: Pick<Booking, 'status' | 'statusHistory'> }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const steps = timelineSteps(booking);

  return (
    <View>
      {steps.map((s, i) => {
        const done = s.state === 'done';
        const cancelled = s.status === 'cancelled';
        const now = s.state === 'now';
        const dot = cancelled ? c.error : done ? c.success : now ? Saffron[400] : c.container;
        return (
          <View key={s.status} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: done || cancelled ? dot : now ? c.containerLowest : c.container, borderColor: dot },
                ]}>
                {done || cancelled ? (
                  <Icon name={cancelled ? 'close' : 'check'} size={13} color="#FFFFFF" strokeWidth={3} />
                ) : (
                  <Type v="labelSm" color={now ? Saffron[400] : c.onSurfaceFaint} style={{ fontSize: 12, lineHeight: 14, letterSpacing: 0 }}>
                    {i + 1}
                  </Type>
                )}
              </View>
              {i < steps.length - 1 && <View style={[styles.line, { backgroundColor: c.outlineVariant }]} />}
            </View>
            <View style={styles.text}>
              <Type v="titleSm" tone={s.state === 'todo' ? 'onSurfaceFaint' : 'onSurface'} style={{ fontSize: 14 }}>
                {t(COPY[s.status].title)}
              </Type>
              <Type v="bodySm" tone="onSurfaceVariant">
                {[s.at ? formatStamp(s.at, lang) : '', t(COPY[s.status].sub)].filter(Boolean).join(' · ')}
              </Type>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, minHeight: 56 },
  rail: { alignItems: 'center', width: 22 },
  dot: { width: 22, height: 22, borderRadius: Radius.full, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, marginVertical: 2 },
  text: { flex: 1, gap: 2, paddingBottom: 14 },
});
