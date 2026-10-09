import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { formatClock } from '@/lib/duration';
import { fill } from '@/lib/fill';

/** Big mm:ss timer. Fixed-width digits so it does not jitter. */
export function CallTimer({ seconds }: { seconds: number }) {
  const { t } = useLanguage();
  const clock = formatClock(seconds);
  return (
    <Type
      v="numeral"
      numeric
      center
      accessibilityRole="timer"
      accessibilityLabel={fill(t('call_timer_label'), { t: clock })}
      style={{ fontSize: 56, lineHeight: 64 }}>
      {clock}
    </Type>
  );
}
