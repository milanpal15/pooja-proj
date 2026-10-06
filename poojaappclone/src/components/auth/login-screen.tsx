import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  Chip,
  Field,
  Icon,
  IconButton,
  Mandala,
  Type,
} from '@/components/ui';
import { GOOGLE_WEB_CLIENT_ID } from '@/constants/config';
import { useAdmin } from '@/context/admin';
import { useAuth } from '@/context/auth';
import { type StringKey, useLanguage } from '@/context/language';
import {
  type AuthError,
  confirmOtp,
  type OtpConfirmation,
  requestOtp,
  signInWithGoogle,
} from '@/lib/firebase-auth';
import type { Gender } from '@/lib/api';
import { Fill, Radius, Space, useTheme } from '@/theme';

/**
 * Sign-in: Login Selection → Mobile → OTP → Create Profile, or Google in one tap.
 *
 * The OTP is a real one. Firebase sends the SMS and verifies the code on its
 * servers; the app never sees or compares it, which is what makes this
 * different from the on-device `demoOtp` this screen used to generate.
 *
 * Two consequences worth knowing:
 *  - Android often verifies without any typing at all (SMS Retriever). When
 *    that happens Firebase resolves the sign-in itself and `onAuthStateChanged`
 *    fires — this screen simply unmounts mid-countdown. That is not a bug.
 *  - `needsProfile` means Firebase already accepted the credential but the
 *    account has no name. We open straight at Create Profile; making them
 *    redo the SMS would cost another verification for nothing.
 */

const OTP_LEN = 6; // Firebase SMS codes are six digits.
const RESEND_SECONDS = 45;

type Step = 'select' | 'entry' | 'otp' | 'profile';


/** The four options, in the order they are shown. */
const GENDERS: { value: Gender; labelKey: StringKey }[] = [
  { value: 'female', labelKey: 'gender_female' },
  { value: 'male', labelKey: 'gender_male' },
  { value: 'other', labelKey: 'gender_other' },
  { value: 'prefer_not_to_say', labelKey: 'gender_private' },
];

/**
 * Date of birth as three numeric boxes.
 *
 * Deliberately not a platform date picker: that is another native module
 * and another rebuild, and a wheel scrolled back sixty years is worse than
 * typing a year. Emits YYYY-MM-DD, or '' while incomplete, so the caller
 * only ever sees a whole date or nothing.
 */
function DobField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { c } = useTheme();
  const [d, m, y] = value ? [value.slice(8, 10), value.slice(5, 7), value.slice(0, 4)] : ['', '', ''];

  const emit = (dd: string, mm: string, yyyy: string) => {
    if (dd.length === 2 && mm.length === 2 && yyyy.length === 4) {
      onChange(`${yyyy}-${mm}-${dd}`);
    } else {
      onChange('');
    }
  };

  const box = (
    val: string,
    place: string,
    len: number,
    set: (v: string) => void,
    flex: number,
  ) => (
    <TextInput
      value={val}
      placeholder={place}
      placeholderTextColor={c.onSurfaceFaint}
      keyboardType="number-pad"
      maxLength={len}
      onChangeText={(t) => set(t.replace(/[^0-9]/g, '').slice(0, len))}
      style={[
        styles.dobBox,
        { flex, color: c.onSurface, borderColor: c.outlineVariant, backgroundColor: c.containerLowest },
      ]}
    />
  );

  return (
    <View style={{ gap: 6 }}>
      <Type v="labelMd" tone="onSurfaceVariant">
        {label}
      </Type>
      <View style={styles.dobRow}>
        {box(d, 'DD', 2, (v) => emit(v, m, y), 1)}
        {box(m, 'MM', 2, (v) => emit(d, v, y), 1)}
        {box(y, 'YYYY', 4, (v) => emit(d, m, v), 1.6)}
      </View>
    </View>
  );
}

