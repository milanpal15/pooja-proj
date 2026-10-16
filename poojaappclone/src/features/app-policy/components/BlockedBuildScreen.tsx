import { useLanguage } from '@/i18n';

import { openStore } from '../lib/open-store';
import { pickMessage, type Policy } from '../lib/policy';
import { BlockingScreen } from './BlockingScreen';

/** `blocked`: this exact build was turned off by the operators. */
export function BlockedBuildScreen({ policy }: { policy: Policy }) {
  const { t, lang } = useLanguage();
  return (
    <BlockingScreen
      title={t('ap_blocked_title')}
      message={pickMessage(policy, lang, t('ap_blocked_body'))}
      detail={policy.minVersionName ? t('ap_min_version').replace('{v}', policy.minVersionName) : undefined}
      action={policy.storeUrl ? { label: t('ap_update_cta'), onPress: () => openStore(policy.storeUrl) } : undefined}
    />
  );
}
