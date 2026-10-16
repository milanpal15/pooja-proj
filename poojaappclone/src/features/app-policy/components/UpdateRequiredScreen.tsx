import { useLanguage } from '@/i18n';

import { openStore } from '../lib/open-store';
import { pickMessage, type Policy } from '../lib/policy';
import { BlockingScreen } from './BlockingScreen';

/** `update_required`: the installed build is below the minimum. */
export function UpdateRequiredScreen({ policy }: { policy: Policy }) {
  const { t, lang } = useLanguage();
  return (
    <BlockingScreen
      title={t('ap_update_title')}
      message={pickMessage(policy, lang, t('ap_update_body'))}
      detail={policy.minVersionName ? t('ap_min_version').replace('{v}', policy.minVersionName) : undefined}
      action={policy.storeUrl ? { label: t('ap_update_cta'), onPress: () => openStore(policy.storeUrl) } : undefined}
    />
  );
}