export function LoginScreen() {
  const { completeProfile, needsProfile, authError, clearAuthError } = useAuth();
  const { t, lang, toggleLang } = useLanguage();
  /*
   * SMS OTP is gated because Firebase bills per message and refuses to send
   * at all without a Blaze billing account. Off, the screen offers Google
   * only rather than a button that always fails.
   */
  const { flags } = useAdmin();
  const phoneEnabled = flags.phoneAuth;

  const [localStep, setStep] = useState<Step>('select');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  /** YYYY-MM-DD, typed as three parts so no date picker native module is needed. */
  const [dob, setDob] = useState('');
  const [email, setEmail] = useState('');
  /**
   * Which provider just succeeded.
   *
   * Decides whether the profile step asks for an email: phone sign-in
   * supplies none, Google supplies a verified one.
   */
  const [signedInBy, setSignedInBy] = useState<'phone' | 'google' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const confirmation = useRef<OtpConfirmation | null>(null);
  const otpRef = useRef<TextInput>(null);

  /*
   * The provider outranks local navigation, so both are derived here rather
   * than copied into state by an effect:
   *  - `needsProfile` — Firebase accepted the credential but the account has
   *    no name, so Create Profile is the only step that makes sense.
   *  - `authError` — the session was just dropped (a blocked account), so
   *    whatever step we were on no longer exists to go back to.
   */
  const step: Step =
    needsProfile
      ? 'profile'
      : authError
        ? 'select'
        : // If the flag flips off mid-flow, fall back rather than strand the
          // devotee on a step whose Send OTP can no longer work.
          !phoneEnabled && (localStep === 'entry' || localStep === 'otp')
          ? 'select'
          : localStep;
  const shownError = authError ? t(authError) : error;

  /** Any fresh attempt clears the last failure, local or provider-side. */
  const resetError = useCallback(() => {
    setError('');
    clearAuthError();
  }, [clearAuthError]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const phoneValid = useMemo(() => phone.replace(/\D/g, '').length === 10, [phone]);

  /**
   * Normalise whatever arrived — typed, pasted, or autofilled — down to the
   * ten digits the field accepts. Autofill hands over `+91 98765 43210`.
   */
  const acceptPhone = useCallback(
    (raw: string) => {
      const digits = raw.replace(/\D/g, '');
      const local = digits.startsWith('91') && digits.length > 10 ? digits.slice(2) : digits;
      setPhone(local.slice(0, 10));
      resetError();
    },
    [resetError],
  );

  /** Turn an AuthError into a shown message; cancellations stay silent. */
  const show = useCallback(
    (e: unknown) => {
      const err = e as AuthError;
      if (err?.code === 'cancelled') return;
      const key = err?.message || 'err_signin_failed';
      if (err?.detail) console.warn('[auth]', err.code, err.detail);
      setError(t(key));
    },
    [t],
  );

  const sendOtp = useCallback(async () => {
    if (!phoneValid) return setError(t('err_phone'));
    setBusy(true);
    resetError();
    try {
      confirmation.current = await requestOtp(phone);
      setOtp('');
      setResendIn(RESEND_SECONDS);
      setStep('otp');
    } catch (e) {
      show(e);
    } finally {
      setBusy(false);
    }
  }, [phone, phoneValid, resetError, show, t]);

  const verifyOtp = useCallback(async () => {
    if (!confirmation.current) return setError(t('err_otp_expired'));
    setBusy(true);
    resetError();
    try {
      await confirmOtp(confirmation.current, otp);
      setSignedInBy('phone');
      // On success the auth provider takes over: it syncs the backend profile
      // and either signs us in or flips `needsProfile`, which moves this
      // screen to 'profile'. Nothing to do here.
    } catch (e) {
      show(e);
    } finally {
      setBusy(false);
    }
  }, [otp, resetError, show, t]);

  const google = useCallback(async () => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      return setError(t('err_google_not_configured'));
    }
    setBusy(true);
    resetError();
    try {
      await signInWithGoogle();
      setSignedInBy('google');
    } catch (e) {
      show(e);
    } finally {
      setBusy(false);
    }
  }, [resetError, show, t]);

  /**
   * Phone sign-in carries no email, so we ask for one. Google already
   * supplied a verified address — asking again would be asking for
   * something we have.
   */
  const needsEmail = signedInBy === 'phone';

  const complete = useCallback(async () => {
    if (!name.trim()) return setError(t('err_name'));
    if (!gender) return setError(t('err_gender'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return setError(t('err_dob'));
    if (dob > new Date().toISOString().slice(0, 10)) return setError(t('err_dob_future'));
    if (needsEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return setError(t('err_email'));
    }

    setBusy(true);
    resetError();
    try {
      await completeProfile({
        name: name.trim(),
        bio: bio.trim(),
        gender,
        dob,
        ...(needsEmail ? { email: email.trim() } : {}),
      });
    } catch (e) {
      show(e);
    } finally {
      setBusy(false);
    }
  }, [name, bio, gender, dob, email, needsEmail, completeProfile, resetError, show, t]);

  return (
    <Backdrop>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {step === 'select' ? (
            <SelectStep
              title={t('login_selection_title')}
              mobileLabel={t('login_with_mobile')}
              googleLabel={t('login_with_google')}
              showMobile={phoneEnabled}
              error={shownError}
              busy={busy}
              lang={lang}
              onToggleLang={toggleLang}
              onMobile={() => {
                setPhone('');
                resetError();
                setStep('entry');
              }}
              onGoogle={google}
            />
          ) : (
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {step === 'entry' && (
                <Stack
                  title={t('entry_mobile_title')}
                  onBack={() => {
                    resetError();
                    setStep('select');
                  }}>
                  <Field
                    label={t('ph_phone')}
                    icon="person"
                    value={phone}
                    onChangeText={acceptPhone}
                    /*
                     * Android autofill can write straight into the native view
                     * without `onChangeText` firing, which left a number
                     * sitting in the box while React still thought it empty —
                     * so Send OTP stayed disabled on a field that visibly had
                     * a number in it. `onChange` catches the autofill write,
                     * and declaring `autoComplete` lets the platform target
                     * the field properly in the first place.
                     */
                    onChange={(e) => acceptPhone(e.nativeEvent.text)}
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    placeholder="9876543210"
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    error={shownError || undefined}
                    autoFocus
                  />
                  <Type v="bodySm" tone="onSurfaceFaint" center>
                    {t('otp_sms_note')}
                  </Type>
                  <Button
                    label={t('send_otp')}
                    size="lg"
                    block
                    loading={busy}
                    disabled={!phoneValid || busy}
                    onPress={sendOtp}
                  />
                </Stack>
              )}

              {step === 'otp' && (
                <Stack
                  title={t('otp_verification')}
                  onBack={() => {
                    resetError();
                    setStep('entry');
                  }}>
                  <Type v="bodyMd" tone="onSurfaceVariant" center>
                    {t('otp_sub_to')} <Type v="titleMd">+91 {phone}</Type>
                  </Type>

                  <OtpBoxes
                    value={otp}
                    onChange={(v) => {
                      setOtp(v);
                      resetError();
                    }}
                    inputRef={otpRef}
                    invalid={!!shownError}
                  />

                  {!!shownError && (
                    <Type v="labelMd" tone="error" center>
                      {shownError}
                    </Type>
                  )}

                  <View style={styles.resendRow}>
                    <Type v="bodySm" tone="onSurfaceFaint">
                      {resendIn > 0
                        ? `${t('resend_in')} 00:${String(resendIn).padStart(2, '0')}`
                        : t('no_code')}
                    </Type>
                    <Button
                      label={t('resend')}
                      variant="ghost"
                      size="sm"
                      disabled={resendIn > 0 || busy}
                      onPress={sendOtp}
                    />
                  </View>

                  <Button
                    label={t('verify_proceed')}
                    size="lg"
                    block
                    loading={busy}
                    disabled={otp.length !== OTP_LEN || busy}
                    onPress={verifyOtp}
                  />
                </Stack>
              )}

              {step === 'profile' && (
                <Stack
                  title={t('create_profile')}
                  onBack={
                    needsProfile
                      ? undefined
                      : () => {
                          resetError();
                          setStep('otp');
                        }
                  }>
                  <AvatarPicker label={t('change_photo')} initial={name.trim()[0]} />
                  <Field
                    label={t('full_name')}
                    value={name}
                    onChangeText={(v) => {
                      setName(v);
                      resetError();
                    }}
                    placeholder={t('ph_full_name')}
                    error={shownError || undefined}
                  />
                  <View style={{ gap: 6 }}>
                    <Type v="labelMd" tone="onSurfaceVariant">
                      {t('gender_label')}
                    </Type>
                    <View style={styles.genderRow}>
                      {GENDERS.map((g) => (
                        <Chip
                          key={g.value}
                          label={t(g.labelKey)}
                          selected={gender === g.value}
                          onPress={() => {
                            setGender(g.value);
                            resetError();
                          }}
                        />
                      ))}
                    </View>
                  </View>

                  <DobField
                    label={t('dob_label')}
                    value={dob}
                    onChange={(v) => {
                      setDob(v);
                      resetError();
                    }}
                  />

                  {/* Phone sign-in gives us no email; Google already did. */}
                  {needsEmail && (
                    <Field
                      label={t('email_label')}
                      value={email}
                      onChangeText={(v) => {
                        setEmail(v);
                        resetError();
                      }}
                      placeholder={t('ph_email')}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                    />
                  )}
                  {needsEmail && (
                    <Type v="bodySm" tone="onSurfaceFaint">
                      {t('email_why')}
                    </Type>
                  )}

                  <Field
                    label={t('bio_label')}
                    value={bio}
                    onChangeText={setBio}
                    placeholder={t('ph_bio')}
                    multilineRows={3}
                  />
                  <Button
                    label={t('complete_profile')}
                    size="lg"
                    block
                    loading={busy}
                    disabled={!name.trim() || !gender || dob.length !== 10 || busy}
                    onPress={complete}
                  />
                </Stack>
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Backdrop>
  );
}

/* ─────────────────────────────────────────────────────────── backdrop ── */

function Backdrop({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, overflow: 'hidden' }}>
      <LinearGradient
        colors={[c.accentContainer, c.surface, c.accentContainer]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[Fill, { pointerEvents: 'none' }]}
      />
      <Mandala size={360} opacity={0.08} style={styles.mandalaTop} />
      <Mandala size={300} opacity={0.07} petals={12} style={styles.mandalaBottom} />
      {children}
    </View>
  );
}

/* ────────────────────────────────────────────────────────────── steps ── */

function SelectStep({
  title,
  mobileLabel,
  googleLabel,
  showMobile,
  error,
  busy,
  lang,
  onToggleLang,
  onMobile,
  onGoogle,
}: {
  title: string;
  mobileLabel: string;
  googleLabel: string;
  /** False while SMS OTP is switched off — Google becomes the only route. */
  showMobile: boolean;
  error: string;
  busy: boolean;
  lang: string | null;
  onToggleLang: () => void;
  onMobile: () => void;
  onGoogle: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.selectWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch language"
        onPress={onToggleLang}
        hitSlop={12}
        style={[styles.langPill, { borderColor: c.goldHairline, backgroundColor: c.containerLowest }]}>
        <Icon name="globe" size={15} color={c.goldInk} />
        <Type v="labelMd" tone="goldInk">
          {lang === 'en' ? 'हि' : 'EN'}
        </Type>
      </Pressable>

      <View style={styles.selectHead}>
        <Type v="headlineLg" tone="goldInk" center>
          {title}
        </Type>
        <Type v="display" tone="primary" center style={styles.omBig}>
          ॐ
        </Type>
      </View>

      <View style={styles.selectButtons}>
        {showMobile && (
          <Button
            label={mobileLabel}
            icon="person"
            iconRight="forward"
            size="lg"
            block
            disabled={busy}
            onPress={onMobile}
          />
        )}
        <Button
          label={googleLabel}
          // Sole route while mobile is off, so it takes the primary weight.
          variant={showMobile ? 'secondary' : 'primary'}
          icon="google"
          iconRight="forward"
          size="lg"
          block
          loading={busy}
          disabled={busy}
          onPress={onGoogle}
        />
        {!!error && (
          <Type v="labelMd" tone="error" center>
            {error}
          </Type>
        )}
      </View>

      <Type v="mantra" tone="onSurfaceVariant" center style={styles.tagline}>
        भक्ति में ही शांति है, और समर्पण में ही शक्ति।
      </Type>
    </View>
  );
}

function Stack({
  title,
  onBack,
  children,
}: {
  title: string;
  /** Omitted when there is nowhere to go back to (a half-finished sign-in). */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <View style={styles.header}>
        {onBack ? (
          <IconButton name="back" label="Go back" size={40} onPress={onBack} />
        ) : (
          <View style={{ width: 40 }} />
        )}
        <Type v="headlineMd" tone="goldInk" center style={{ flex: 1 }}>
          {title}
        </Type>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.stackBody}>{children}</View>
    </>
  );
}

/* ─────────────────────────────────────────────────────────── otp input ── */

/**
 * Six boxes driven by one offscreen input — the platform keyboard and
 * autofill both behave far better with a single field than with six that
 * hand focus to each other.
 */
function OtpBoxes({
  value,
  onChange,
  inputRef,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<TextInput | null>;
  invalid: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Enter the verification code"
      onPress={() => inputRef.current?.focus()}
      style={styles.otpRow}>
      {Array.from({ length: OTP_LEN }, (_, i) => {
        const filled = i < value.length;
        const cursor = i === value.length;
        return (
          <View
            key={i}
            style={[
              styles.otpBox,
              {
                backgroundColor: c.containerLowest,
                borderColor: invalid ? c.error : cursor ? c.gold : c.outlineVariant,
              },
            ]}>
            <Type v="headlineMd" numeric>
              {filled ? value[i] : ''}
            </Type>
          </View>
        );
      })}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, OTP_LEN))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LEN}
        autoFocus
        // Offscreen rather than opacity:0 — a zero-opacity input still steals
        // taps from the boxes on Android.
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

function AvatarPicker({ label, initial }: { label: string; initial?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.avatarWrap}>
      <View style={[styles.avatarRing, { borderColor: c.gold }]}>
        <View style={[styles.avatar, { backgroundColor: c.accentContainer }]}>
          <Type v="numeral" tone="goldInk">
            {initial?.toUpperCase() || 'ॐ'}
          </Type>
        </View>
      </View>
      <Button label={label} variant="ghost" size="sm" icon="plus" />
    </View>
  );
}

