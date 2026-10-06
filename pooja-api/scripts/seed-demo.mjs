#!/usr/bin/env node
/**
 * Fill a deployment with demo content.
 *
 *   BASE=https://pooja-admin.onrender.com ADMIN_PASSWORD=… node scripts/seed-demo.mjs
 *   …                                                      node scripts/seed-demo.mjs --days 14
 *
 * The catalogue — deities, temples, aartis, festivals, sevas, knowledge,
 * FAQs, hero slides — already seeds itself on a database's first boot
 * (`db.js`). What it does NOT seed is the editorial content that is written
 * fresh each day, so a new deployment shows an empty Horoscope screen and no
 * announcement. That is what this fills.
 *
 * ── These readings are made up ──────────────────────────────────────────
 *
 * They exist so the screens can be seen working, and they are written to be
 * obviously generic rather than to pass as an astrologer's work. Replace
 * them before devotees read them: the dashboard's Horoscope tab edits any of
 * it, and "Copy previous day" is there for exactly this.
 *
 * Idempotent. Running it twice overwrites the same days rather than
 * doubling anything, and it leaves days you have already written alone
 * unless --force is given.
 */

const BASE = (process.env.BASE || 'http://127.0.0.1:4000').replace(/\/$/, '');
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const DAYS = Number(process.env.DAYS || argValue('--days') || 7);
const FORCE = process.argv.includes('--force');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
}

/* ───────────────────────────────────────────────────────────── content ── */

/**
 * One base reading per sign, in the voice the app uses elsewhere: practical,
 * devotional, no fortune-telling specifics that could be read as a promise.
 */
const SIGNS = [
  ['mesha', 'Mesha', 'Begin before sunrise and the day stays yours. A task you have been circling finishes more easily than expected.',
    'सूर्योदय से पहले आरंभ करें, दिन आपका रहेगा। टाला हुआ कार्य आज सहज पूर्ण होगा।', 'Red', 'लाल', '9'],
  ['vrishabha', 'Vrishabha', 'Steadiness serves you better than speed today. Offer water to the tulsi before you make any promise.',
    'आज गति से अधिक स्थिरता काम आएगी। कोई वचन देने से पहले तुलसी को जल अर्पित करें।', 'White', 'श्वेत', '6'],
  ['mithuna', 'Mithuna', 'Words carry further than usual. Say the kind thing you have been putting off.',
    'आज आपके शब्दों का प्रभाव अधिक रहेगा। जो स्नेहभरी बात टाल रहे थे, कह दें।', 'Green', 'हरा', '5'],
  ['karka', 'Karka', 'Home matters ask for attention. A short prayer at the family altar settles more than a long argument.',
    'घर के विषय ध्यान माँगते हैं। लंबे विवाद से अच्छा है घर के मंदिर में एक संक्षिप्त प्रार्थना।', 'Silver', 'रजत', '2'],
  ['simha', 'Simha', 'Your effort is noticed even where it is not named. Let the work speak and do not chase the credit.',
    'आपका परिश्रम वहाँ भी देखा जा रहा है जहाँ उल्लेख नहीं होता। कार्य बोलने दें, श्रेय का पीछा न करें।', 'Gold', 'स्वर्ण', '1'],
  ['kanya', 'Kanya', 'Detail is your strength today, but do not let it become delay. Finish the first draft, then refine.',
    'आज बारीकी आपकी शक्ति है, पर वह विलंब न बने। पहले पूरा करें, फिर सुधारें।', 'Olive', 'मेहंदी', '5'],
  ['tula', 'Tula', 'A balance you have been holding can finally rest. Light a diya at dusk and let the day close properly.',
    'जो संतुलन आप सँभाले हुए थे, आज विश्राम पा सकता है। संध्या को दीप जलाकर दिन पूर्ण करें।', 'Pale blue', 'आसमानी', '7'],
  ['vrischika', 'Vrischika', 'Hold your counsel a while longer. What you learn by listening today is worth more than what you would have said.',
    'अभी कुछ समय मौन रहें। आज सुनकर जो जानेंगे वह कहने से अधिक मूल्यवान होगा।', 'Maroon', 'गहरा लाल', '8'],
  ['dhanu', 'Dhanu', 'A journey — even a short one — clears something that sitting still would not. Travel light.',
    'कोई यात्रा, चाहे छोटी ही हो, वह सुलझाएगी जो बैठे रहने से न सुलझती। हल्का चलें।', 'Saffron', 'केसरिया', '3'],
  ['makara', 'Makara', 'Patience you have already spent begins to return. Do not restart what is nearly done.',
    'जो धैर्य आपने लगाया है, उसका फल आना आरंभ होगा। जो लगभग पूर्ण है उसे दोबारा न आरंभ करें।', 'Dark blue', 'नीला', '8'],
  ['kumbha', 'Kumbha', 'An unusual idea deserves a hearing, including your own. Write it down before the day takes it.',
    'कोई असामान्य विचार सुनने योग्य है, अपना भी। दिन उसे ले जाए उससे पहले लिख लें।', 'Indigo', 'जामुनी', '4'],
  ['meena', 'Meena', 'Rest is not idleness today. Give yourself the quiet hour and the rest of the day repays it.',
    'आज विश्राम आलस्य नहीं है। एक शांत घंटा स्वयं को दें, शेष दिन उसका प्रतिदान करेगा।', 'Sea green', 'समुद्री हरा', '7'],
];

