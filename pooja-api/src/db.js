import mongoose from 'mongoose';

import { seedPolicies } from './broadcast.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  Aarti,
  Deity,
  Reminder,
  Tone,
  WallpaperStyle,
  DEFAULT_FLAGS,
  Faq,
  Festival,
  Flag,
  HeroSlide,
  Knowledge,
  Seva,
  Setting,
  Temple,
} from './models.js';

/**
 * Sevas, FAQs, deity lore, temple palettes and default settings, generated
 * from what the app used to hardcode so a fresh database matches the bundle
 * exactly. Regenerate by re-extracting `src/constants/*` from the app.
 */
const BUNDLED = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'seed-content.json'), 'utf8'),
);

/**
 * Fill in deity columns that did not exist when a database was first seeded.
 *
 * `insertMany` only runs on an empty collection, which is right — it must
 * never trample an operator's edits. But it also means a deployment seeded
 * before the murti palette and geometry existed keeps eight deities with
 * those columns blank, and the app draws them grey and crownless forever.
 *
 * So: per field, set it only where it is currently absent. A colour someone
 * chose in the dashboard is left exactly as it is; a column nobody has ever
 * filled gets the bundled value. Running this on every boot is safe because
 * the second run finds nothing to do.
 */
/**
 * The temple's suggested daily cycle, its alert tones and the wallpaper
 * looks — all three used to be literals in the app bundle, so a temple
 * whose Mangala Aarti is at 4:00 could not say so without a store release.
 */
const REMINDERS_SEED = [
  { slug: 'mangala', title: 'Mangala Aarti', titleHi: 'मंगला आरती', body: 'The first aarti of the day is being offered.', bodyHi: 'दिन की पहली आरती का समय है।', hour: 4, minute: 30, icon: 'diya', order: 0 },
  { slug: 'shringar', title: 'Shringar Aarti', titleHi: 'श्रृंगार आरती', body: 'The deity is adorned. Take darshan.', bodyHi: 'श्रृंगार दर्शन का समय है।', hour: 8, minute: 0, icon: 'marigold', order: 1 },
  { slug: 'sandhya', title: 'Sandhya Aarti', titleHi: 'संध्या आरती', body: 'Evening aarti. Light a diya.', bodyHi: 'संध्या आरती — दीप जलाएँ।', hour: 18, minute: 30, icon: 'diya', order: 2 },
  { slug: 'shayan', title: 'Shayan Aarti', titleHi: 'शयन आरती', body: 'The last aarti before the sanctum closes.', bodyHi: 'शयन आरती — पट बंद होने से पहले।', hour: 21, minute: 0, icon: 'lotus', order: 3 },
  { slug: 'mantra', title: 'Daily Mantra', titleHi: 'दैनिक मंत्र', body: 'A few minutes of japa.', bodyHi: 'कुछ क्षण जप के लिए।', hour: 7, minute: 0, icon: 'sparkle', order: 4 },
];

const TONES_SEED = [
  { slug: 'bell', title: 'Temple Bell', titleHi: 'मंदिर की घंटी', desc: 'A single ghanta strike', descHi: 'एक घंटा नाद', sound: 'bell', icon: 'bell', order: 0 },
  { slug: 'aarti', title: 'Aarti Ambience', titleHi: 'आरती ध्वनि', desc: 'Drone and bells', descHi: 'ध्वनि एवं घंटियाँ', sound: 'aarti', icon: 'music', order: 1 },
  { slug: 'default', title: 'Phone Default', titleHi: 'फ़ोन का डिफ़ॉल्ट', desc: 'Whatever your phone uses', descHi: 'जो आपके फ़ोन में सेट है', sound: null, icon: 'settings', order: 2 },
  { slug: 'silent', title: 'Silent', titleHi: 'मौन', desc: 'Show it, but stay quiet', descHi: 'सूचना दिखे, ध्वनि नहीं', sound: '', icon: 'close', order: 3 },
];

const WALLPAPER_STYLES_SEED = [
  { slug: 'sanctum', title: 'Sanctum', titleHi: 'गर्भगृह', order: 0 },
  { slug: 'dawn', title: 'Dawn', titleHi: 'उषा', order: 1 },
  { slug: 'night', title: 'Night', titleHi: 'रात्रि', order: 2 },
];

/** Give already-seeded aartis the category the Bhajan shelves need. */
async function backfillAartis() {
  let touched = 0;
  for (const seed of AARTIS) {
    const res = await Aarti.updateOne(
      { title: seed.title, category: { $in: [null, undefined] } },
      { $set: { category: seed.category } },
    );
    touched += res.modifiedCount ?? 0;
  }
  if (touched) console.log(`✓ Backfilled a category on ${touched} aartis`);
}

