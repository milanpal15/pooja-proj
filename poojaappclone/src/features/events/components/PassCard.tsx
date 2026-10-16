import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius } from '@/theme';

import { fill } from '../lib/events-logic';
import { QrCode } from './QrCode';

/** The pass shown after joining (board "EventGarba"): a QR tile built from `me.passCode` and the code as text. */
export function PassCard({ code }: { code: string }) {
  const { t } = useLanguage();
  return (
    <View style={styles.wrap}>
      <LinearGradient colors={['#5A1534', '#3A0E24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.bg]} />
      <View style={styles.tile}>
        <QrCode value={code} size={92} label={fill(t('ev_pass'), { code })} />
      </View>
      <View style={styles.text}>
        <Type v="titleMd" color="#FFFFFF">
          {t('ev_you_registered')}
        </Type>
        <Type v="bodySm" color="rgba(255,255,255,0.9)">
          {t('ev_pass_hint')}
        </Type>
        <Type v="labelLg" color="#F6D27A" selectable>
          {fill(t('ev_pass'), { code })}
        </Type>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: Radius.lg + 2 },
  bg: { borderRadius: Radius.lg + 2 },
  tile: { width: 100, height: 100, borderRadius: Radius.md, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 4 },
});