/* ───────────────────────────────────────────────────────────── styles ── */

const styles = StyleSheet.create({
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs },
  dobRow: { flexDirection: 'row', gap: Space.xs },
  dobBox: {
    height: 52,
    borderWidth: 1.2,
    borderRadius: Radius.md,
    textAlign: 'center',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 8,
  },
  scroll: { padding: Space.margin, paddingBottom: Space.xxl },
  mandalaTop: { position: 'absolute', top: -100, left: -120 },
  mandalaBottom: { position: 'absolute', bottom: -80, right: -90 },

  selectWrap: { flex: 1, padding: Space.lg, justifyContent: 'center', gap: Space.xl },
  langPill: {
    position: 'absolute',
    top: Space.md,
    right: Space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  selectHead: { alignItems: 'center', gap: Space.md },
  omBig: { fontSize: 64, lineHeight: 76 },
  selectButtons: { gap: Space.sm },
  tagline: { paddingHorizontal: Space.sm },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Space.lg },
  stackBody: { gap: Space.md },

  // Six boxes have to be narrower than the old four to still fit a 360dp screen.
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: Space.xs },
  otpBox: {
    width: 46,
    height: 60,
    borderRadius: Radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999 },

  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },

  avatarWrap: { alignItems: 'center', gap: Space.xs },
  avatarRing: {
    width: 116,
    height: 116,
    borderRadius: Radius.full,
    borderWidth: 3,
    padding: 4,
  },
  avatar: {
    flex: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
