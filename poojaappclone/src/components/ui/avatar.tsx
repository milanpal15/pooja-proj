/**
 * `Avatar` — a person's photo, or their initials when there is none.
 *
 * Presence is colour AND words: the dot alone fails for colour-blind users
 * and screen readers, so the whole avatar carries an accessibility label such
 * as "Pt. Rajesh, online".
 */

import { Image, StyleSheet, View } from 'react-native';

import { useLanguage } from '@/i18n';
import { Radius, useTheme } from '@/theme';

import { Type } from './type';

export type Presence = 'online' | 'busy' | 'offline';

export type AvatarProps = {
  name: string;
  photoUrl?: string;
  size?: number;
  presence?: Presence;
};

/** First letters of the first and last word, skipping honorifics: "Pt. Rajesh Sharma" is "RS", not "PR". */
function initialsOf(name: string): string {
  const words = name
    .replace(/\b(pt|pandit|dr|shri|sri|smt|mr|mrs|ms)\b\.?/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'ॐ';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, photoUrl, size = 48, presence }: AvatarProps) {
  const { c } = useTheme();
  const { t } = useLanguage();

  const dot = Math.max(10, Math.round(size * 0.26));
  const dotColor =
    presence === 'online' ? c.success : presence === 'busy' ? c.accent : c.outline;
  const presenceLabel =
    presence === 'online'
      ? t('presence_online')
      : presence === 'busy'
        ? t('presence_busy')
        : presence === 'offline'
          ? t('presence_offline')
          : '';

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={presenceLabel ? `${name}, ${presenceLabel}` : name}
      style={{ width: size, height: size }}>
      {photoUrl ? (
        // The radius sits on the Image itself: a clipped parent with a large
        // radius swallows absolutely positioned children on Android.
        <Image
          source={{ uri: photoUrl }}
          accessibilityElementsHidden
          style={{
            width: size,
            height: size,
            borderRadius: Radius.full,
            backgroundColor: c.accentContainer,
          }}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              backgroundColor: c.accentContainer,
              borderColor: c.goldHairline,
            },
          ]}>
          <Type
            v="titleSm"
            tone="goldInk"
            style={{ fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.46) }}>
            {initialsOf(name)}
          </Type>
        </View>
      )}
      {!!presence && (
        <View
          style={[
            styles.dot,
            {
              width: dot,
              height: dot,
              backgroundColor: dotColor,
              borderColor: c.containerLowest,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderRadius: Radius.full,
    borderWidth: 2,
  },
});
