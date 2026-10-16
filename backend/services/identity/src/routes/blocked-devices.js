import { AUDIT_DETAIL_HEADER, encodeAuditDetail } from '@bhakti/common';

import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { parseBlockBody, phoneBlock } from '../lib/blocks.js';
import { onlyFrom, requirePerm } from '../lib/perms.js';
import { BlockedDevice } from '../models/index.js';

const DEVICE_ID = /^[^\s\u0000-\u001f]{1,120}$/;
const operatorOf = (req) => String(req.auth?.ctx?.username || req.auth?.sub || 'unknown').slice(0, 80);
const detail = (res, before, after) => res.setHeader(AUDIT_DETAIL_HEADER, encodeAuditDetail({ before, after }));
const active = (b, now) => !b.until || new Date(b.until) > now;

const view = (b, now) => ({
  deviceId: b.deviceId,
  uid: b.uid ?? null,
  reason: b.reason || '',
  message: b.message || '',
  messageHi: b.messageHi || '',
  until: b.until ? new Date(b.until).toISOString() : null,
  at: b.at ? new Date(b.at).toISOString() : null,
  by: b.by || null,
  active: active(b, now),
});
const audit = (b) => ({ deviceId: b.deviceId, reason: b.reason, message: b.message, messageHi: b.messageHi, until: b.until ? new Date(b.until).toISOString() : null });

/**
 * Blocked devices (docs/USERS.md section 1-2): the dashboard's list / add / remove at /admin/blocked-devices, and the per-device answer the
 * mobile BFF asks (cached there for 30 s, fails open) at /devices/:deviceId/status.
 */
export function blockedDeviceRoutes({ now = () => new Date() } = {}) {
  const admin = asyncRouter();
  admin.use(onlyFrom('admin-bff'));

  admin.get('/', requirePerm('devotees:view'), async (_req, res) => {
    const at = now();
    const rows = await BlockedDevice.find().sort({ at: -1 }).limit(500).lean();
    res.json({ devices: rows.map((b) => view(b, at)) });
  });

  /** Block a device (or change an existing block: this is an upsert). 201 when new, 200 when updated. */
  admin.post('/', requirePerm('devotees:edit'), async (req, res) => {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
    const input = parseBlockBody(req.body, now());
    const fields = { ...(input.fields ?? {}) };
    if (!DEVICE_ID.test(deviceId)) fields.deviceId = 'A device id (up to 120 characters, no spaces).';
    if (Object.keys(fields).length) throw new HttpError(400, 'bad_block', 'Check the highlighted fields.', { fields });
    const at = now();
    const before = await BlockedDevice.findOne({ deviceId }).lean();
    const { reason, message, messageHi, until } = input.value;
    const doc = await BlockedDevice.findOneAndUpdate(
      { deviceId },
      { $set: { reason, message, messageHi, until, at, by: operatorOf(req) }, $setOnInsert: { uid: null } },
      { new: true, upsert: true },
    );
    detail(res, before ? audit(before) : null, audit(doc));
    res.status(before ? 200 : 201).json({ device: view(doc.toObject(), at) });
  });

  admin.delete('/:deviceId', requirePerm('devotees:edit'), async (req, res) => {
    const gone = await BlockedDevice.findOneAndDelete({ deviceId: req.params.deviceId });
    if (gone) detail(res, audit(gone), null);
    res.json({ ok: true });
  });

  /** The mobile BFF: is this device blocked right now? Only the person-facing words leave this service. */
  const device = asyncRouter();
  device.get('/:deviceId/status', onlyFrom('mobile-bff'), async (req, res) => {
    const b = await BlockedDevice.findOne({ deviceId: req.params.deviceId }).lean();
    if (!b || !active(b, now())) return res.json({ blocked: false });
    res.json({ blocked: true, ...phoneBlock(b) });
  });
  return { admin, device };
}
