import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { useCallback } from 'react';

import { useToast } from '@/components/ui';
import { useLanguage } from '@/i18n';

import { resolveHref } from '../lib/href';

/**
 * Follow a dashboard-authored link: in-app routes through the router,
 * `https://` in the browser, anything else refused. Returns whether the link
 * was understood, so a caller can fall back to its own default.
 */
export function useOpenHref() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();

  return useCallback(
    (href: string | null | undefined): boolean => {
      const target = resolveHref(href);
      if (!target) return false;
      if (target.kind === 'route') {
        router.push(target.path as never);
      } else {
        Linking.openURL(target.url).catch(() => toast.error(t('hl_link_failed')));
      }
      return true;
    },
    [router, toast, t],
  );
}
