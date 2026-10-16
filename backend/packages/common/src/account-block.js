/**
 * What the phone is told when an account or a device is blocked (docs/USERS.md section 3).
 *
 *   403 { error, code:'account_blocked'|'device_blocked', message, messageHi, until:ISO|null, support:{ email?, phone? } }
 *
 * `message` / `messageHi` are the operator's words for the person (the internal `reason` NEVER leaves the identity service). `support` comes
 * from the settings table (`supportEmail`, `supportPhone`); a blank value is simply absent so the app hides that button.
 */
export const DEFAULT_BLOCK_MESSAGE = 'Your account has been blocked. If you think this is a mistake, please contact support.';
export const DEFAULT_BLOCK_MESSAGE_HI = 'आपका खाता ब्लॉक कर दिया गया है। यदि आपको लगता है कि यह गलती है, तो कृपया सहायता से संपर्क करें।';

export const BLOCK_CODES = Object.freeze({ account: 'account_blocked', device: 'device_blocked' });

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

/** `{ email?, phone? }` from a `{ key: value }` settings map; blanks are left out. Never throws on a malformed map. */
export function supportFrom(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const email = clean(s.supportEmail);
  const phone = clean(s.supportPhone);
  return { ...(email ? { email } : {}), ...(phone ? { phone } : {}) };
}

/** `{ email?, phone? }` already in support shape, blanks dropped. */
const cleanSupport = (s) => {
  const email = clean(s?.email);
  const phone = clean(s?.phone);
  return { ...(email ? { email } : {}), ...(phone ? { phone } : {}) };
};

/** The 403 body. `kind`: 'account' | 'device'. `block`: `{ message?, messageHi?, until? }` (all optional; defaults fill the gaps). */
export function blockedBody(kind, block = {}, support = {}) {
  const until = block?.until ? new Date(block.until) : null;
  const message = clean(block?.message) || DEFAULT_BLOCK_MESSAGE;
  const messageHi = clean(block?.messageHi) || (clean(block?.message) ? '' : DEFAULT_BLOCK_MESSAGE_HI);
  return {
    error: kind === 'device' ? 'device blocked' : 'account blocked',
    code: BLOCK_CODES[kind === 'device' ? 'device' : 'account'],
    message,
    messageHi,
    until: until && !Number.isNaN(until.getTime()) ? until.toISOString() : null,
    support: cleanSupport(support),
  };
}

export const isBlockedCode = (code) => code === BLOCK_CODES.account || code === BLOCK_CODES.device;
