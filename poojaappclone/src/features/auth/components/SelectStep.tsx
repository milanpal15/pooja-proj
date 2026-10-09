import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

export function SelectStep({
  title,
  mobileLabel,
  googleLabel,
  showMobile,
  error,
  busy,
  lang,
  onToggleLang,
  onMobile,
  onGoogle,
}: {
  title: string;
  mobileLabel: string;
  googleLabel: string;
  /** False while SMS OTP is switched off — Google becomes the only route. */
  showMobile: boolean;
  error: string;
  busy: boolean;
  lang: string | null;
  onToggleLang: () => void;
  onMobile: () => void;
  onGoogle: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.selectWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch language"
        onPress={onToggleLang}
        hitSlop={12}
        style={[styles.langPill, { borderColor: c.goldHairline, backgroundColor: c.containerLowest }]}>
        <Icon name="globe" size={15} color={c.goldInk} />
        <Type v="labelMd" tone="goldInk">
          {lang === 'en' ? 'हि' : 'EN'}
        </Type>
      </Pressable>

      <View style={styles.selectHead}>
        <Type v="headlineLg" tone="goldInk" center>
          {title}
        </Type>
        <Type v="display" tone="primary" center style={styles.omBig}>
          ॐ
        </Type>
      </View>

      <View style={styles.selectButtons}>
        {showMobile && (
          <Button
            label={mobileLabel}
            icon="person"
            iconRight="forward"
            size="lg"
            block
            disabled={busy}
            onPress={onMobile}
          />
        )}
        <Button
          label={googleLabel}
          // Sole route while mobile is off, so it takes the primary weight.
          variant={showMobile ? 'secondary' : 'primary'}
          icon="google"
          iconRight="forward"
          size="lg"
          block
          loading={busy}
          disabled={busy}
          onPress={onGoogle}
        />
        {!!error && (
          <Type v="labelMd" tone="error" center>
            {error}
          </Type>
        )}
      </View>

      <Type v="mantra" tone="onSurfaceVariant" center style={styles.tagline}>
        भक्ति में ही शांति है, और समर्पण में ही शक्ति।
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  selectWrap: { flex: 1, padding: Space.lg, justifyContent: 'center', gap: Space.xl },
  langPill: {
    position: 'absolute',
    top: Space.md,
    right: Space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  selectHead: { alignItems: 'center', gap: Space.md },
  omBig: { fontSize: 64, lineHeight: 76 },
  selectButtons: { gap: Space.sm },
  tagline: { paddingHorizontal: Space.sm },
});
