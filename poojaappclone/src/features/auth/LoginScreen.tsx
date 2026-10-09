import { useLanguage } from '@/i18n';

import { AuthScroll } from './components/AuthScroll';
import { AuthShell } from './components/AuthShell';
import { OtpStep } from './components/OtpStep';
import { PhoneStep } from './components/PhoneStep';
import { SelectStep } from './components/SelectStep';
import { useLoginFlow } from './hooks/use-login-flow';
import type { SignedInBy } from './types';

/**
 * Sign-in: Login Selection → Mobile → OTP, or Google in one tap. Create
 * Profile is its own screen (`CreateProfileScreen`), chosen by `AuthGate`.
 *
 * The OTP is a real one. Firebase sends the SMS and verifies the code on its
 * servers; the app never sees or compares it, which is what makes this
 * different from the on-device `demoOtp` this screen used to generate.
 *
 * Android often verifies without any typing at all (SMS Retriever). When
 * that happens Firebase resolves the sign-in itself and `onAuthStateChanged`
 * fires — this screen simply unmounts mid-countdown. That is not a bug.
 */
export function LoginScreen({ onSignedIn }: { onSignedIn?: (by: SignedInBy) => void }) {
  const { t, lang, toggleLang } = useLanguage();
  const f = useLoginFlow(onSignedIn);
  const { shownError } = f.errs;

  return (
    <AuthShell>
      {f.step === 'select' ? (
        <SelectStep
          title={t('login_selection_title')}
          mobileLabel={t('login_with_mobile')}
          googleLabel={t('login_with_google')}
          showMobile={f.phoneEnabled}
          error={shownError}
          busy={f.busy}
          lang={lang}
          onToggleLang={toggleLang}
          onMobile={f.chooseMobile}
          onGoogle={f.google}
        />
      ) : (
        <AuthScroll>
          {f.step === 'entry' && (
            <PhoneStep
              phone={f.otp.phone}
              onChangePhone={f.otp.acceptPhone}
              valid={f.otp.phoneValid}
              error={shownError}
              busy={f.busy}
              onSend={f.otp.sendOtp}
              onBack={() => f.goTo('select')}
            />
          )}
          {f.step === 'otp' && (
            <OtpStep
              phone={f.otp.phone}
              otp={f.otp.otp}
              onChangeOtp={f.otp.changeOtp}
              otpRef={f.otp.otpRef}
              error={shownError}
              resendIn={f.otp.resendIn}
              busy={f.busy}
              onResend={f.otp.sendOtp}
              onVerify={f.otp.verifyOtp}
              onBack={() => f.goTo('entry')}
            />
          )}
        </AuthScroll>
      )}
    </AuthShell>
  );
}
