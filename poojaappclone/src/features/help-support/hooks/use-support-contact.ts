import { Linking } from 'react-native';

import { useToast } from '@/components/ui';
import {
  SUPPORT_EMAIL,
  SUPPORT_HOURS_EN,
  SUPPORT_HOURS_HI,
  SUPPORT_PHONE,
} from '@/constants/support';
import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';

/** Which support channels are configured, and the call / email actions. */
export function useSupportContact() {
  const { t, lang } = useLanguage();
  const toast = useToast();
  const { settingText } = useContent();

  /*
   * Dashboard first, then the env fallback from `constants/support.ts`.
   * Both empty means the channel is hidden rather than dialling a
   * placeholder — the app used to ship `support@shrimandir.devotee`, a TLD
   * that does not exist, and a vanity number somebody else may own.
   */
  const supportEmail = settingText('supportEmail') || SUPPORT_EMAIL;
  const supportPhone = settingText('supportPhone') || SUPPORT_PHONE;
  const supportHours =
    (lang === 'hi'
      ? settingText('supportHoursHi') || SUPPORT_HOURS_HI
      : settingText('supportHours') || SUPPORT_HOURS_EN) || '';
  const hasSupport = !!(supportEmail || supportPhone);

  const handleCallSupport = () => {
    Linking.openURL(`tel:${supportPhone}`).catch(() => {
      // No dialler on this device — show the number so it can be copied.
      toast.error(t('contact_support'), { description: supportPhone });
    });
  };

  const handleEmailSupport = () => {
    Linking.openURL(
      `mailto:${supportEmail}?subject=Devotee%20Support%20Request`,
    ).catch(() => {
      toast.error(t('contact_support'), { description: supportEmail });
    });
  };

  return {
    supportEmail,
    supportPhone,
    supportHours,
    hasSupport,
    handleCallSupport,
    handleEmailSupport,
  };
}
