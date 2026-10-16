import { AUDIT_DETAIL_HEADER, encodeAuditDetail } from '@bhakti/common';
import mongoose from 'mongoose';

import { asyncRouter } from '../lib/async-handler.js';
import { APPROVAL_TTL_MS, approvalsEnabled, expireApprovals, getPolicy } from '../lib/control.js';
import { HttpError } from '../lib/http-error.js';
import { can, requirePerm } from '../lib/perms.js';
import { auditFields, describeChange, fieldsOf, isRisky, mergeAndValidate, sameFields } from '../lib/policy.js';
import { impactOf } from '../lib/usage.js';
import { ApprovalRequest, ControlSetting, VersionPolicy } from '../models/index.js';

const badPolicy = (fields) => new HttpError(400, 'bad_policy', 'This policy has problems that need fixing.', { fields });
const objectId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'bad_request', 'That id is not valid.');
  return id;
};
const who = (req) => String(req.auth?.ctx?.username ?? req.auth?.sub ?? 'unknown');
const whoId = (req) => String(req.auth?.sub ?? '');

export const policyView = (doc) => ({ platform: doc.platform, ...fieldsOf(doc), version: doc.version, updatedAt: doc.updatedAt ?? null, updatedBy: doc.updatedBy ?? null });
export const approvalView = (a) => ({
  _id: a._id, type: a.type, payload: a.payload, summary: a.summary, changes: a.payload?.before && a.payload?.after ? describeChange(a.payload.before, a.payload.after) : [],
  requestedBy: a.requestedBy, requestedAt: a.requestedAt, status: a.status, decidedBy: a.decidedBy ?? null, decidedAt: a.decidedAt ?? null, note: a.note ?? '',
  expiresAt: a.expiresAt, selfApproved: a.selfApproved === true,
});

const auditHeader = (res, before, after, extra = {}) => res.setHeader(AUDIT_DETAIL_HEADER, encodeAuditDetail({ before, after, ...extra }));

/**
 * Write `fields` as the new policy, only if nobody changed it since `current` was read (the `version` guard).
 * @returns the updated document
 */
async function applyPolicy(current, fields, by) {
  const next = await VersionPolicy.findOneAndUpdate(
    { _id: current._id, version: current.version },
    {
      $set: {
        minVersionCode: fields.minVersionCode, recommendedVersionCode: fields.recommendedVersionCode, blockedVersionCodes: fields.blockedVersionCodes, minOsApi: fields.minOsApi,
        graceUntil: fields.graceUntil ? new Date(fields.graceUntil) : null, snoozeDays: fields.snoozeDays, message: fields.message, messageHi: fields.messageHi, storeUrl: fields.storeUrl,
        maintenance: { ...fields.maintenance, until: fields.maintenance.until ? new Date(fields.maintenance.until) : null },
        blockUnversioned: fields.blockUnversioned, updatedBy: by,
      },
      $inc: { version: 1 },
    },
    { new: true },
  );
  if (!next) throw new HttpError(409, 'policy_changed', 'The policy was changed by someone else while you were editing. Reload and try again.');
  return next;
}

/**
 * /admin/version-policy (docs/RELEASES.md section 5), mounted at /internal/engagement/admin/version-policy.
 *   PUT /          validate, then: relief / cosmetic => applied (200); risky => a second operator's approval (202), unless approvals are off or
 *                  the requester is the only one who could approve (applied at once, `selfApproved` in the audit row - no deadlock).
 *   POST /impact   what a hypothetical (min / recommended / blocked / minOsApi) would do to the devices seen in the last 30 days.
 */
