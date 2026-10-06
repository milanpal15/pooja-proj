import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, setUnauthorizedHandler } from './api.js';
import { ContentManager } from './ContentManager.jsx';
import { Login } from './Login.jsx';
import { Operators } from './Operators.jsx';
import { HoroscopeCopyDay } from './HoroscopeCopyDay.jsx';
import { Policies } from './Policies.jsx';
import { Users } from './Users.jsx';

/**
 * Tabs an editor must not see.
 *
 * Cosmetic only — the server enforces the same list in ADMIN_ONLY, and will
 * 403 an editor who reaches the endpoint by other means. Hiding them keeps
 * the dashboard honest about what this account can actually do, rather than
 * offering controls that fail.
 */
const ADMIN_TABS = new Set(['Overview', 'Feature Flags', 'Rules', 'Operators', 'Users', 'Payments', 'Visitors']);

const TABS = [
  'Overview',
  'Feature Flags',
  'Announcements',
  'Rules',
  'Deities',
  'Temples',
  'Aartis',
  'Festivals',
  'Sevas',
  'Knowledge',
  'FAQs',
  'Home Slides',
  'Horoscope',
  'Panchang',
  'Reminders',
  'Alert Tones',
  'Wallpapers',
  'Settings',
  'Operators',
  'Users',
  'Payments',
  'Visitors',
];

/**
 * A deity, including how the app draws one without a photograph.
 *
 * The sanctum renders a procedural murti when `imageUrl` is empty, tinted by
 * the palette and shaped by the geometry flags. Those used to live only in
 * the app bundle, so a deity added here came out grey and crownless.
 */
const DEITY_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', col: true },
  { key: 'title', label: 'Title', type: 'text', col: true },
  { key: 'mark', label: 'Mark', type: 'text' },
  { key: 'mantra', label: 'Mantra', type: 'text', col: true },
  { key: 'imageUrl', label: 'Image (overrides the drawn murti)', type: 'image' },
  { key: 'offerings', label: 'Offerings (comma-separated)', type: 'csv' },

  { key: 'accent', label: 'Accent — halo and glow', type: 'text' },
  { key: 'body', label: 'Murti tone', type: 'text' },
  { key: 'robe', label: 'Robe colour', type: 'text' },
  { key: 'trim', label: 'Trim — garlands, crown, jewellery', type: 'text' },
  {
    key: 'crown',
    label: 'Crown',
    type: 'select',
    options: [
      { value: 'plain', label: 'Plain' },
      { value: 'mukut', label: 'Mukut' },
      { value: 'jata', label: 'Jata — matted hair (Shiva)' },
      { value: 'tall', label: 'Tall' },
    ],
  },
  { key: 'crescent', label: 'Crescent moon in the hair', type: 'bool' },
  { key: 'serpent', label: 'Cobra at the shoulder', type: 'bool' },
  { key: 'elephant', label: 'Elephant head', type: 'bool' },
  { key: 'mace', label: 'Mace at the side', type: 'bool' },

  { key: 'slug', label: 'Slug (id)', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];
const TEMPLE_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', col: true },
  { key: 'location', label: 'Location', type: 'text', col: true },
  { key: 'deitySlug', label: 'Deity slug', type: 'text' },
  { key: 'aartiTime', label: 'Aarti time', type: 'text', col: true },
  // Left blank the app hides the rating row rather than inventing one.
  { key: 'rating', label: 'Rating (0-5)', type: 'number', col: true },
  { key: 'reviews', label: 'Rating count', type: 'number' },
  // YouTube link or a direct HLS/mp4 URL. Blank = not streaming.
  { key: 'liveUrl', label: 'Live darshan URL', type: 'text' },
  { key: 'imageUrl', label: 'Image', type: 'image' },
  { key: 'offerings', label: 'Offerings (comma-separated)', type: 'csv' },
  { key: 'bookingEnabled', label: 'Booking', type: 'bool', col: true },
  { key: 'slug', label: 'Slug (id)', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];
