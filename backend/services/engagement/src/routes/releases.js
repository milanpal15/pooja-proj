import { encodeAuditDetail, AUDIT_DETAIL_HEADER } from '@bhakti/common';
import mongoose from 'mongoose';

import { asyncRouter } from '../lib/async-handler.js';
import { approvalsEnabled, expireApprovals, getPolicy } from '../lib/control.js';
import { HttpError } from '../lib/http-error.js';
import { requirePerm } from '../lib/perms.js';
import { fieldsOf, istDay } from '../lib/policy.js';
import { usageByVersion } from '../lib/usage.js';
import { AppRelease, ApprovalRequest, VersionBlockCount } from '../models/index.js';

const view = requirePerm('releases:view');
const edit = requirePerm('releases:edit');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = (fields) => new HttpError(400, 'bad_release', 'This release has problems that need fixing.', { fields });
const objectId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'bad_request', 'That id is not valid.');
  return id;
};

export const releaseView = (r) => ({
  _id: r._id, platform: r.platform, versionName: r.versionName, versionCode: r.versionCode, notes: r.notes ?? '', notesHi: r.notesHi ?? '', storeUrl: r.storeUrl ?? '',
  status: r.status, releasedAt: r.releasedAt ?? null, createdBy: r.createdBy ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
});
const detail = (res, before, after) => res.setHeader(AUDIT_DETAIL_HEADER, encodeAuditDetail({ before: before && releaseView(before), after: after && releaseView(after) }));

/** Validates the editable release fields of a body. `partial` = only the keys present. */
function readFields(body, { partial }) {
  const b = isObj(body) ? body : {};
  const errors = {};
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (!partial || has('versionName')) {
    const v = typeof b.versionName === 'string' ? b.versionName.trim() : '';
    if (!v || v.length > 40) errors.versionName = 'Required, at most 40 characters (e.g. 1.4.0).';
    else out.versionName = v;
  }
  if (!partial || has('versionCode')) {
    if (Number.isInteger(b.versionCode) && b.versionCode >= 0 && b.versionCode <= 999_999_999) out.versionCode = b.versionCode;
    else errors.versionCode = 'Required: a whole number, 0 or more (the build\'s versionCode).';
  }
  for (const k of ['notes', 'notesHi']) {
    if (!has(k)) continue;
    if (b[k] === null) out[k] = '';
    else if (typeof b[k] !== 'string' || b[k].length > 2000) errors[k] = 'Text, at most 2000 characters.';
    else out[k] = b[k].trim();
  }
  if (has('storeUrl')) {
    const v = b.storeUrl ?? '';
    if (typeof v !== 'string' || v.length > 500 || (v.trim() && !/^(https?:\/\/|market:\/\/)\S+$/i.test(v.trim()))) errors.storeUrl = 'An http(s) or market:// link, at most 500 characters (or empty).';
    else out.storeUrl = v.trim();
  }
  if (has('status')) {
    if (['draft', 'live'].includes(b.status)) out.status = b.status;
    else errors.status = 'Must be draft or live (use Withdraw to withdraw a release).';
  }
  if (has('releasedAt')) {
    if (b.releasedAt === null || b.releasedAt === '') out.releasedAt = null;
    else if (typeof b.releasedAt === 'string' && Number.isFinite(Date.parse(b.releasedAt))) out.releasedAt = new Date(b.releasedAt);
    else errors.releasedAt = 'A valid date (or empty).';
  }
  return { out, errors };
}

/**
 * /admin/releases (docs/RELEASES.md section 5). Area `releases`: GET needs view, writes need edit; the BFF's gate runs first and this re-checks the signed permission.
 */
export function releaseRoutes({ now = () => new Date() } = {}) {
  const r = asyncRouter();

  r.get('/', view, async (_req, res) => {
    await expireApprovals(now());
    const [releases, policy, enabled, pending] = await Promise.all([
      AppRelease.find().sort({ versionCode: -1 }).lean(),
      getPolicy(),
      approvalsEnabled(),
      ApprovalRequest.find({ status: 'pending' }).sort({ requestedAt: -1, _id: -1 }).lean(),
    ]);
    res.json({ releases: releases.map(releaseView), policy: { platform: policy.platform, ...fieldsOf(policy), version: policy.version, updatedAt: policy.updatedAt ?? null, updatedBy: policy.updatedBy ?? null }, approvalsEnabled: enabled, pending });
  });

  r.post('/', edit, async (req, res) => {
    const { out, errors } = readFields(req.body, { partial: false });
    if (Object.keys(errors).length) throw fail(errors);
    if (await AppRelease.exists({ platform: 'android', versionCode: out.versionCode })) throw new HttpError(409, 'release_exists', 'A release with that version code already exists.', { fields: { versionCode: 'Already used.' } });
    const status = out.status ?? 'draft';
    const doc = await AppRelease.create({ ...out, platform: 'android', status, releasedAt: out.releasedAt ?? (status === 'live' ? now() : undefined), createdBy: req.auth?.ctx?.username ?? String(req.auth?.sub ?? '') });
    detail(res, null, doc);
    res.status(201).json(releaseView(doc));
  });

  r.put('/:id', edit, async (req, res) => {
    const existing = await AppRelease.findById(objectId(req.params.id));
    if (!existing) throw new HttpError(404, 'not_found', 'Release not found.');
    const b = isObj(req.body) ? req.body : {};
    if (b.versionCode !== undefined && b.versionCode !== existing.versionCode) throw fail({ versionCode: 'The version code of a release cannot be changed. Add a new release instead.' });
    if (existing.status === 'withdrawn' && b.status !== undefined) throw fail({ status: 'A withdrawn release stays withdrawn.' });
    const { out, errors } = readFields({ ...b, versionCode: undefined }, { partial: true });
    delete errors.versionCode;
    if (Object.keys(errors).length) throw fail(errors);
    delete out.versionCode;
    const before = existing.toObject();
    Object.assign(existing, out);
    if (out.status === 'live' && !existing.releasedAt) existing.releasedAt = now();
    await existing.save();
    detail(res, before, existing);
    res.json(releaseView(existing));
  });

  r.post('/:id/withdraw', edit, async (req, res) => {
    const existing = await AppRelease.findById(objectId(req.params.id));
    if (!existing) throw new HttpError(404, 'not_found', 'Release not found.');
    if (existing.status === 'withdrawn') throw new HttpError(409, 'already_withdrawn', 'That release is already withdrawn.');
    const before = existing.toObject();
    existing.status = 'withdrawn';
    await existing.save();
    detail(res, before, existing);
    res.json(releaseView(existing));
  });

  return r;
}

/** /admin/versions: adoption by build and the gate's refusals. */
export function versionRoutes({ now = () => new Date() } = {}) {
  const r = asyncRouter();

  r.get('/usage', view, async (_req, res) => {
    const usage = await usageByVersion(now());
    const t = now().getTime();
    const today = istDay(t);
    const since = istDay(t - 6 * 864e5);
    const rows = await VersionBlockCount.find({ platform: 'android', day: { $gte: since, $lte: today } }).lean();
    const byCode = new Map();
    for (const row of rows) {
      const e = byCode.get(row.versionCode) ?? { versionCode: row.versionCode, count7d: 0, countToday: 0 };
      e.count7d += row.count;
      if (row.day === today) e.countToday += row.count;
      byCode.set(row.versionCode, e);
    }
    res.json({ byVersion: usage.byVersion, total: usage.total, blockedRequests: [...byCode.values()].sort((a, b) => (b.versionCode ?? -1) - (a.versionCode ?? -1)) });
  });

  return r;
}