export function versionPolicyRoutes({ approvers, now = () => new Date() }) {
  const r = asyncRouter();

  r.put('/', requirePerm('releases:edit'), async (req, res) => {
    const current = await getPolicy();
    const v = mergeAndValidate(current, req.body);
    if (!v.ok) throw badPolicy(v.fields);
    const before = fieldsOf(current);
    const after = v.fields;
    if (sameFields(before, after)) return res.json({ policy: policyView(current), version: current.version, unchanged: true });

    const risky = isRisky(before, after);
    if (risky && (await approvalsEnabled())) {
      const count = await approvers.count('approvals:edit', req.id);
      if (count === null) throw new HttpError(503, 'approvers_unavailable', 'Could not check who can approve this change right now. Try again in a moment.');
      if (!(count <= 1 && can(req, 'approvals:edit'))) {
        const t = now();
        const approval = await ApprovalRequest.create({
          type: 'version_policy', payload: { before, after, baseVersion: current.version }, summary: describeChange(before, after).join('; ').slice(0, 600),
          requestedBy: who(req), requestedById: whoId(req), requestedAt: t, expiresAt: new Date(t.getTime() + APPROVAL_TTL_MS),
        });
        auditHeader(res, auditFields(before), auditFields(after));
        return res.status(202).json({ approval: approvalView(approval), version: current.version });
      }
      // The only operator who could approve is the one asking: a lock-out in waiting, so apply it - and say so in the audit row.
      const next = await applyPolicy(current, after, who(req));
      const t = now();
      await ApprovalRequest.create({
        type: 'version_policy', payload: { before, after, baseVersion: current.version }, summary: describeChange(before, after).join('; ').slice(0, 600),
        requestedBy: who(req), requestedById: whoId(req), requestedAt: t, expiresAt: new Date(t.getTime() + APPROVAL_TTL_MS),
        status: 'approved', decidedBy: who(req), decidedAt: t, note: 'Self-approved: the only operator able to approve.', selfApproved: true,
      });
      auditHeader(res, auditFields(before), auditFields(next), { selfApproved: true });
      return res.json({ policy: policyView(next), version: next.version, selfApproved: true });
    }

    const next = await applyPolicy(current, after, who(req));
    auditHeader(res, auditFields(before), auditFields(next));
    res.json({ policy: policyView(next), version: next.version });
  });

  r.post('/impact', requirePerm('releases:view'), async (req, res) => {
    const current = await getPolicy();
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const pick = Object.fromEntries(['minVersionCode', 'recommendedVersionCode', 'blockedVersionCodes', 'minOsApi'].filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
    const v = mergeAndValidate(current, pick);
    if (!v.ok) throw badPolicy(v.fields);
    res.json(await impactOf(v.fields, now()));
  });

  return r;
}

/** /admin/approvals: the queue, the on/off switch, and the decisions. */
export function approvalRoutes({ now = () => new Date() } = {}) {
  const r = asyncRouter();
  const view = requirePerm('approvals:view');
  const edit = requirePerm('approvals:edit');
  const STATUSES = ['pending', 'approved', 'rejected', 'expired', 'cancelled'];

  r.get('/', view, async (req, res) => {
    await expireApprovals(now());
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status && status !== 'all' && !STATUSES.includes(status)) throw new HttpError(400, 'bad_request', `status must be one of: all, ${STATUSES.join(', ')}.`);
    const filter = status && status !== 'all' ? { status } : {};
    const rows = await ApprovalRequest.find(filter).sort({ requestedAt: -1, _id: -1 }).limit(200).lean();
    res.json({ approvals: rows.map(approvalView) });
  });

  // `settings` is registered before `/:id/...` so the fixed path is never read as an id.
  r.get('/settings', view, async (_req, res) => res.json({ approvalsEnabled: await approvalsEnabled() }));

  r.put('/settings', edit, async (req, res) => {
    if (typeof req.body?.approvalsEnabled !== 'boolean') throw new HttpError(400, 'bad_request', 'approvalsEnabled (true or false) is required.');
    const before = await approvalsEnabled();
    await ControlSetting.updateOne({ key: 'approvalsEnabled' }, { $set: { value: req.body.approvalsEnabled, updatedBy: who(req) } }, { upsert: true });
    auditHeader(res, { approvalsEnabled: before }, { approvalsEnabled: req.body.approvalsEnabled });
    res.json({ approvalsEnabled: req.body.approvalsEnabled });
  });

  /** Loads a request and settles expiry; refuses anything that is not pending. */
  async function pendingOf(id) {
    const a = await ApprovalRequest.findById(objectId(id));
    if (!a) throw new HttpError(404, 'not_found', 'Approval request not found.');
    if (a.status === 'pending' && a.expiresAt.getTime() <= now().getTime()) {
      await ApprovalRequest.updateOne({ _id: a._id, status: 'pending' }, { $set: { status: 'expired', decidedAt: now() } });
      throw new HttpError(409, 'expired', 'This request expired. Ask for the change again.', { status: 'expired' });
    }
    if (a.status !== 'pending') throw new HttpError(409, 'not_pending', `This request is already ${a.status}.`, { status: a.status });
    return a;
  }
  const isRequester = (req, a) => (a.requestedById ? a.requestedById === whoId(req) : a.requestedBy === who(req));
  const noteOf = (req) => (typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '');

  r.post('/:id/approve', edit, async (req, res) => {
    const a = await pendingOf(req.params.id);
    if (isRequester(req, a)) throw new HttpError(409, 'own_request', 'You cannot approve your own request. Ask another operator.');
    const current = await getPolicy();
    const { before: wasBefore, after: wantAfter } = a.payload ?? {};
    if (!wasBefore || !wantAfter) throw new HttpError(409, 'bad_request_payload', 'This request has no change to apply.');
    if (!sameFields(current, wasBefore)) throw new HttpError(409, 'stale_policy', 'The policy has changed since this was requested, so applying it could overwrite newer changes. Reject it and ask again.');
    const v = mergeAndValidate(current, wantAfter);
    if (!v.ok) throw badPolicy(v.fields);

    const t = now();
    const claimed = await ApprovalRequest.findOneAndUpdate(
      { _id: a._id, status: 'pending' },
      { $set: { status: 'approved', decidedBy: who(req), decidedAt: t, note: noteOf(req) } },
      { new: true },
    );
    if (!claimed) throw new HttpError(409, 'not_pending', 'This request was just decided by someone else.');
    let next;
    try {
      next = await applyPolicy(current, v.fields, who(req));
    } catch (e) {
      await ApprovalRequest.updateOne({ _id: a._id, status: 'approved' }, { $set: { status: 'pending' }, $unset: { decidedBy: '', decidedAt: '' } });
      throw e;
    }
    auditHeader(res, auditFields(current), auditFields(next));
    res.json({ approval: approvalView(claimed), policy: policyView(next) });
  });

  r.post('/:id/reject', edit, async (req, res) => {
    const note = noteOf(req);
    if (!note) throw new HttpError(400, 'note_required', 'Say why you are rejecting this.');
    const a = await pendingOf(req.params.id);
    if (isRequester(req, a)) throw new HttpError(409, 'own_request', 'You cannot reject your own request. Cancel it instead.');
    const claimed = await ApprovalRequest.findOneAndUpdate({ _id: a._id, status: 'pending' }, { $set: { status: 'rejected', decidedBy: who(req), decidedAt: now(), note } }, { new: true });
    if (!claimed) throw new HttpError(409, 'not_pending', 'This request was just decided by someone else.');
    auditHeader(res, { status: 'pending', summary: a.summary }, { status: 'rejected', note });
    res.json({ approval: approvalView(claimed) });
  });

  r.post('/:id/cancel', edit, async (req, res) => {
    const a = await pendingOf(req.params.id);
    if (!isRequester(req, a)) throw new HttpError(403, 'not_requester', 'Only the operator who asked can cancel this request.');
    const claimed = await ApprovalRequest.findOneAndUpdate({ _id: a._id, status: 'pending' }, { $set: { status: 'cancelled', decidedBy: who(req), decidedAt: now(), note: noteOf(req) } }, { new: true });
    if (!claimed) throw new HttpError(409, 'not_pending', 'This request was just decided by someone else.');
    auditHeader(res, { status: 'pending', summary: a.summary }, { status: 'cancelled' });
    res.json({ approval: approvalView(claimed) });
  });

  return r;
}