const ANNOUNCEMENT_FIELDS = [
  { key: 'title', label: 'Title', type: 'text', col: true },
  { key: 'bodyMd', label: 'Body (Markdown)', type: 'textarea' },
  {
    key: 'severity',
    label: 'Severity',
    type: 'select',
    col: true,
    options: [
      { value: 'info', label: 'Info — general notice' },
      { value: 'festival', label: 'Festival — auspicious occasion' },
      { value: 'urgent', label: 'Urgent — needs attention now' },
    ],
  },
  {
    key: 'channels',
    label: 'Deliver via',
    type: 'enumList',
    col: true,
    options: [
      { value: 'modal', label: 'In-app modal only' },
      { value: 'push', label: 'Push notification only' },
      { value: 'modal,push', label: 'Both — modal and push' },
    ],
  },
  { key: 'dismissible', label: 'Dismissible', type: 'bool' },
  { key: 'active', label: 'Live', type: 'bool', col: true },
];

const AARTI_FIELDS = [
  { key: 'title', label: 'Title', type: 'text', col: true },
  { key: 'artist', label: 'Artist', type: 'text', col: true },
  { key: 'deitySlug', label: 'Deity slug', type: 'text' },
  { key: 'duration', label: 'Duration', type: 'text', col: true },
  {
    key: 'category',
    label: 'Shelf',
    type: 'select',
    col: true,
    options: [
      { value: 'morning', label: 'Morning Mantras' },
      { value: 'evening', label: 'Evening Aarti' },
      { value: 'meditation', label: 'Meditation Music' },
    ],
  },
  { key: 'audioUrl', label: 'Audio', type: 'audio' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/**
 * Vrat & festival dates. Editable here rather than baked into the app because
 * the Hindu calendar is lunar — the dates shift every year, and a hardcoded
 * list runs dry silently, leaving the app's Home section blank.
 */
const FESTIVAL_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'name', label: 'Name (EN)', type: 'text', col: true },
  { key: 'nameHi', label: 'Name (HI)', type: 'text', col: true },
  { key: 'date', label: 'Date (YYYY-MM-DD)', type: 'text', col: true },
  { key: 'deitySlug', label: 'Deity slug', type: 'text', col: true },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** Bookable rites and their prices — used to be hardcoded in the app bundle. */
const SEVA_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'name', label: 'Name (EN)', type: 'text', col: true },
  { key: 'nameHi', label: 'Name (HI)', type: 'text' },
  { key: 'price', label: 'Price (₹)', type: 'number', col: true },
  { key: 'duration', label: 'Duration', type: 'text', col: true },
  { key: 'description', label: 'Description (EN)', type: 'text' },
  { key: 'descriptionHi', label: 'Description (HI)', type: 'text' },
  { key: 'templeSlug', label: 'Only at temple (slug)', type: 'text' },
  { key: 'deitySlugs', label: 'Deity slugs (comma-separated)', type: 'csv' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** Deity lore behind the Knowledge screen. */
const KNOWLEDGE_FIELDS = [
  { key: 'deitySlug', label: 'Deity slug', type: 'text', col: true },
  { key: 'epithet', label: 'Epithet (EN)', type: 'text', col: true },
  { key: 'epithetHi', label: 'Epithet (HI)', type: 'text' },
  { key: 'about', label: 'About (EN)', type: 'text' },
  { key: 'aboutHi', label: 'About (HI)', type: 'text' },
  { key: 'texts', label: 'Scriptures EN (comma-separated)', type: 'csv' },
  { key: 'textsHi', label: 'Scriptures HI (comma-separated)', type: 'csv' },
  { key: 'festivals', label: 'Festivals EN (comma-separated)', type: 'csv' },
  { key: 'festivalsHi', label: 'Festivals HI (comma-separated)', type: 'csv' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

const FAQ_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text' },
  { key: 'category', label: 'Category key', type: 'text', col: true },
  { key: 'categoryTitle', label: 'Category title (EN)', type: 'text' },
  { key: 'categoryTitleHi', label: 'Category title (HI)', type: 'text' },
  { key: 'question', label: 'Question (EN)', type: 'text', col: true },
  { key: 'questionHi', label: 'Question (HI)', type: 'text' },
  { key: 'answer', label: 'Answer (EN)', type: 'text' },
  { key: 'answerHi', label: 'Answer (HI)', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

const HERO_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'title', label: 'Title (EN)', type: 'text', col: true },
  { key: 'titleHi', label: 'Title (HI)', type: 'text' },
  { key: 'subtitle', label: 'Subtitle (EN)', type: 'text' },
  { key: 'subtitleHi', label: 'Subtitle (HI)', type: 'text' },
  { key: 'deitySlug', label: 'Deity slug (artwork)', type: 'text', col: true },
  { key: 'href', label: 'Opens route (e.g. /darshan)', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];


/** The temple's suggested daily cycle. A devotee's own alarms stay on their phone. */
const REMINDER_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'title', label: 'Title (EN)', type: 'text', col: true },
  { key: 'titleHi', label: 'Title (HI)', type: 'text' },
  { key: 'body', label: 'Notification text (EN)', type: 'text' },
  { key: 'bodyHi', label: 'Notification text (HI)', type: 'text' },
  { key: 'hour', label: 'Hour (0–23)', type: 'number', col: true },
  { key: 'minute', label: 'Minute', type: 'number', col: true },
  { key: 'icon', label: 'Icon', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/**
 * Alert tones. `sound` is a name bundled with the app (`bell`, `aarti`),
 * an absolute URL to an audio file, or blank for silent. A URL streams
 * through the real alarm; on the notification fallback it rings with the
 * device default, because an Android channel sound must be a bundled file.
 */
const TONE_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'title', label: 'Title (EN)', type: 'text', col: true },
  { key: 'titleHi', label: 'Title (HI)', type: 'text' },
  { key: 'desc', label: 'Description (EN)', type: 'text', col: true },
  { key: 'descHi', label: 'Description (HI)', type: 'text' },
  { key: 'sound', label: 'Sound — bundled name, URL, or blank for silent', type: 'text' },
  { key: 'icon', label: 'Icon', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

const WALLPAPER_STYLE_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'title', label: 'Title (EN)', type: 'text', col: true },
  { key: 'titleHi', label: 'Title (HI)', type: 'text', col: true },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** Local date as YYYY-MM-DD — never `toISOString()`, which is UTC and so
 *  rolls a day early for anyone east of Greenwich, India included. */
const todayKey = () => {
  const n = new Date();
  const z = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${z(n.getMonth() + 1)}-${z(n.getDate())}`;
};

/**
 * Daily readings, one row per sign per day.
 *
 * `rashi` + `date` are unique together. Editorial content — the app shows
 * nothing at all for a day with no rows rather than inventing a prediction.
 */
const HOROSCOPE_FIELDS = [
  {
    key: 'rashi',
    label: 'Rashi',
    type: 'select',
    col: true,
    options: [
      { value: 'mesha', label: 'Mesha (Aries)' },
      { value: 'vrishabha', label: 'Vrishabha (Taurus)' },
      { value: 'mithuna', label: 'Mithuna (Gemini)' },
      { value: 'karka', label: 'Karka (Cancer)' },
      { value: 'simha', label: 'Simha (Leo)' },
      { value: 'kanya', label: 'Kanya (Virgo)' },
      { value: 'tula', label: 'Tula (Libra)' },
      { value: 'vrischika', label: 'Vrischika (Scorpio)' },
      { value: 'dhanu', label: 'Dhanu (Sagittarius)' },
      { value: 'makara', label: 'Makara (Capricorn)' },
      { value: 'kumbha', label: 'Kumbha (Aquarius)' },
      { value: 'meena', label: 'Meena (Pisces)' },
    ],
  },
  { key: 'date', label: 'Date', type: 'date', col: true, default: todayKey },
  { key: 'prediction', label: 'Reading (EN)', type: 'textarea', col: true },
  { key: 'predictionHi', label: 'Reading (HI)', type: 'textarea' },
  { key: 'luckyColor', label: 'Lucky colour (EN)', type: 'text' },
  { key: 'luckyColorHi', label: 'Lucky colour (HI)', type: 'text' },
  { key: 'luckyNumber', label: 'Lucky number', type: 'text' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/**
 * Panchang override for one date.
 *
 * The app computes panchang on the device; this only overrides it. **Leave a
 * field blank and the device keeps its own computed value** — fill in only
 * what your tradition states differently. Times are free text, written the
 * way the temple publishes them.
 */
const PANCHANG_FIELDS = [
  { key: 'date', label: 'Date', type: 'date', col: true, default: todayKey },
  { key: 'tithi', label: 'Tithi', type: 'text', col: true },
  { key: 'paksha', label: 'Paksha', type: 'text', col: true },
  { key: 'nakshatra', label: 'Nakshatra', type: 'text', col: true },
  { key: 'yoga', label: 'Yoga', type: 'text' },
  { key: 'karana', label: 'Karana', type: 'text' },
  { key: 'masa', label: 'Masa', type: 'text' },
  { key: 'ritu', label: 'Ritu', type: 'text' },
  { key: 'sunrise', label: 'Sunrise (e.g. 5:51 AM)', type: 'text' },
  { key: 'sunset', label: 'Sunset (e.g. 5:40 PM)', type: 'text' },
  { key: 'abhijit', label: 'Abhijit Muhurat', type: 'text' },
  { key: 'rahuKaal', label: 'Rahu Kaal', type: 'text' },
  { key: 'yamaganda', label: 'Yamaganda', type: 'text' },
  { key: 'gulika', label: 'Gulika Kaal', type: 'text' },
  { key: 'note', label: 'Note shown to devotees (EN)', type: 'textarea' },
  { key: 'noteHi', label: 'Note shown to devotees (HI)', type: 'textarea' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** Single values: fees, support contacts. Stored as strings; the app coerces. */
const SETTING_FIELDS = [
  { key: 'key', label: 'Key', type: 'text', col: true },
  { key: 'value', label: 'Value', type: 'text', col: true },
  { key: 'label', label: 'Label', type: 'text', col: true },
  { key: 'desc', label: 'Description', type: 'text' },
];

/**
 * The gate around the dashboard.
 *
 * Asks the server whether a password is configured and whether this browser
 * already holds a session. Three outcomes: still asking (blank), no session
 * (login), authed — or no password configured at all, which only happens in
 * local development because production refuses to start that way.
 */
export function App() {
  const [authed, setAuthed] = useState(null); // null = not yet known
  /** Who is signed in, and as what. Drives which tabs exist. */
  const [me, setMe] = useState(null);

  const check = useCallback(() => {
    api
      .session()
      .then((s) => {
        setAuthed(!s.required || s.authed);
        setMe(s.authed ? { username: s.username ?? 'admin', role: s.role ?? 'admin' } : null);
      })
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    check();
    // Any 401 from anywhere in the app drops straight back to the login
    // screen, so an expired session does not look like a broken dashboard.
    setUnauthorizedHandler(() => setAuthed(false));
  }, [check]);

  if (authed === null) return null;
  if (!authed) return <Login onAuthed={check} />;
  return (
    <Dashboard
      me={me}
      onSignOut={() =>
        api.logout().finally(() => {
          setAuthed(false);
          setMe(null);
        })
      }
    />
  );
}

function Dashboard({ me, onSignOut }) {
  const [tab, setTabState] = useState(() => decodeURIComponent(location.hash.slice(1)) || 'Overview');
  const [online, setOnline] = useState(true);
  // The Horoscope tab is scoped to one day: the bar and the table below it
  // share this date, so "Copy previous day", the published counter and the
  // rows on screen always describe the same editorial day.
  const [horoDate, setHoroDate] = useState(todayKey);
  const [horoAllDates, setHoroAllDates] = useState(false);
  // Copying rewrites rows the table already listed — remount it to reload.
  const [horoReload, setHoroReload] = useState(0);
  // Any write, from either side, restates the bar's "N of 12 published".
  const [horoTick, setHoroTick] = useState(0);
  // A new reading starts on the day being edited, not blindly on today.
  const horoscopeFields = useMemo(
    () =>
      HOROSCOPE_FIELDS.map((f) => (f.key === 'date' ? { ...f, default: () => horoDate } : f)),
    [horoDate],
  );
  const setTab = (t) => {
    setTabState(t);
    location.hash = encodeURIComponent(t);
  };

  const isAdmin = me?.role !== 'editor';
  const visibleTabs = TABS.filter((t) => isAdmin || !ADMIN_TABS.has(t));
  // An editor landing on #Users — a stale bookmark, or a link from before
  // they were demoted — gets the first tab they can actually use.
  const current = visibleTabs.includes(tab) ? tab : visibleTabs[0];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="om">ॐ</span>
          <div>
            <div className="brand-title">Divine Temple</div>
            <div className="brand-sub">Admin Portal</div>
          </div>
        </div>
        <nav>
          {visibleTabs.map((t) => (
            <button
              key={t}
              className={t === current ? 'nav active' : 'nav'}
              onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <div className={online ? 'status ok' : 'status bad'}>
          <span className="dot" /> {online ? 'API connected' : 'API offline'}
          <div className="api-base">{api.base}</div>
        </div>
        {me && (
          <div className="whoami">
            {me.username} · {me.role}
          </div>
        )}
        <button className="nav sign-out" onClick={onSignOut}>
          Sign out
        </button>
      </aside>

      <main className="content">
        <h1>{current}</h1>
        {current === 'Overview' && <Overview setOnline={setOnline} />}
        {current === 'Feature Flags' && <Flags />}
        {current === 'Announcements' && (
          <ContentManager
            title="Announcement"
            resource={api.announcements}
            fields={ANNOUNCEMENT_FIELDS}
            previewKey="title"
            rowAction={{
              label: 'Push',
              title: 'Send this as a push notification to every registered device',
              run: (row) => api.pushAnnouncement(row._id),
              done: (r) => `Sent ${r.sent}, failed ${r.failed}`,
            }}
          />
        )}
        {current === 'Rules' && <Policies />}
        {current === 'Deities' && (
          <ContentManager title="Deity" resource={api.deities} fields={DEITY_FIELDS} previewKey="name" />
        )}
        {current === 'Temples' && (
          <ContentManager title="Temple" resource={api.temples} fields={TEMPLE_FIELDS} previewKey="name" />
        )}
        {current === 'Sevas' && (
          <ContentManager title="Seva" resource={api.sevas} fields={SEVA_FIELDS} previewKey="name" />
        )}
        {current === 'Knowledge' && (
          <ContentManager
            title="Knowledge"
            resource={api.knowledge}
            fields={KNOWLEDGE_FIELDS}
            previewKey="deitySlug"
          />
        )}
        {current === 'FAQs' && (
          <ContentManager title="FAQ" resource={api.faqs} fields={FAQ_FIELDS} previewKey="question" />
        )}
        {current === 'Home Slides' && (
          <ContentManager title="Slide" resource={api.hero} fields={HERO_FIELDS} previewKey="title" />
        )}
        {/* Readings are written one at a time in the table's modal; the bar
            above only picks the day and seeds it from the one before. */}
        {current === 'Horoscope' && (
          <HoroscopeCopyDay
            date={horoDate}
            onDateChange={setHoroDate}
            allDates={horoAllDates}
            onAllDatesChange={setHoroAllDates}
            version={horoTick}
            onCopied={() => {
              setHoroReload((v) => v + 1);
              setHoroTick((v) => v + 1);
            }}
          />
        )}
        {current === 'Horoscope' && (
          <ContentManager
            key={horoReload}
            title="Reading"
            resource={api.horoscopes}
            fields={horoscopeFields}
            previewKey="rashi"
            filterRows={horoAllDates ? undefined : (r) => r.date === horoDate}
            scopeNote={horoAllDates ? 'all dates' : horoDate}
            onChange={() => setHoroTick((v) => v + 1)}
          />
        )}
        {current === 'Panchang' && (
          <ContentManager
            title="Panchang"
            resource={api.panchangs}
            fields={PANCHANG_FIELDS}
            previewKey="date"
          />
        )}
        {current === 'Settings' && (
          <ContentManager
            title="Setting"
            resource={api.settings}
            fields={SETTING_FIELDS}
            previewKey="label"
          />
        )}
        {current === 'Festivals' && (
          <ContentManager
            title="Festival"
            resource={api.festivals}
            fields={FESTIVAL_FIELDS}
            previewKey="name"
          />
        )}
        {current === 'Aartis' && (
          <ContentManager title="Aarti" resource={api.aartis} fields={AARTI_FIELDS} previewKey="title" />
        )}
        {current === 'Reminders' && (
          <ContentManager
            title="Reminder"
            resource={api.reminders}
            fields={REMINDER_FIELDS}
            previewKey="title"
          />
        )}
        {current === 'Alert Tones' && (
          <ContentManager title="Tone" resource={api.tones} fields={TONE_FIELDS} previewKey="title" />
        )}
        {current === 'Wallpapers' && (
          <ContentManager
            title="Wallpaper style"
            resource={api.wallpaperStyles}
            fields={WALLPAPER_STYLE_FIELDS}
            previewKey="title"
          />
        )}
        {current === 'Operators' && <Operators me={me} />}
        {current === 'Users' && <Users />}
        {current === 'Payments' && <Payments />}
        {current === 'Visitors' && <Visitors />}
      </main>
    </div>
  );
}

/* --------------------------------------------------------------- hooks -- */

function usePoll(fn, deps = [], ms = 5000) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try {
      setData(await fn());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
    const id = setInterval(load, ms);
    return () => clearInterval(id);
  }, [load, ms]);
  return { data, err, reload: load };
}

/* ------------------------------------------------------------ overview -- */

function Overview({ setOnline }) {
  const { data, err } = usePoll(() => api.summary(), [], 4000);
  const { data: trend } = usePoll(() => api.trend(), [], 10000);
  useEffect(() => setOnline(!err), [err, setOnline]);

  if (err) return <ErrorNote msg={err} />;
  if (!data) return <p className="muted">Loading…</p>;

  const cards = [
    { label: 'Visitors', value: data.visitors },
    { label: 'Sessions', value: data.sessions },
    { label: 'Screen Views', value: data.screenViews },
    { label: 'Payments', value: data.payments },
    { label: 'Successful', value: data.successPayments },
    { label: 'Revenue', value: `₹${(data.revenue || 0).toLocaleString('en-IN')}` },
  ];

  const max = Math.max(1, ...(trend || []).map((t) => t.count));

  return (
    <>
      <div className="cards">
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <div className="card-value">{c.value}</div>
            <div className="card-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>Sessions · last 14 days</h2>
          <div className="chart">
            {(trend || []).map((t) => (
              <div className="bar-wrap" key={t.day} title={`${t.day}: ${t.count}`}>
                <div className="bar" style={{ height: `${(t.count / max) * 100}%` }} />
                <span className="bar-label">{t.day.slice(8)}</span>
              </div>
            ))}
            {(!trend || trend.length === 0) && <p className="muted">No sessions yet</p>}
          </div>
        </section>

        <section className="panel">
          <h2>Top Screens</h2>
          <ul className="list">
            {data.topScreens.map((s) => (
              <li key={s.screen}>
                <span>{s.screen}</span>
                <b>{s.count}</b>
              </li>
            ))}
            {data.topScreens.length === 0 && <p className="muted">No views yet</p>}
          </ul>
        </section>
      </div>

      <section className="panel">
        <h2>Recent Payments</h2>
        <PaymentTable rows={data.recentPayments} />
      </section>
    </>
  );
}

/* --------------------------------------------------------------- flags -- */

function Flags() {
  const { data, err, reload } = usePoll(() => api.flags(), [], 8000);
  const [busy, setBusy] = useState('');

  const toggle = async (key, enabled) => {
    setBusy(key);
    try {
      await api.setFlag(key, enabled);
      await reload();
    } finally {
      setBusy('');
    }
  };

  if (err) return <ErrorNote msg={err} />;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div className="panel">
      <p className="muted">
        Toggles here control the live mobile app. Changes apply on the app's next launch or
        refresh.
      </p>
      {data.map((f) => (
        <div className="flag" key={f.key}>
          <div>
            <div className="flag-label">{f.label || f.key}</div>
            <div className="flag-desc">{f.desc}</div>
          </div>
          <label className={`switch ${busy === f.key ? 'busy' : ''}`}>
            <input
              type="checkbox"
              checked={f.enabled}
              onChange={(e) => toggle(f.key, e.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ payments -- */

function Payments() {
  const { data, err } = usePoll(() => api.payments(), [], 5000);
  if (err) return <ErrorNote msg={err} />;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="panel">
      <PaymentTable rows={data} />
    </div>
  );
}

function PaymentTable({ rows }) {
  if (!rows || rows.length === 0) return <p className="muted">No payments yet</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Amount</th>
          <th>Method</th>
          <th>Status</th>
          <th>Note</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p._id}>
            <td>₹{Number(p.amount).toFixed(2)}</td>
            <td>{p.method}</td>
            <td>
              <span className={`pill ${p.status}`}>{p.status}</span>
            </td>
            <td className="muted">{p.note}</td>
            <td className="muted">{new Date(p.at).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------ visitors -- */

function Visitors() {
  const { data, err } = usePoll(() => api.visitors(), [], 6000);
  if (err) return <ErrorNote msg={err} />;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="panel">
      {data.length === 0 ? (
        <p className="muted">No visitors yet</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Device</th>
              <th>OS</th>
              <th>Sessions</th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody>
            {data.map((v) => (
              <tr key={v._id}>
                <td>{v.model || v.deviceId}</td>
                <td className="muted">{v.os}</td>
                <td>{v.sessions}</td>
                <td className="muted">{new Date(v.lastActive).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ErrorNote({ msg }) {
  return (
    <div className="error">
      <b>Can't reach the API.</b> {msg}
      <div className="muted">Start the backend: <code>cd server &amp;&amp; npm run dev</code></div>
    </div>
  );
}
