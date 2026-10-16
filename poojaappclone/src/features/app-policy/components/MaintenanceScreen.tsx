import { useLanguage } from '@/i18n';

import { formatIstDateTime, pickMessage, type Policy } from '../lib/policy';
import { BlockingScreen } from './BlockingScreen';

/** `maintenance`: the service is switched off for a while. Retry re-asks the server. */
export function MaintenanceScreen({ policy, checking, onRetry }: { policy: Policy; checking: boolean; onRetry: () => void }) {
  const { t, lang } = useLanguage();
  const until = formatIstDateTime(policy.maintenanceUntil, lang);
  return (
    <BlockingScreen
      title={t('ap_maint_title')}
      message={pickMessage(policy, lang, t('ap_maint_body'))}
      detail={until ? t('ap_maint_until').replace('{time}', until) : undefined}
      action={{ label: checking ? t('ap_checking') : t('ap_retry'), onPress: onRetry, loading: checking }}
    />
  );
}