async function backfillDeities() {
  const fields = ['body', 'robe', 'trim', 'crown', 'offerings', 'accent', 'mark', 'mantra'];
  let touched = 0;

  for (const seed of DEITIES) {
    const doc = await Deity.findOne({ slug: seed.slug });
    if (!doc) continue;

    const $set = {};
    for (const f of fields) {
      const current = doc[f];
      const blank =
        current === undefined ||
        current === null ||
        current === '' ||
        (Array.isArray(current) && current.length === 0);
      if (blank && seed[f] !== undefined) $set[f] = seed[f];
    }
    // The three booleans are absent rather than false on an old row, and
    // `false` is a real answer — only set them where the key is missing.
    for (const f of ['crescent', 'serpent', 'elephant', 'mace']) {
      if (doc[f] === undefined && seed[f] !== undefined) $set[f] = seed[f];
    }

    if (Object.keys($set).length) {
      await Deity.updateOne({ _id: doc._id }, { $set });
      touched++;
    }
  }

  if (touched) console.log(`✓ Backfilled murti palette/geometry on ${touched} deities`);
}

/**
 * A connection string with the password taken out, for logging.
 *
 * This line printed the URI verbatim, which put the database password into
 * the host's log history on every boot — a place that is retained, often
 * widely readable, and not somewhere a credential should ever reach.
 */
function redactUri(uri) {
  try {
    const u = new URL(uri);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    // Not parseable as a URL; show nothing rather than risk the password.
    return '(connection string hidden)';
  }
}

export async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('✓ MongoDB connected:', redactUri(uri));
  await seedFlags();
  await seedContent();
  await backfillBookingFlag();
  await seedPolicies();
}

/** Insert any missing default flags (idempotent). */
async function seedFlags() {
  for (const f of DEFAULT_FLAGS) {
    await Flag.updateOne({ key: f.key }, { $setOnInsert: f }, { upsert: true });
  }
}

/**
 * The eight deities, with everything the app needs to draw them.
 *
 * The palette (body/robe/trim) and the geometry flags (crown, crescent,
 * serpent, elephant, mace) used to exist only in the app's own
 * `constants/deities.ts`, so a deity ADDED from the dashboard came out
 * untinted and crownless — the bundle had no entry to match it against.
 * Seeded here so the dashboard is the whole truth; the app keeps defaults
 * for anything left blank.
 */
const DEITIES = [
  {"slug":"shiva","name":"शिव जी","title":"भगवान शिव","mark":"ॐ","mantra":"ॐ नमः शिवाय","accent":"#FFC13D","body":"#E8DCC8","robe":"#C8862F","trim":"#E4572E","crown":"jata","crescent":true,"serpent":true,"offerings":["बिल्व पत्र","गंगा जल","धतूरा"],"order":0},
  {"slug":"shani","name":"शनि देव","title":"शनि देव","mark":"शं","mantra":"ॐ शं शनैश्चराय नमः","accent":"#63B3ED","body":"#4A5568","robe":"#1A202C","trim":"#2C5282","crown":"tall","offerings":["तिल तेल","काला वस्त्र","उड़द"],"order":1},
  {"slug":"vishnu","name":"विष्णु जी","title":"भगवान विष्णु","mark":"हरि","mantra":"ॐ नमो नारायणाय","accent":"#F6E05E","body":"#5A7FC7","robe":"#F6C453","trim":"#3C5FA8","crown":"mukut","offerings":["तुलसी दल","पंचामृत","चंदन"],"order":2},
  {"slug":"ganesh","name":"गणेश जी","title":"श्री गणेश","mark":"श्री","mantra":"ॐ गं गणपतये नमः","accent":"#FF9F45","body":"#E2703A","robe":"#F6C453","trim":"#C0392B","crown":"mukut","elephant":true,"offerings":["मोदक","दूर्वा","लाल फूल"],"order":3},
  {"slug":"hanuman","name":"हनुमान जी","title":"श्री हनुमान","mark":"राम","mantra":"ॐ हनुमते नमः","accent":"#FF8A3D","body":"#D95738","robe":"#E23E2C","trim":"#F2C14E","crown":"plain","mace":true,"offerings":["सिंदूर","बूंदी","चमेली तेल"],"order":4},
  {"slug":"durga","name":"दुर्गा माँ","title":"माँ दुर्गा","mark":"ऐं","mantra":"ॐ दुं दुर्गायै नमः","accent":"#F06595","body":"#F0C39B","robe":"#C0392B","trim":"#F6C453","crown":"tall","offerings":["लाल चुनरी","नारियल","गुड़हल"],"order":5},
  {"slug":"lakshmi","name":"लक्ष्मी माँ","title":"माँ लक्ष्मी","mark":"श्रीं","mantra":"ॐ श्रीं महालक्ष्म्यै नमः","accent":"#FFD166","body":"#F2C9A0","robe":"#E8467C","trim":"#C9366F","crown":"mukut","offerings":["कमल","खीर","कौड़ी"],"order":6},
  {"slug":"krishna","name":"कृष्ण जी","title":"श्री कृष्ण","mark":"कृष्ण","mantra":"ॐ नमो भगवते वासुदेवाय","accent":"#7DD3C0","body":"#6B8FD4","robe":"#F6C453","trim":"#E8B04B","crown":"mukut","offerings":["माखन","तुलसी","मोरपंख"],"order":7},
];

