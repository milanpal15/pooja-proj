/** `ReadMore` — body text clamped to a few lines with a "Read more ⌄" toggle (only when it is long). */

import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useLanguage } from '@/i18n';

import { Icon } from './icon';
import { Type, type TypeComponentProps } from './type';

export function ReadMore({
  text,
  lines = 4,
  threshold = 180,
  ...type
}: { text: string; lines?: number; threshold?: number } & Omit<TypeComponentProps, 'children' | 'numberOfLines'>) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const long = text.length > threshold;
  return (
    <View style={{ gap: 6 }}>
      <Type {...type} numberOfLines={long && !open ? lines : undefined}>
        {text}
      </Type>
      {long && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 }}>
          <Type v="labelMd" tone="onSurface">
            {open ? t('ps_read_less') : t('ps_read_more')}
          </Type>
          <Icon name="chevronDown" size={14} strokeWidth={2.2} />
        </Pressable>
      )}
    </View>
  );
}
