import { useState } from 'react';

import { useLanguage } from '@/i18n';
import { useAuth } from '@/providers/auth';

import { CreateProfileScreen } from './CreateProfileScreen';
import { LanguageScreen } from './LanguageScreen';
import { LoginScreen } from './LoginScreen';
import type { SignedInBy } from './types';

/**
 * language → sign in → Create Profile. Renders nothing once the devotee is
 * signed in; the caller decides what the app is.
 *
 * `signedInBy` lives here, not in the screens, so it survives the swap from
 * LoginScreen to CreateProfileScreen (it is the fallback for "ask for an
 * email?" until the pending profile arrives).
 */
export function AuthGate() {
  const { lang } = useLanguage();
  const { needsProfile } = useAuth();
  const [signedInBy, setSignedInBy] = useState<SignedInBy | null>(null);

  if (!lang) return <LanguageScreen />;
  if (needsProfile) return <CreateProfileScreen signedInBy={signedInBy} />;
  return <LoginScreen onSignedIn={setSignedInBy} />;
}