const TEMPLES = [
  { slug: 'kashi', name: 'Kashi Vishwanath', location: 'Varanasi, Uttar Pradesh', deitySlug: 'shiva', aartiTime: 'Mangala Aarti · 3:00 AM', offerings: ['Bilva Patra', 'Ganga Jal', 'Dhatura'], order: 0 },
  { slug: 'siddhivinayak', name: 'Shree Siddhivinayak', location: 'Prabhadevi, Mumbai', deitySlug: 'ganesh', aartiTime: 'Kakad Aarti · 5:30 AM', offerings: ['Modak', 'Durva Grass', 'Red Hibiscus'], order: 1 },
  { slug: 'meenakshi', name: 'Meenakshi Amman', location: 'Madurai, Tamil Nadu', deitySlug: 'durga', aartiTime: 'Palliyarai Pooja · 9:30 PM', offerings: ['Kumkum', 'Jasmine', 'Sarees'], order: 2 },
  { slug: 'jagannath', name: 'Jagannath Dham', location: 'Puri, Odisha', deitySlug: 'vishnu', aartiTime: 'Sandhya Aarti · 7:00 PM', offerings: ['Tulsi Leaves', 'Mahaprasad', 'Chandan'], order: 3 },
  { slug: 'tirupati', name: 'Tirumala Balaji', location: 'Tirumala, Andhra Pradesh', deitySlug: 'vishnu', aartiTime: 'Suprabhata Seva · 4:30 AM', offerings: ['Tulsi Mala', 'Laddu', 'Chandan'], order: 4 },
];

const AARTIS = [
  { title: 'Om Jai Jagdish Hare', artist: 'Anup Jalota', duration: '5:10', category: 'evening', order: 0 },
  { title: 'Hanuman Chalisa', artist: 'Hariharan', deitySlug: 'hanuman', duration: '7:30', category: 'morning', order: 1 },
  { title: 'Gayatri Mantra', artist: 'Suresh Wadkar', duration: '6:15', category: 'morning', order: 2 },
  { title: 'Shiv Tandav Stotram', artist: 'Shankar Mahadevan', deitySlug: 'shiva', duration: '8:02', category: 'evening', order: 3 },
  { title: 'Achyutam Keshavam', artist: 'Vivek Prakash', deitySlug: 'vishnu', duration: '5:45', category: 'meditation', order: 4 },
  { title: 'Aigiri Nandini', artist: 'Rajalakshmee', deitySlug: 'durga', duration: '6:30', category: 'meditation', order: 5 },
];

/**
 * Backfill `bookingEnabled` on temples created before the field existed.
 *
 * A Mongoose `default` only applies to new documents, so without this the
 * dashboard's new toggle reads as unset on every existing temple. Idempotent —
 * it only touches documents where the field is genuinely absent.
 *
 * This belongs in a versioned migration rather than in startup, which is
 * defect 10 in the low-level design; it lives here to match the pattern the
 * rest of this file already uses.
 */
async function backfillBookingFlag() {
  const res = await Temple.updateMany(
    { bookingEnabled: { $exists: false } },
    { $set: { bookingEnabled: true } },
  );
  if (res.modifiedCount) console.log(`✓ backfilled bookingEnabled on ${res.modifiedCount} temples`);
}

/**
 * Mirrors the app's bundled fallback calendar so a fresh install has
 * something to show. Approximate — verify against a panchang and correct
 * them from the dashboard, which is the whole point of storing them here.
 */
