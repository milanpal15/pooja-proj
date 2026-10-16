import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, type IconName, Type, useToast } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { EventDetail, EventMe } from '@/lib/api';
import { Radius, useTheme } from '@/theme';

import { directionsUrl, fill, venueLine, whenLine } from '../lib/events-logic';
import { canLeave, formFields, joinPlan } from '../lib/registration';
import { useJoin } from '../hooks/use-join';
import { JoinSheet } from './JoinSheet';
import { PassCard } from './PassCard';

function Card({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>{children}</View>;
}

function Line({ icon, children, action }: { icon: IconName; children: React.ReactNode; action?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.line}>
      <Icon name={icon} size={18} color={c.primary} />
      <View style={styles.flex}>{children}</View>
      {action}
    </View>
  );
}

const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

/** `schedule` block: the date row. */
export function ScheduleBlock({ event }: { event: EventDetail }) {
  const { t } = useLanguage();
  const s = event.schedule;
  if (!s) return null;
  const when = whenLine(s);
  return (
    <Card>
      <Line icon="calendar">
        <Type v="bodyMd">{when || (s.mode === 'always' ? t('ev_open_any') : '')}</Type>
      </Line>
    </Card>
  );
}

/** `venue` block: where, the organiser, an online link, and Directions. */
export function VenueBlock({ event }: { event: EventDetail }) {
  const { t } = useLanguage();
  const { c } = useTheme();
  const v = event.venue;
  if (!v) return null;
  const where = venueLine(v);
  const dir = directionsUrl(v);
  const online = /^https:\/\//i.test(v.onlineUrl ?? '') ? v.onlineUrl! : null;
  if (!where && !v.address && !online && !v.organiser) return null;
  return (
    <Card>
      {(!!where || !!v.address) && (
        <Line
          icon="mapPin"
          action={
            dir ? (
              <Pressable accessibilityRole="link" onPress={() => openUrl(dir)} hitSlop={10}>
                <Type v="labelMd" tone="primary">
                  {t('ev_directions')}
                </Type>
              </Pressable>
            ) : undefined
          }>
          {!!where && <Type v="bodyMd">{where}</Type>}
          {!!v.address && (
            <Type v="bodySm" tone="onSurfaceVariant">
              {v.address}
            </Type>
          )}
        </Line>
      )}
      {!!online && (
        <Line
          icon="globe"
          action={
            <Pressable accessibilityRole="link" onPress={() => openUrl(online)} hitSlop={10}>
              <Type v="labelMd" tone="primary">
                {t('ev_join_online')}
              </Type>
            </Pressable>
          }>
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
            {online.replace(/^https:\/\//i, '')}
          </Type>
        </Line>
      )}
      {!!v.organiser && (
        <Line icon="user">
          <Type v="bodySm" color={c.onSurface}>
            {fill(t('ev_hosted'), { name: v.organiser })}
          </Type>
        </Line>
      )}
    </Card>
  );
}

/**
 * `registration` block: entry, `registered` / `spotsLeft` ONLY when the server sent a number, and what
 * the caller can do about it — Join (free events; a form first when the event asks questions), the QR
 * pass once joined, and Leave before the start. What is offered comes from `joinPlan` (data only).
 */
export function RegistrationBlock({
  event,
  now,
  setMe,
  reload,
}: {
  event: EventDetail;
  now: number;
  setMe: (me: EventMe | null) => void;
  reload: () => void;
}) {
  const { t } = useLanguage();
  const { c } = useTheme();
  const toast = useToast();
  const { join, leave, busy, signedIn } = useJoin(event, setMe, reload);
  const [formOpen, setFormOpen] = useState(false);
  const r = event.registration;
  const plan = joinPlan(event, now);
  if (!r || plan === 'none') return null;
  const fields = formFields(event);
  const entry = r.mode === 'coins' && (r.coins ?? 0) > 0 ? fill(t('ev_coins_entry'), { n: r.coins ?? 0 }) : t('ev_free_entry');
  const counts = [
    event.registered !== null && event.registered !== undefined ? fill(t('ev_registered'), { n: event.registered }) : '',
    event.spotsLeft !== null && event.spotsLeft !== undefined ? fill(t('ev_spots'), { n: event.spotsLeft }) : '',
  ].filter(Boolean);
  const me = event.me;
  const passCode = r.pass !== false && me?.passCode ? me.passCode : null;

  const press = async () => {
    if (!signedIn) {
      toast.error(t('ev_join_signin'));
      return;
    }
    if (fields.length > 0) {
      setFormOpen(true);
      return;
    }
    const failure = await join({});
    if (failure) toast.error(t(failure.key));
    else toast.success(t('ev_joined_toast'));
  };

  const submitForm = async (answers: Record<string, string | number>) => {
    const failure = await join(answers);
    if (!failure) {
      setFormOpen(false);
      toast.success(t('ev_joined_toast'));
    }
    return failure;
  };

  const note = (text: string) => (
    <View accessibilityRole="button" accessibilityState={{ disabled: true }} style={[styles.disabledCta, { backgroundColor: c.container }]}>
      <Type v="labelLg" tone="onSurfaceFaint">
        {text}
      </Type>
    </View>
  );

  return (
    <View style={styles.stack}>
      <Card>
        <Line icon="gift">
          <Type v="bodyMd">{entry}</Type>
        </Line>
        {counts.length > 0 && (
          <Line icon="user">
            <Type v="bodyMd" numeric>
              {counts.join(' · ')}
            </Type>
          </Line>
        )}
        {plan === 'registered' && !passCode && (
          <Line icon="check">
            <Type v="titleSm">{t('ev_you_registered')}</Type>
          </Line>
        )}
        {plan === 'join' && <Button label={t('ev_join')} loading={busy && !formOpen} disabled={busy} block onPress={press} />}
        {plan === 'opens_soon' && note(t('ev_reg_soon'))}
        {plan === 'full' && note(t('ev_join_full'))}
        {plan === 'closed' && note(t('ev_join_closed'))}
        {plan === 'paid_soon' && note(t('ev_paid_soon'))}
      </Card>
      {plan === 'registered' && !!passCode && <PassCard code={passCode} />}
      {plan === 'registered' && canLeave(event, now) && (
        <Button label={t('ev_leave')} variant="ghost" disabled={busy} onPress={leave} />
      )}
      <JoinSheet visible={formOpen} fields={fields} busy={busy} onClose={() => setFormOpen(false)} onSubmit={submitForm} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  card: { borderRadius: Radius.lg + 2, borderWidth: 1, padding: 14, gap: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  disabledCta: { height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
});


