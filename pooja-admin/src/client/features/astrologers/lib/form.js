import { parseSignIn } from './contact.js';

const csv = (text) =>
  String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const blankForm = (defaultSharePct = 30) => ({
  name: '',
  yearsExperience: '',
  specialities: '',
  languages: '',
  bio: '',
  ratePerMin: '',
  platformSharePct: String(defaultSharePct),
  signIn: '',
  listed: true,
});

export const toForm = (a) => ({
  name: a.name ?? '',
  yearsExperience: String(a.yearsExperience ?? ''),
  specialities: (a.specialities || []).join(', '),
  languages: (a.languages || []).join(', '),
  bio: a.bio ?? '',
  ratePerMin: String(a.ratePerMin ?? ''),
  platformSharePct: String(a.platformSharePct ?? ''),
  signIn: a.signInEmail || a.signInPhone || '',
  listed: a.listed !== false,
});

const isWhole = (v, min = 0) => /^\d+$/.test(String(v).trim()) && Number(v) >= min;

/** { field: message } — empty when the form can be saved. */
export function validate(form) {
  const e = {};
  if (!form.name.trim()) e.name = 'Enter the name devotees will see.';
  if (form.yearsExperience !== '' && !isWhole(form.yearsExperience)) e.yearsExperience = 'Whole years, like 12.';
  if (!isWhole(form.ratePerMin, 1)) e.ratePerMin = 'Enter coins per minute, at least 1.';
  const share = Number(form.platformSharePct);
  if (form.platformSharePct === '' || !Number.isFinite(share) || share < 0 || share > 100) e.platformSharePct = 'A percentage from 0 to 100.';
  const si = parseSignIn(form.signIn);
  if (si.error) e.signIn = si.error;
  return e;
}

/** Form -> POST/PUT body. The unused sign-in handle is sent as null so switching clears it. */
export function toBody(form) {
  const si = parseSignIn(form.signIn);
  return {
    name: form.name.trim(),
    bio: form.bio.trim(),
    specialities: csv(form.specialities),
    languages: csv(form.languages),
    yearsExperience: form.yearsExperience === '' ? 0 : Number(form.yearsExperience),
    ratePerMin: Number(form.ratePerMin),
    platformSharePct: Number(form.platformSharePct),
    signInEmail: si.kind === 'email' ? si.value : null,
    signInPhone: si.kind === 'phone' ? si.value : null,
    listed: !!form.listed,
  };
}

/** Rows matching the toolbar's search / status / speciality. */
export function filterRows(rows, { q, status, speciality }) {
  const needle = q.trim().toLowerCase();
  return rows.filter((a) => {
    if (status && a.status !== status) return false;
    if (speciality && !(a.specialities || []).includes(speciality)) return false;
    if (!needle) return true;
    return [a.name, ...(a.specialities || [])].some((s) => String(s).toLowerCase().includes(needle));
  });
}
