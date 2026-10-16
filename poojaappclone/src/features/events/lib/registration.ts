/**
 * Joining an event — pure decisions and validation (registration.test.mjs).
 * Nothing here branches on an event TYPE: it reads the registration block and the caller's `me`.
 */
import type { EventDetail, RegistrationField } from '@/lib/api';

import { toMs } from './events-logic';

export type JoinPlan =
  /** Already joined: show the pass. */
  | 'registered'
  /** The Join button. */
  | 'join'
  | 'full'
  | 'closed'
  | 'opens_soon'
  /** Coin-priced joining is not available yet (docs/EVENTS.md phase 5): no button. */
  | 'paid_soon'
  | 'none';

/** What the registration block offers right now, from the data only. */
export function joinPlan(e: Pick<EventDetail, 'registration' | 'status' | 'blocks' | 'full' | 'me' | 'spotsLeft'>, now: number): JoinPlan {
  const r = e.registration;
  if (!r || !e.blocks.includes('registration') || !r.mode || r.mode === 'none') return 'none';
  if (e.me?.registered) return 'registered';
  if (r.mode !== 'free') return 'paid_soon';
  if (e.status === 'ended' || e.status === 'draft') return 'closed';
  const opens = toMs(r.opensAt);
  if (opens !== null && opens > now) return 'opens_soon';
  const closes = toMs(r.closesAt);
  if (closes !== null && closes <= now) return 'closed';
  if (e.full || e.spotsLeft === 0) return 'full';
  return 'join';
}

/** Leaving is for free events, before the start (the server enforces it too). */
export function canLeave(e: Pick<EventDetail, 'registration' | 'me' | 'schedule' | 'startsAt'>, now: number): boolean {
  if (!e.me?.registered || e.registration?.mode !== 'free') return false;
  const start = toMs(e.schedule?.startsAt ?? e.startsAt);
  return start !== null && start > now;
}

/** The fields the devotee must fill in (known types only; an unknown type is skipped, not required). */
export function formFields(e: Pick<EventDetail, 'registration'>): RegistrationField[] {
  return (e.registration?.fields ?? []).filter((f) => f && typeof f.key === 'string' && f.key && ['text', 'choice', 'number'].includes(f.type));
}

export const fieldLabel = (f: Pick<RegistrationField, 'label' | 'labelHi'>, lang: string | null) => (lang === 'hi' && f.labelHi?.trim() ? f.labelHi : f.label);

export type AnswerError = 'required' | 'number' | 'choice';

/** Validates the raw form (strings) against the fields. `errors` has one entry per bad field. */
export function validateAnswers(fields: readonly RegistrationField[], raw: Record<string, string | undefined>): { ok: boolean; errors: Record<string, AnswerError> } {
  const errors: Record<string, AnswerError> = {};
  for (const f of fields) {
    const v = (raw[f.key] ?? '').trim();
    if (v === '') {
      if (f.required) errors[f.key] = 'required';
      continue;
    }
    if (f.type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) errors[f.key] = 'number';
    else if (f.type === 'choice' && (f.options ?? []).length > 0 && !(f.options ?? []).includes(v)) errors[f.key] = 'choice';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** The `answers` to send: trimmed, numbers as numbers, blank optional fields left out. */
export function cleanAnswers(fields: readonly RegistrationField[], raw: Record<string, string | undefined>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of fields) {
    const v = (raw[f.key] ?? '').trim();
    if (v === '') continue;
    out[f.key] = f.type === 'number' ? Number(v) : v;
  }
  return out;
}

export type JoinFailure = {
  /** i18n key for the message. */
  key: 'ev_join_full' | 'ev_join_closed' | 'ev_join_paid' | 'ev_join_missing' | 'ev_join_bad' | 'ev_join_signin' | 'ev_join_offline' | 'ev_join_failed';
  /** For `missing_field`: which field to mark. */
  field?: string;
  /** The event's numbers or status changed: re-read the detail. */
  reload: boolean;
};

/** Maps a join error to what the screen says. `status` 0 means the request never got an answer. */
export function joinFailure(status: number, code?: string, body?: Record<string, unknown>): JoinFailure {
  if (status === 409 && code === 'full') return { key: 'ev_join_full', reload: true };
  if (status === 409 && code === 'closed') return { key: 'ev_join_closed', reload: true };
  if (status === 409 && code === 'paid_not_available') return { key: 'ev_join_paid', reload: false };
  if (status === 400 && code === 'missing_field') return { key: 'ev_join_missing', field: typeof body?.field === 'string' ? body.field : undefined, reload: false };
  if (status === 400) return { key: 'ev_join_bad', reload: false };
  if (status === 401) return { key: 'ev_join_signin', reload: false };
  if (status === 0) return { key: 'ev_join_offline', reload: false };
  return { key: 'ev_join_failed', reload: false };
}
