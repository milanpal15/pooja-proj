import { formatDateTime } from '../../../lib/dates.js';

/** Readable names for the fields of a version-policy request's before/after (docs/RELEASES.md §2). */
export const POLICY_LABELS = {
  minVersionCode: 'Minimum build',
  recommendedVersionCode: 'Recommended build',
  blockedVersionCodes: 'Blocked builds',
  minOsApi: 'Android OS notice below API',
  graceUntil: 'Grace until',
  snoozeDays: 'Remind again after (days)',
  message: 'Message (English)',
  messageHi: 'Message (हिन्दी)',
  storeUrl: 'Store link',
  blockUnversioned: 'Block callers that send no version',
  'maintenance.enabled': 'Maintenance mode',
  'maintenance.message': 'Maintenance message (English)',
  'maintenance.messageHi': 'Maintenance message (हिन्दी)',
  'maintenance.until': 'Maintenance back by',
  'maintenance.allowUids': 'Maintenance allow-list',
  version: 'Policy version',
  updatedAt: 'Updated at',
  updatedBy: 'Updated by',
  platform: 'Platform',
};

const DATE_PATH = /(^|\.)(graceUntil|until|updatedAt|at|requestedAt|decidedAt|expiresAt)$/;

/** Dates become “28 Oct 2026, 6:00 pm”; everything else falls back to the diff's own rendering. */
export function formatValue(path, value) {
  if (typeof value === 'string' && DATE_PATH.test(path) && !Number.isNaN(Date.parse(value))) return formatDateTime(value);
  return undefined;
}

/** Fields the operator did not choose (bookkeeping) are left out of the diff. */
const HIDDEN = new Set(['version', 'updatedAt', 'updatedBy', 'platform', '_id', 'id']);
export const stripBookkeeping = (o) => {
  if (!o || typeof o !== 'object') return o;
  return Object.fromEntries(Object.entries(o).filter(([k]) => !HIDDEN.has(k)));
};

/** Whole hours (rounded up) until `expiresAt`, or 0 when past / unknown. */
export function hoursLeft(req, now = Date.now()) {
  const t = req?.expiresAt ? Date.parse(req.expiresAt) : NaN;
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil((t - now) / 3600000));
}

/** Can this operator decide the request? Never their own; only while pending. */
export function canDecide(req, username, mayApprove) {
  return !!mayApprove && req?.status === 'pending' && req.requestedBy !== username;
}
export const isOwn = (req, username) => !!username && req?.requestedBy === username;

export const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger', expired: 'neutral', cancelled: 'neutral' };

export function split(list) {
  const pending = list.filter((r) => r.status === 'pending').sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
  const history = list.filter((r) => r.status !== 'pending').sort((a, b) => Date.parse(b.decidedAt || b.requestedAt) - Date.parse(a.decidedAt || a.requestedAt));
  return { pending, history };
}

/** Map the server's error codes to something an operator can act on. */
export function explain(err) {
  switch (err?.code) {
    case 'own_request':
      return 'You requested this change, so a different operator has to approve it.';
    case 'expired':
      return 'This request has expired. Ask for the change again.';
    case 'not_pending':
      return 'This request was already decided.';
    default:
      return err?.message || 'Something went wrong.';
  }
}
