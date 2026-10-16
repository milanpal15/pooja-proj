import { Linking } from 'react-native';

import { SUPPORT_EMAIL, SUPPORT_PHONE } from '@/constants/config';
import { BlockingScreen } from '@/features/app-policy';
import { useLanguage } from '@/i18n';
import { useContent } from '@/providers/content';

import {
  type BlockState,
  formatUntil,
  isEmail,
  mailUrl,
  pickBlockMessage,
  pickSupport,
  telUrl,
} from '../lib/blocked';

type Props = { state: BlockState; onTryAgain: () => void; onSignOut: () => void };

/** Full-screen "account / device blocked". The operator's words, when to expect relief, who to ask. */
export function AccountBlockedScreen({ state, onTryAgain, onSignOut }: Props) {
  const { t, lang } = useLanguage();
  const { settingText } = useContent();
  const block = state.block;
  if (!block) return null;

  const device = block.code === 'device_blocked';
  const support = pickSupport(block.support, {
    email: settingText('supportEmail') || SUPPORT_EMAIL,
    phone: settingText('supportPhone') || SUPPORT_PHONE,
  });
  const until = formatUntil(block.until, lang);
  const detail = [
    until ? t('ab_until').replace('{time}', until) : '',
    state.lastCheck === 'still' ? t('ab_still') : state.lastCheck === 'error' ? t('ab_check_failed') : '',
  ]
    .filter(Boolean)
    .join('\n');

  const secondary = [
    ...(support.phone ? [{ label: t('ab_call'), onPress: () => void Linking.openURL(telUrl(support.phone)).catch(() => {}), variant: 'outline' as const }] : []),
    ...(support.email && isEmail(support.email)
      ? [{ label: t('ab_email'), onPress: () => void Linking.openURL(mailUrl(support.email)).catch(() => {}), variant: 'outline' as const }]
      : []),
    { label: t('ab_sign_out'), onPress: onSignOut, variant: 'glass' as const },
  ];

  return (
    <BlockingScreen
      title={device ? t('ab_device_title') : t('ab_account_title')}
      message={pickBlockMessage(block, lang, device ? t('ab_device_body') : t('ab_account_body'))}
      detail={detail || undefined}
      action={{ label: state.checking ? t('ap_checking') : t('ab_try_again'), onPress: onTryAgain, loading: state.checking }}
      secondaryActions={secondary}
    />
  );
}
