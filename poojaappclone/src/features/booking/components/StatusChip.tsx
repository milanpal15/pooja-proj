import { Badge } from '@/components/ui';
import { type StringKey, useLanguage } from '@/i18n';

import type { ChipTone } from '../lib/status';

export function StatusChip({ chip }: { chip: { label: StringKey; tone: ChipTone } }) {
  const { t } = useLanguage();
  return <Badge label={t(chip.label)} tone={chip.tone} />;
}
