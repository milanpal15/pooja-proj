import { useState } from 'react';

import { Button, Field } from '../../../ui/index.js';
import { passwordStrength } from '../lib/password.js';

/** A password box with Show/Hide and a live strength hint. */
export function PasswordField({ label = 'Password', value, onChange }) {
  const [shown, setShown] = useState(false);
  const s = passwordStrength(value);
  return (
    <div>
      <Field
        label={label}
        type={shown ? 'text' : 'password'}
        autoComplete="new-password"
        value={value}
        placeholder="at least 8 characters"
        hint={s.label || 'At least 8 characters.'}
        onChange={onChange}
      />
      <Button variant="ghost" size="sm" aria-pressed={shown} onClick={() => setShown((v) => !v)}>
        {shown ? 'Hide password' : 'Show password'}
      </Button>
    </div>
  );
}
