import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';

/** The plain-language billing rule. `**bold**` segments in the string are emphasised. */
export function BillingNote() {
  const { t } = useLanguage();
  const parts = t('start_billing').split('**');
  return (
    <Type v="bodySm" tone="onSurfaceVariant">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <Type key={i} v="labelMd" tone="onSurface">
            {p}
          </Type>
        ) : (
          p
        ),
      )}
    </Type>
  );
}
