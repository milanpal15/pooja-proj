import { useId, useState } from 'react';

import { Button, Field, ReadoutField } from '../../../ui/index.js';
import { formatCoins } from '../../../lib/money.js';
import { useWalletSearch } from '../hooks/useWalletSearch.js';

/**
 * Search devotees by name, phone or email and pick one.
 * `value` is the chosen wallet ({uid,name,contact,balance}) or null.
 */
export function WalletPicker({ value, onChange }) {
  const [query, setQuery] = useState('');
  const { results, status } = useWalletSearch(value ? '' : query);
  const listId = useId();

  if (value) {
    return (
      <ReadoutField label="Devotee (name, phone or email)">
        <span style={{ flex: 1 }}>
          {value.name || 'Devotee'} · {value.contact || value.uid}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(null);
            setQuery('');
          }}>
          Change
        </Button>
      </ReadoutField>
    );
  }

  return (
    <div className="wallet-picker">
      <Field
        label="Devotee (name, phone or email)"
        type="search"
        placeholder="Search devotee"
        value={query}
        onChange={setQuery}
        autoComplete="off"
        aria-controls={listId}
        hint={status === 'error' ? undefined : 'Type at least 2 characters.'}
        error={status === 'error' ? 'Search failed. Check the API connection and try again.' : undefined}
      />
      {query.trim().length >= 2 && status !== 'error' && (
        <ul id={listId} className="wallet-picker__list" aria-label="Matching devotees">
          {status === 'searching' && results.length === 0 && <li className="feat-note">Searching…</li>}
          {status === 'done' && results.length === 0 && <li className="feat-note">No devotee matches “{query.trim()}”.</li>}
          {results.map((w) => (
            <li key={w.uid}>
              <button type="button" className="wallet-picker__item" onClick={() => onChange(w)}>
                <b>{w.name || 'Unnamed devotee'}</b>
                <small>
                  {w.contact || w.uid} · {formatCoins(w.balance)} coins
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
