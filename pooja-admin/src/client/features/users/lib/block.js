import { isoToLocalInput, localInputToIso } from '../../../lib/dates.js';

/** The Block… form (docs/USERS.md §2, §5): validation, the request body, and the model behind the phone preview. */
export const LIMIT = 300;

export function blankBlockForm(user) {
  const b = user?.block?.active ? user.block : null;
  return {
    reason: b?.reason ?? '',
    message: b?.message ?? '',
    messageHi: b?.messageHi ?? '',
    mode: b?.until ? 'until' : 'forever',
    until: b?.until ? isoToLocalInput(b.until) : '',
    alsoDevices: false,
  };
}

export const isDirty = (form, base) => ['reason', 'message', 'messageHi', 'mode', 'until', 'alsoDevices'].some((k) => form[k] !== base[k]);

/** "12 / 300", and whether it is over. */
export function counter(text, limit = LIMIT) {
  const used = [...String(text ?? '')].length;
  return { used, left: limit - used, over: used > limit, label: `${used} / ${limit}` };
}

/** @returns {Record<string,string>} field -> message; empty means valid. `now` is injected for tests. */
export function validateBlock(form, now = new Date()) {
  const e = {};
  if (!form.reason.trim()) e.reason = 'Say why. Only operators see this.';
  else if (counter(form.reason).over) e.reason = `At most ${LIMIT} characters.`;
  if (!form.message.trim()) e.message = 'Write the message the person will read in the app.';
  else if (counter(form.message).over) e.message = `At most ${LIMIT} characters.`;
  if (counter(form.messageHi).over) e.messageHi = `At most ${LIMIT} characters.`;
  if (form.mode === 'until') {
    const iso = localInputToIso(form.until);
    if (!iso) e.until = 'Pick the date and time the block ends.';
    else if (new Date(iso) <= now) e.until = 'The end must be in the future.';
  }
  return e;
}

export function toBlockBody(form) {
  const body = {
    reason: form.reason.trim(),
    message: form.message.trim(),
    until: form.mode === 'until' ? localInputToIso(form.until) : null,
    alsoBlockDevices: !!form.alsoDevices,
  };
  if (form.messageHi.trim()) body.messageHi = form.messageHi.trim();
  return body;
}

/** The API's `400 bad_block { fields }` mapped onto the form's field names. */
export function serverFields(err) {
  const f = err?.body?.fields;
  if (!f || typeof f !== 'object') return {};
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v : 'Not accepted.']));
}

const TITLE = { en: 'Account blocked', hi: 'खाता ब्लॉक है' };
const DEFAULT_MSG = {
  en: 'Your account has been blocked. Please contact support if you think this is a mistake.',
  hi: 'आपका खाता ब्लॉक कर दिया गया है। यदि आपको लगता है कि यह गलती है, तो कृपया सहायता से संपर्क करें।',
};
const BUTTONS = { en: ['Try again', 'Sign out'], hi: ['फिर कोशिश करें', 'साइन आउट'] };

/** "until 24 Oct 2026, 6:00 pm IST" (always India time, like the app). */
export function untilLabel(iso, lang = 'en') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const text = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return lang === 'hi' ? `${text.replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM')} IST तक` : `Until ${text} IST`;
}

/**
 * What the phone's Account-blocked screen shows for this form, in one language.
 * Hindi falls back to the English message (as the app does) and says so, so the operator is not surprised.
 */
export function phoneModel(form, lang = 'en') {
  const hi = lang === 'hi';
  const said = (hi ? form.messageHi.trim() : '') || form.message.trim();
  const fellBack = hi && !form.messageHi.trim() && !!form.message.trim();
  return {
    title: TITLE[lang],
    message: said || DEFAULT_MSG[lang],
    usingDefault: !said,
    fellBack,
    until: form.mode === 'until' ? untilLabel(localInputToIso(form.until), lang) : '',
    buttons: BUTTONS[lang],
  };
}
