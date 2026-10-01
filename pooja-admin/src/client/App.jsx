import { useCallback, useEffect, useState } from 'react';

import { api } from './api.js';
import { ContentManager } from './ContentManager.jsx';
import { Policies } from './Policies.jsx';
import { Users } from './Users.jsx';

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
  'Settings',
  'Users',
  'Payments',
  'Visitors',
];

const DEITY_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', col: true },
  { key: 'title', label: 'Title', type: 'text', col: true },
  { key: 'mark', label: 'Mark', type: 'text' },
  { key: 'mantra', label: 'Mantra', type: 'text', col: true },
  { key: 'imageUrl', label: 'Image', type: 'image' },
  { key: 'accent', label: 'Accent color', type: 'text' },
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

/** Single values: fees, support contacts. Stored as strings; the app coerces. */
const SETTING_FIELDS = [
  { key: 'key', label: 'Key', type: 'text', col: true },
  { key: 'value', label: 'Value', type: 'text', col: true },
  { key: 'label', label: 'Label', type: 'text', col: true },
  { key: 'desc', label: 'Description', type: 'text' },
];

export function App() {
  const [tab, setTabState] = useState(() => decodeURIComponent(location.hash.slice(1)) || 'Overview');
  const [online, setOnline] = useState(true);
  const setTab = (t) => {
    setTabState(t);
    location.hash = encodeURIComponent(t);
  };

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
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'nav active' : 'nav'} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <div className={online ? 'status ok' : 'status bad'}>
          <span className="dot" /> {online ? 'API connected' : 'API offline'}
          <div className="api-base">{api.base}</div>
        </div>
      </aside>

      <main className="content">
        <h1>{tab}</h1>
        {tab === 'Overview' && <Overview setOnline={setOnline} />}
        {tab === 'Feature Flags' && <Flags />}
        {tab === 'Announcements' && (
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
        {tab === 'Rules' && <Policies />}
        {tab === 'Deities' && (
          <ContentManager title="Deity" resource={api.deities} fields={DEITY_FIELDS} previewKey="name" />
        )}
        {tab === 'Temples' && (
          <ContentManager title="Temple" resource={api.temples} fields={TEMPLE_FIELDS} previewKey="name" />
        )}
        {tab === 'Sevas' && (
          <ContentManager title="Seva" resource={api.sevas} fields={SEVA_FIELDS} previewKey="name" />
        )}
        {tab === 'Knowledge' && (
          <ContentManager
            title="Knowledge"
            resource={api.knowledge}
            fields={KNOWLEDGE_FIELDS}
            previewKey="deitySlug"
          />
        )}
        {tab === 'FAQs' && (
          <ContentManager title="FAQ" resource={api.faqs} fields={FAQ_FIELDS} previewKey="question" />
        )}
        {tab === 'Home Slides' && (
          <ContentManager title="Slide" resource={api.hero} fields={HERO_FIELDS} previewKey="title" />
        )}
        {tab === 'Settings' && (
          <ContentManager
            title="Setting"
            resource={api.settings}
            fields={SETTING_FIELDS}
            previewKey="label"
          />
        )}
        {tab === 'Festivals' && (
          <ContentManager
            title="Festival"
            resource={api.festivals}
            fields={FESTIVAL_FIELDS}
            previewKey="name"
          />
        )}
        {tab === 'Aartis' && (
          <ContentManager title="Aarti" resource={api.aartis} fields={AARTI_FIELDS} previewKey="title" />
        )}
        {tab === 'Users' && <Users />}
        {tab === 'Payments' && <Payments />}
        {tab === 'Visitors' && <Visitors />}
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