/** A second line that rotates by day, so consecutive days are not identical. */
const DAILY_NOTE = [
  'Offer the first lamp of the day with a steady hand.',
  'Keep one promise you made to yourself.',
  'Speak less before noon; the afternoon will be easier.',
  'Share food with someone who did not ask.',
  'Finish one thing completely rather than three partly.',
  'Sit for five minutes without reaching for the phone.',
  'Give thanks aloud, by name, for one person.',
];
const DAILY_NOTE_HI = [
  'दिन का पहला दीप स्थिर हाथ से अर्पित करें।',
  'स्वयं से किया एक वचन अवश्य निभाएँ।',
  'दोपहर से पहले कम बोलें, दिन सरल रहेगा।',
  'बिना माँगे किसी के साथ भोजन बाँटें।',
  'तीन कार्य अधूरे करने से अच्छा एक पूर्ण करें।',
  'पाँच मिनट बिना फ़ोन के शांत बैठें।',
  'किसी एक व्यक्ति का नाम लेकर कृतज्ञता कहें।',
];

/* ─────────────────────────────────────────────────────────────── helpers ── */

const z = (n) => String(n).padStart(2, '0');
const dayKey = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

let cookie = '';

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error(`401 from ${path} — wrong or missing ADMIN_PASSWORD`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${path}`);
  return res.json();
}

async function login() {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (res.status === 401) throw new Error('Wrong ADMIN_PASSWORD.');
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${res.statusText}`);
  const { required } = await res.json();
  cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  if (required && !cookie) throw new Error('Login succeeded but set no session cookie.');
  console.log(required ? '  signed in' : '  no password configured on this server');
}

/* ────────────────────────────────────────────────────────────────── run ── */

console.log(`\nSeeding demo content → ${BASE}\n`);
await login();

/* ---- horoscope -------------------------------------------------------- */

let wrote = 0;
let skipped = 0;

for (let i = 0; i < DAYS; i++) {
  const date = dayKey(i);
  const existing = await api(`/api/horoscope/day/${date}`);
  const already = existing.readings.filter((r) => r.prediction || r.predictionHi).length;

  if (already && !FORCE) {
    console.log(`  ${date}  ${already} already published — left alone (--force to overwrite)`);
    skipped++;
    continue;
  }

  const note = DAILY_NOTE[i % DAILY_NOTE.length];
  const noteHi = DAILY_NOTE_HI[i % DAILY_NOTE_HI.length];

  const readings = SIGNS.map(([rashi, , text, textHi, colour, colourHi, num]) => ({
    rashi,
    prediction: `${text} ${note}`,
    predictionHi: `${textHi} ${noteHi}`,
    luckyColor: colour,
    luckyColorHi: colourHi,
    luckyNumber: num,
    enabled: true,
  }));

  const res = await api(`/api/horoscope/day/${date}`, { method: 'PUT', body: { readings } });
  console.log(`  ${date}  published ${res.saved}`);
  wrote++;
}

/* ---- one announcement, if there is none ------------------------------- */

const live = await api('/api/announcements').catch(() => []);
const hasLive = Array.isArray(live) ? live.length > 0 : !!live;

if (hasLive && !FORCE) {
  console.log('\n  announcement already live — left alone');
} else {
  await api('/api/content/announcements', {
    method: 'POST',
    body: {
      title: 'Sharad Navratri begins',
      bodyMd:
        'Nine nights of the Mother begin this week. Extra aartis are being offered each evening — see the temple page for timings.',
      severity: 'festival',
      channels: ['modal'],
      dismissible: true,
      active: true,
    },
  });
  console.log('\n  announcement created');
}

console.log(
  `\nDone — ${wrote} day${wrote === 1 ? '' : 's'} of readings written` +
    (skipped ? `, ${skipped} left alone` : '') +
    '.\nThese are placeholder readings. Edit them in the dashboard before devotees see them.\n',
);