const FESTIVALS = [
  { slug: 'sharad-navratri', name: 'Sharad Navratri begins', nameHi: 'शारदीय नवरात्रि प्रारंभ', date: '2026-10-11', deitySlug: 'durga' },
  { slug: 'durga-ashtami', name: 'Durga Ashtami', nameHi: 'दुर्गा अष्टमी', date: '2026-10-18', deitySlug: 'durga' },
  { slug: 'dussehra', name: 'Vijayadashami', nameHi: 'विजयादशमी', date: '2026-10-20', deitySlug: 'durga' },
  { slug: 'karva-chauth', name: 'Karva Chauth', nameHi: 'करवा चौथ', date: '2026-10-29', deitySlug: 'shiva' },
  { slug: 'dhanteras', name: 'Dhanteras', nameHi: 'धनतेरस', date: '2026-11-06', deitySlug: 'lakshmi' },
  { slug: 'diwali', name: 'Diwali · Lakshmi Puja', nameHi: 'दिवाली · लक्ष्मी पूजा', date: '2026-11-08', deitySlug: 'lakshmi' },
  { slug: 'govardhan', name: 'Govardhan Puja', nameHi: 'गोवर्धन पूजा', date: '2026-11-09', deitySlug: 'krishna' },
  { slug: 'bhai-dooj', name: 'Bhai Dooj', nameHi: 'भाई दूज', date: '2026-11-10', deitySlug: 'krishna' },
  { slug: 'chhath', name: 'Chhath Puja', nameHi: 'छठ पूजा', date: '2026-11-15', deitySlug: 'vishnu' },
  { slug: 'gita-jayanti', name: 'Gita Jayanti', nameHi: 'गीता जयंती', date: '2026-12-20', deitySlug: 'krishna' },
  { slug: 'makar-sankranti', name: 'Makar Sankranti', nameHi: 'मकर संक्रांति', date: '2027-01-14', deitySlug: 'vishnu' },
  { slug: 'vasant-panchami', name: 'Vasant Panchami', nameHi: 'वसंत पंचमी', date: '2027-01-22', deitySlug: 'lakshmi' },
  { slug: 'maha-shivaratri', name: 'Maha Shivaratri', nameHi: 'महाशिवरात्रि', date: '2027-03-06', deitySlug: 'shiva' },
  { slug: 'holi', name: 'Holi', nameHi: 'होली', date: '2027-03-22', deitySlug: 'krishna' },
  { slug: 'ram-navami', name: 'Ram Navami', nameHi: 'राम नवमी', date: '2027-04-15', deitySlug: 'vishnu' },
  { slug: 'hanuman-jayanti', name: 'Hanuman Jayanti', nameHi: 'हनुमान जयंती', date: '2027-04-20', deitySlug: 'hanuman' },
];

/** Home carousel slides, previously hardcoded in `app/(tabs)/index.tsx`. */
const HERO_SLIDES = [
  { slug: 'sawan', title: 'Shravan Special', titleHi: 'सावन विशेष', subtitle: 'Key dates, fasts and festivals', subtitleHi: 'महत्वपूर्ण तिथियां, व्रत और त्योहार', deitySlug: 'shiva', order: 0 },
  { slug: 'darshan', title: 'Live Darshan', titleHi: 'लाइव दर्शन', subtitle: 'Straight from the sanctum', subtitleHi: 'मंदिर से सीधा प्रसारण', deitySlug: 'durga', href: '/darshan', order: 1 },
  { slug: 'chadhava', title: 'E-Chadhava', titleHi: 'ई-चढ़ावा', subtitle: 'Offer in your own name', subtitleHi: 'अपने नाम से अर्पण करें', deitySlug: 'ganesh', href: '/chadhava', order: 2 },
];

/** Seed default content only when a collection is empty. */
async function seedContent() {
  if ((await Deity.countDocuments()) === 0) await Deity.insertMany(DEITIES);
  else await backfillDeities();
  if ((await Aarti.countDocuments()) > 0) await backfillAartis();
  if ((await Temple.countDocuments()) === 0) await Temple.insertMany(TEMPLES);
  if ((await Aarti.countDocuments()) === 0) await Aarti.insertMany(AARTIS);
  if ((await Reminder.countDocuments()) === 0) await Reminder.insertMany(REMINDERS_SEED);
  if ((await Tone.countDocuments()) === 0) await Tone.insertMany(TONES_SEED);
  if ((await WallpaperStyle.countDocuments()) === 0)
    await WallpaperStyle.insertMany(WALLPAPER_STYLES_SEED);
  if ((await Festival.countDocuments()) === 0) await Festival.insertMany(FESTIVALS);
  if ((await Seva.countDocuments()) === 0) await Seva.insertMany(BUNDLED.sevas);
  if ((await Faq.countDocuments()) === 0) await Faq.insertMany(BUNDLED.faqs);
  if ((await Knowledge.countDocuments()) === 0) await Knowledge.insertMany(BUNDLED.knowledge);
  if ((await HeroSlide.countDocuments()) === 0) await HeroSlide.insertMany(HERO_SLIDES);

  // Settings are upserted per key, not seeded as a block, so a new key added
  // in a later release reaches databases that already have the others.
  for (const s of BUNDLED.settings) {
    await Setting.updateOne({ key: s.key }, { $setOnInsert: s }, { upsert: true });
  }

  // Backfill the palette/map fields onto temples that predate them — without
  // these a temple renders with no colours and no pin on the pilgrimage map.
  for (const t of BUNDLED.templePatch) {
    await Temple.updateOne(
      { slug: t.slug, accent: { $exists: false } },
      { $set: { ...t, slug: undefined } },
    ).catch(() => {});
  }
}
