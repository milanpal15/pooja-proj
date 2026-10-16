/** The five screens a phone can show for a policy (docs/RELEASES.md §6), built from the form so the operator sees their own words. */

const HEAD = {
  en: { update_required: 'Update required', blocked: 'This version is blocked', maintenance: "We'll be right back", unsupported_os: 'Device not supported', update_available: 'Update available' },
  hi: { update_required: 'अपडेट आवश्यक है', blocked: 'यह संस्करण ब्लॉक है', maintenance: 'हम जल्द लौटेंगे', unsupported_os: 'यह डिवाइस समर्थित नहीं है', update_available: 'नया अपडेट उपलब्ध है' },
};
const BTN = { en: { update: 'Update now', later: 'Later', retry: 'Try again', ok: 'OK' }, hi: { update: 'अभी अपडेट करें', later: 'बाद में', retry: 'फिर कोशिश करें', ok: 'ठीक है' } };
const FALLBACK = {
  en: { update_required: 'Please update the app to keep using it.', blocked: 'This build has a problem. Please update to continue.', maintenance: 'The app is being updated. Please try again shortly.', unsupported_os: 'Some features may not work on this Android version.', update_available: 'A newer version is available.' },
  hi: { update_required: 'ऐप का उपयोग जारी रखने के लिए कृपया अपडेट करें।', blocked: 'इस संस्करण में समस्या है। जारी रखने के लिए अपडेट करें।', maintenance: 'ऐप अपडेट हो रहा है। कृपया थोड़ी देर बाद प्रयास करें।', unsupported_os: 'इस एंड्रॉइड संस्करण पर कुछ सुविधाएँ काम नहीं कर सकतीं।', update_available: 'नया संस्करण उपलब्ध है।' },
};

const when = (local) => {
  if (!local) return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

/**
 * @param {object} form  the policy form (lib/policy.js)
 * @param {'en'|'hi'} lang
 * @returns {{ key, title, message, usingDefault, buttons:string[], dismissible, note }[]}
 */
export function previewCards(form, lang) {
  const pick = (en, hi) => (lang === 'hi' ? hi || en : en);
  const said = pick(form.message.trim(), form.messageHi.trim());
  const mSaid = pick(form.maintenance.message.trim(), form.maintenance.messageHi.trim());
  const store = form.storeUrl.trim();
  const b = BTN[lang];
  const card = (key, message, buttons, dismissible, note = '') => ({
    key,
    title: HEAD[lang][key],
    message: message || FALLBACK[lang][key],
    usingDefault: !message,
    buttons,
    dismissible,
    note,
  });
  const until = when(form.maintenance.until);
  const grace = when(form.graceUntil);
  const storeNote = store ? '' : 'No store link set: the Update button is hidden.';
  return [
    card('update_required', said, store ? [b.update] : [], false, storeNote || 'Full screen. Cannot be dismissed.'),
    card('blocked', said, store ? [b.update] : [], false, storeNote || 'Full screen. Cannot be dismissed.'),
    card('maintenance', mSaid, [b.retry], false, until ? `Shows “back by ${until}”.` : 'No end time set.'),
    card('unsupported_os', said, [b.ok], true, form.minOsApi.trim() ? `Shown once per launch on Android API below ${form.minOsApi.trim()}.` : 'Set an Android API level to use this notice.'),
    card('update_available', said, store ? [b.update, b.later] : [b.later], true, grace ? `Says “update by ${grace}”.` : `Reminds again after ${form.snoozeDays || 3} day(s).`),
  ];
}
