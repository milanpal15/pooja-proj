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

import { Button, Field, Icon, IconButton, Mandala, Type } from '@/components/ui';
import { type AuthMethod, useAuth } from '@/context/auth';
import { useLanguage } from '@/context/language';
import { Fill, Radius, Space, useTheme } from '@/theme';

/**
 * Sign-in: Login Selection → Mobile/Email → OTP → Create Profile.
 *
 * Rebuilt on the design system; the state machine below is unchanged.
 *
 * ⚠️  The OTP here is still generated and compared **on the device**. That is
 * defect 2 in the low-level design and the reason phase P3 of the build plan
 * exists — anyone can type a stranger's number, read the code the app just
 * showed them, and become that account. The `demo_otp` hint is deliberately
 * visible so nobody mistakes this for working auth. Do not ship it.
 * P3-10 replaces this whole flow with `/v1/auth/otp/request` + `/verify`.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LEN = 4;

type Step = 'select' | 'entry' | 'otp' | 'profile';

export function LoginScreen() {
  const { signIn } = useAuth();
  const { t, lang, toggleLang } = useLanguage();

  const [step, setStep] = useState<Step>('select');
  const [method, setMethod] = useState<AuthMethod>('phone');
  const [contact, setContact] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const contactValid = useMemo(() => {
    if (method === 'email') return EMAIL_RE.test(contact.trim());
    return contact.replace(/\D/g, '').length === 10;
  }, [method, contact]);

  const startWith = useCallback((m: AuthMethod) => {
    setMethod(m);
    setContact('');
    setError('');
    setStep('entry');
  }, []);

  const sendOtp = useCallback(() => {
    if (!contactValid) return setError(method === 'email' ? t('err_email') : t('err_phone'));
    const code = String(Math.floor(1000 + Math.random() * 9000));
    setDemoOtp(code);
    setOtp('');
    setError('');
    setResendIn(45);
    setStep('otp');
  }, [contactValid, method, t]);

  const verifyOtp = useCallback(() => {
    if (otp !== demoOtp) return setError(t('err_otp'));
    setError('');
    setStep('profile');
  }, [otp, demoOtp, t]);

  const complete = useCallback(async () => {
    if (!name.trim()) return setError(t('err_name'));
    setBusy(true);
    await signIn({ name: name.trim(), method, contact: contact.trim(), bio: bio.trim() });
  }, [name, bio, method, contact, t, signIn]);

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
              emailLabel={t('login_with_email')}
              lang={lang}
              onToggleLang={toggleLang}
              onPick={startWith}
            />
          ) : (
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {step === 'entry' && (
                <Stack
                  title={method === 'email' ? t('entry_email_title') : t('entry_mobile_title')}
                  onBack={() => setStep('select')}>
                  <Field
                    label={method === 'email' ? t('ph_email') : t('ph_phone')}
                    icon={method === 'email' ? 'globe' : 'person'}
                    value={contact}
                    onChangeText={(v) => {
                      setContact(method === 'phone' ? v.replace(/\D/g, '').slice(0, 10) : v);
                      setError('');
                    }}
                    placeholder={method === 'email' ? 'you@example.com' : '9876543210'}
                    keyboardType={method === 'email' ? 'email-address' : 'number-pad'}
                    autoCapitalize="none"
                    error={error || undefined}
                    autoFocus
                  />
                  <Button
                    label={t('send_otp')}
                    size="lg"
                    block
                    disabled={!contactValid}
                    onPress={sendOtp}
                  />
                </Stack>
              )}

              {step === 'otp' && (
                <Stack title={t('otp_verification')} onBack={() => setStep('entry')}>
                  <Type v="bodyMd" tone="onSurfaceVariant" center>
                    {t('otp_sub_to')}{' '}
                    <Type v="titleMd">
                      {method === 'phone' ? `+91 ${contact}` : contact}
                    </Type>
                  </Type>

                  <OtpBoxes
                    value={otp}
                    onChange={(v) => {
                      setOtp(v);
                      setError('');
                    }}
                    inputRef={otpRef}
                    invalid={!!error}
                  />

                  {/* Only honest because the code never leaves the device.
                      Disappears with P3-10. */}
                  <DemoHint label={`${t('demo_otp')} ${demoOtp}`} />

                  {!!error && (
                    <Type v="labelMd" tone="error" center>
                      {error}
                    </Type>
                  )}

                  <View style={styles.resendRow}>
                    <Type v="bodySm" tone="onSurfaceFaint">
                      {resendIn > 0
                        ? `Resend code in 00:${String(resendIn).padStart(2, '0')}`
                        : 'Didn’t get the code?'}
                    </Type>
                    <Button
                      label="Resend"
                      variant="ghost"
                      size="sm"
                      disabled={resendIn > 0}
                      onPress={sendOtp}
                    />
                  </View>

                  <Button
                    label={t('verify_proceed')}
                    size="lg"
                    block
                    disabled={otp.length !== OTP_LEN}
                    onPress={verifyOtp}
                  />
                </Stack>
              )}

              {step === 'profile' && (
                <Stack title={t('create_profile')} onBack={() => setStep('otp')}>
                  <AvatarPicker label={t('change_photo')} initial={name.trim()[0]} />
                  <Field
                    label={t('full_name')}
                    value={name}
                    onChangeText={(v) => {
                      setName(v);
                      setError('');
                    }}
                    placeholder={t('ph_full_name')}
                    error={error || undefined}
                  />
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
                    disabled={!name.trim()}
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
  emailLabel,
  lang,
  onToggleLang,
  onPick,
}: {
  title: string;
  mobileLabel: string;
  emailLabel: string;
  lang: string | null;
  onToggleLang: () => void;
  onPick: (m: AuthMethod) => void;
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
        <Button label={mobileLabel} icon="person" iconRight="forward" size="lg" block onPress={() => onPick('phone')} />
        <Button
          label={emailLabel}
          variant="secondary"
          icon="globe"
          iconRight="forward"
          size="lg"
          block
          onPress={() => onPick('email')}
        />
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
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <View style={styles.header}>
        <IconButton name="back" label="Go back" size={40} onPress={onBack} />
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
 * Four boxes driven by one offscreen input — the platform keyboard and
 * autofill both behave far better with a single field than with four that
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

function DemoHint({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.demoHint, { backgroundColor: c.errorContainer, borderColor: c.error }]}>
      <Icon name="settings" size={14} color={c.error} />
      <Type v="labelSm" tone="error">
        {label}
      </Type>
    </View>
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

  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: Space.sm },
  otpBox: {
    width: 62,
    height: 68,
    borderRadius: Radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999 },

  demoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

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

