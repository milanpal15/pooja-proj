import { StyleSheet, View } from 'react-native';

import { SectionBand } from '@/components/ui';
import { clock, type Panchang, periodText } from '@/lib/panchang';
import { Space } from '@/theme';

import { FactRow } from './FactRow';
import { Stat } from './Stat';

type SectionProps = {
  p: Panchang;
  hi: boolean;
  /** Temple's value when published, else the computed one. */
  show: (k: string, fallback: string) => string;
  /** The computed value in the devotee's own script. */
  own: (en: string, dev: string) => string;
};

/** The five limbs — panchānga literally means "five limbs". */
export function FiveLimbsSection({ p, hi, show, own }: SectionProps) {
  return (
    <SectionBand title={hi ? 'पंचांग के पाँच अंग' : 'The Five Limbs'} tone="gold">
      <View style={{ gap: Space.sm }}>
        <FactRow
          label={hi ? 'तिथि' : 'Tithi'}
          value={`${show('paksha', own(p.paksha, p.pakshaHi))} ${show('tithi', own(p.tithi, p.tithiHi))}`.trim()}
          icon="calendar"
        />
        <FactRow label={hi ? 'वार' : 'Vara'} value={hi ? p.varaHi : p.vara} icon="sparkle" />
        <FactRow label={hi ? 'नक्षत्र' : 'Nakshatra'} value={show('nakshatra', own(p.nakshatra, p.nakshatraHi))} icon="star" />
        <FactRow label={hi ? 'योग' : 'Yoga'} value={show('yoga', own(p.yoga, p.yogaHi))} icon="lotus" />
        <FactRow label={hi ? 'करण' : 'Karana'} value={show('karana', own(p.karana, p.karanaHi))} icon="shankh" />
      </View>
    </SectionBand>
  );
}

export function SunSection({ p, hi, show }: SectionProps) {
  return (
    <SectionBand title={hi ? 'सूर्य' : 'Sun'} tone="crimson">
      <View style={styles.pair}>
        <Stat label={hi ? 'सूर्योदय' : 'Sunrise'} value={show('sunrise', clock(p.sunrise, hi))} icon="diya" />
        <Stat label={hi ? 'सूर्यास्त' : 'Sunset'} value={show('sunset', clock(p.sunset, hi))} icon="sparkle" />
      </View>
    </SectionBand>
  );
}

export function MuhurtaSection({ p, hi, show }: SectionProps) {
  return (
    <SectionBand title={hi ? 'मुहूर्त' : 'Muhurta'} tone="forest">
      <View style={{ gap: Space.sm }}>
        <FactRow
          label={hi ? 'अभिजित मुहूर्त' : 'Abhijit Muhurat'}
          value={show('abhijit', periodText(p.abhijit, hi))}
          icon="check"
          good
        />
        <FactRow label={hi ? 'राहु काल' : 'Rahu Kaal'} value={show('rahuKaal', periodText(p.rahuKaal, hi))} icon="close" bad />
        <FactRow label={hi ? 'यमगण्ड' : 'Yamaganda'} value={show('yamaganda', periodText(p.yamaganda, hi))} icon="close" bad />
        <FactRow label={hi ? 'गुलिक काल' : 'Gulika Kaal'} value={show('gulika', periodText(p.gulika, hi))} icon="close" bad />
      </View>
    </SectionBand>
  );
}

export function MonthSection({ p, hi, show, own }: SectionProps) {
  return (
    <SectionBand title={hi ? 'मास एवं ऋतु' : 'Month & Season'} tone="purple">
      <View style={styles.pair}>
        <Stat label={hi ? 'मास' : 'Masa'} value={show('masa', own(p.masa, p.masaHi) || '—')} icon="calendar" />
        <Stat label={hi ? 'ऋतु' : 'Ritu'} value={show('ritu', own(p.ritu, p.rituHi) || '—')} icon="marigold" />
      </View>
    </SectionBand>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: Space.sm },
});
