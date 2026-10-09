import { useEffect, useState } from 'react';

import { Button, Card, ErrorState, Field, Switch, TableSkeleton, useConfirm, useToast } from '../../../ui/index.js';
import { CALL_RULES, OTHER_RULES, rulesToBody, rulesToForm, validateRules } from '../lib/rules.js';

function RuleFields({ fields, form, errors, onField }) {
  return (
    <div className="feat-grid2" style={{ alignItems: 'start' }}>
      {fields.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint} type="number" step={f.decimal ? 'any' : '1'} min={f.min} max={f.max} value={form[f.key]} onChange={onField(f.key)} error={errors[f.key]} inputMode={f.decimal ? 'decimal' : 'numeric'} />
      ))}
    </div>
  );
}

/** The knobs: call billing, plus the other coin prices and rules. */
export function BillingRulesForm({ rules, status, error, offline, onSave, onRetry }) {
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  // Adopt the loaded rules once; later reloads after a save re-seed it.
  useEffect(() => {
    if (rules) setForm(rulesToForm(rules));
  }, [rules]);

  const onField = (key) => (value) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (Object.keys(errors).length) setErrors(validateRules(next));
  };

  const save = async (e) => {
    e.preventDefault();
    const found = validateRules(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (rules.callsEnabled !== false && !form.callsEnabled) {
      const ok = await confirm({
        title: 'Turn off astrologer calls?',
        message: 'Devotees will not be able to start new calls until you turn this back on. Calls already in progress continue.',
        confirmLabel: 'Turn off calls',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await onSave(rulesToBody(form));
      toast.success('Billing rules saved. They apply from the next call.');
    } catch (err) {
      toast.error(`Could not save the rules. ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Billing rules">
      {status === 'loading' && <TableSkeleton rows={4} />}
      {status === 'error' && <ErrorState message={error} offline={offline} onRetry={onRetry} />}
      {form && (
        <form onSubmit={save} noValidate style={{ display: 'contents' }}>
          <RuleFields fields={CALL_RULES} form={form} errors={errors} onField={onField} />
          <Switch variant="card" label="Astrologer calls enabled in the app" hint="The kill switch. Off stops new calls." checked={form.callsEnabled} onChange={onField('callsEnabled')} />
          <fieldset className="feat-fieldset">
            <legend>Other coin prices &amp; rules</legend>
            <RuleFields fields={OTHER_RULES} form={form} errors={errors} onField={onField} />
          </fieldset>
          <div>
            <Button type="submit" loading={busy}>
              Save rules
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
