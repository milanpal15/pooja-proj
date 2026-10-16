import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { notifyApprovalsChanged } from '../../../lib/approvals-signal.js';
import { useUnsavedGuard } from '../../../lib/hooks/useUnsavedGuard.js';
import { useToast } from '../../../ui/index.js';
import { impactBody } from '../lib/impact.js';
import { fromPolicy, isDirty, riskReasons, serverFields, toBody, validate } from '../lib/policy.js';

/**
 * The version-policy form, its debounced impact preview and every write. `policy` is the saved one (from /releases);
 * `reload()` refetches the page data. A write answers one of three ways, and the page shows each differently:
 *   applied        200 { policy }      -> toast, form re-based on the saved policy
 *   sent           202 { approval }    -> `sent` is set (a banner stays up), nothing changed yet
 *   refused        400 bad_policy      -> `serverErrors` next to the fields, toast with the reason
 */
export function usePolicyEditor({ policy, approvalsEnabled, reload }) {
  const toast = useToast();
  const baseline = useMemo(() => fromPolicy(policy), [policy]);
  const [form, setForm] = useState(baseline);
  const [serverErrors, setServerErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(null);
  const [impact, setImpact] = useState({ data: null, loading: false, error: '' });

  useEffect(() => {
    setForm(baseline);
    setServerErrors({});
  }, [baseline]);

  const dirty = isDirty(form, baseline);
  useUnsavedGuard(dirty);
  const clientErrors = useMemo(() => validate(form), [form]);
  const errors = { ...serverErrors, ...clientErrors };
  const body = useMemo(() => toBody(form), [form]);
  const risks = useMemo(() => (Object.keys(clientErrors).length ? [] : riskReasons(policy, body)), [policy, body, clientErrors]);
  const needsApproval = risks.length > 0 && approvalsEnabled;

  const set = useCallback((patch) => {
    setServerErrors({});
    setForm((f) => ({ ...f, ...patch }));
  }, []);
  const setMaintenance = useCallback((patch) => {
    setServerErrors({});
    setForm((f) => ({ ...f, maintenance: { ...f.maintenance, ...patch } }));
  }, []);

  // Impact: debounced, latest answer wins. Sends only the four fields that decide who is gated.
  const hyp = useMemo(() => impactBody(form), [form]);
  const hypKey = JSON.stringify(hyp);
  const seq = useRef(0);
  useEffect(() => {
    if (!hyp) {
      setImpact((i) => ({ ...i, loading: false }));
      return undefined;
    }
    const mine = ++seq.current;
    setImpact((i) => ({ ...i, loading: true }));
    const t = setTimeout(async () => {
      try {
        const data = await api.versionPolicy.impact(hyp);
        if (mine === seq.current) setImpact({ data, loading: false, error: '' });
      } catch (e) {
        if (mine === seq.current) setImpact((i) => ({ data: i.data, loading: false, error: e.message }));
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hypKey]);

  /** Send a complete policy body. Resolves true when the server accepted it (applied or sent for approval). */
  const apply = useCallback(
    async (nextBody, { applied = 'Policy saved', failed = 'Could not save the policy.' } = {}) => {
      setSaving(true);
      try {
        const res = await api.versionPolicy.save(nextBody);
        if (res?.approval) {
          setSent(res.approval);
          notifyApprovalsChanged();
          toast.info('Sent for approval. Nothing has changed yet.', { detail: 'Another operator must approve it within 24 hours.' });
        } else {
          setSent(null);
          toast.success(res?.policy?.version ? `${applied} (version ${res.policy.version})` : applied, res?.selfApproved ? { detail: 'You are the only approver, so it applied immediately and is recorded as self-approved.' } : undefined);
        }
        await reload();
        return true;
      } catch (e) {
        setServerErrors(serverFields(e.body));
        toast.error(`${failed} ${e.message}`);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [reload, toast],
  );

  return {
    form,
    set,
    setMaintenance,
    baseline,
    dirty,
    errors,
    valid: Object.keys(clientErrors).length === 0,
    body,
    risks,
    needsApproval,
    saving,
    sent,
    dismissSent: () => setSent(null),
    discard: () => {
      setForm(baseline);
      setServerErrors({});
    },
    save: () => apply(body),
    apply,
    impact,
    hyp,
  };
}
