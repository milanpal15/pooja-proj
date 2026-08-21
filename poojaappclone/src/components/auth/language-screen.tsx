import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Mandala, Type } from '@/components/ui';
import { type Lang, useLanguage } from '@/context/language';
import { Fill, Radius, Space, useTheme } from '@/theme';

/**
 * First-launch language picker.
 *
 * Rebuilt on the system. The old version hand-mixed an eight-band gradient
 * and introduced `ACCENT = '#FF7A45'`, an orange that exists nowhere else —
 * with white CTA text on it at 2.59:1. The wash is now the system's sunlight
 * gradient and the CTA is the standard primary button.
 */

const OPTIONS: { code: Lang; label: string; sub: string }[] = [
  { code: 'en', label: 'English', sub: 'Continue in English' },
  { code: 'hi', label: 'हिंदी', sub: 'हिंदी में जारी रखें' },
];

export function LanguageScreen() {
  const { c } = useTheme();
  const { setLang } = useLanguage();
  const [choice, setChoice] = useState<Lang>('hi');

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, overflow: 'hidden' }}>
      <LinearGradient
        colors={[c.accentContainer, c.surface, c.accentContainer]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[Fill, { pointerEvents: 'none' }]}
      />
      <Mandala size={340} opacity={0.09} style={styles.mandalaTop} />
      <Mandala size={300} opacity={0.07} petals={12} style={styles.mandalaBottom} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.brand}>
          <View style={[styles.omCircle, { backgroundColor: c.containerLowest, borderColor: c.gold }]}>
            <Type v="display" tone="primary">
              ॐ
            </Type>
          </View>
          <Type v="headlineLg" tone="goldInk" center>
            Choose your language
          </Type>
          <Type v="titleLg" tone="onSurfaceVariant" center>
            अपनी भाषा चुनें
          </Type>
        </View>

        <View style={styles.options}>
          {OPTIONS.map((o) => {
            const active = choice === o.code;
            return (
              <Card
                key={o.code}
                variant="plain"
                accessibilityLabel={o.label}
                onPress={() => setChoice(o.code)}
                style={[
                  styles.option,
                  { borderColor: active ? c.primary : c.outlineVariant, borderWidth: 2 },
                ]}>
                <View style={{ flex: 1 }}>
                  <Type v="titleLg" tone={active ? 'primary' : 'onSurface'}>
                    {o.label}
                  </Type>
                  <Type v="bodySm" tone="onSurfaceVariant">
                    {o.sub}
                  </Type>
                </View>
                {/* Selection is a radio *and* a colour change, so it never
                    depends on hue alone. */}
                <View
                  style={[
                    styles.radio,
                    { borderColor: active ? c.primary : c.outline },
                  ]}>
                  {active && <View style={[styles.radioDot, { backgroundColor: c.primary }]} />}
                </View>
              </Card>
            );
          })}
        </View>

        <Button
          label={choice === 'en' ? 'Continue' : 'आगे बढ़ें'}
          size="lg"
          block
          iconRight="forward"
          onPress={() => setLang(choice)}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: 'center', padding: Space.lg, gap: Space.xl },
  mandalaTop: { position: 'absolute', top: -90, left: -110 },
  mandalaBottom: { position: 'absolute', bottom: -80, right: -90 },

  brand: { alignItems: 'center', gap: Space.sm },
  omCircle: {
    width: 84,
    height: 84,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginBottom: Space.xs,
  },

  options: { gap: Space.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md },
  radio: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 12, height: 12, borderRadius: Radius.full },
});
