import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { shownBlocks, visibilityLabel } from '../lib/preview.js';
import { FIXED_ID } from './SectionList.jsx';
import { Glyph } from './Glyph.jsx';

/** One tile of a grid / shelf, in the active tile style. */
function Tile({ it, shape, tileStyle }) {
  if (tileStyle === 'pill') return <li className="hl3-tilechip">{it.title || '·'}</li>;
  return (
    <li className={`hl3-pvtile hl3-pvtile--${shape} ${tileStyle === 'image' ? 'hl3-pvtile--image' : ''}`}>
      <span className="hl3-pvtile__art" style={it.image ? { backgroundImage: `url(${api.asset(it.image)})` } : undefined}>
        {!it.image && <Glyph name={it.icon} size={14} />}
        {it.live && <i className="hl3-pvtile__live">LIVE</i>}
        {it.badge && <i className="hl3-pvtile__badge">{it.badge}</i>}
      </span>
      {tileStyle !== 'image' && <span className="hl3-pvtile__name">{it.title}</span>}
    </li>
  );
}

function Body({ m }) {
  if (m.art === 'topbar') return <div className="hl3-pv__top"><i className="hl3-pv__ring" /><i className="hl3-pv__bar" /><i className="hl3-pv__chip" /></div>;
  if (m.art === 'search') return null;
  if (m.art === 'chips' && m.kind !== 'items') return <div className="hl3-pv__chips">{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</div>;
  if (m.kind === 'gap') return <div className="hl3-pv__gap" style={{ height: Math.min(m.height, 96) / 2 + 8 }}>{m.height}px</div>;
  if (m.kind === 'items') {
    if (m.items.length === 0) return <div className="hl3-pv__empty">Nothing in this section yet</div>;
    const cap = m.cols ? m.cols * 3 : 6;
    return (
      <ul className={`hl3-pvtiles hl3-pvtiles--${m.shape} ${m.tileStyle === 'pill' ? 'hl3-pvtiles--pill' : ''}`} style={m.cols && m.tileStyle !== 'pill' ? { gridTemplateColumns: `repeat(${m.cols}, minmax(0, 1fr))` } : undefined}>
        {m.items.slice(0, cap).map((it, i) => <Tile key={i} it={it} shape={m.shape} tileStyle={m.tileStyle} />)}
        {m.items.length > cap && <li className="hl3-pvtile__more">+{m.items.length - cap} more</li>}
      </ul>
    );
  }
  if (m.kind === 'source') return <div className="hl3-pv__src">live: {m.source}{m.limit ? ` · up to ${m.limit}` : ''}</div>;
  return null;
}

/** One block drawn from its model, in the design's flat style. */
function PreviewBlock({ m, selected, onSelect }) {
  const label = m.title || m.typeTitle;
  const cls = ['hl3-pv', `hl3-pv--${m.art || m.kind}`, m.tone ? `hl-tone-${m.tone}` : '', selected ? 'hl3-pv--on' : '', m.visibility ? 'hl3-pv--off' : ''].filter(Boolean).join(' ');
  return (
    <li className={cls}>
      <button type="button" className="hl3-pv__hit" aria-label={`Select ${label}`} aria-current={selected ? 'true' : undefined} onClick={() => onSelect(m.id)} />
      {m.art !== 'topbar' && m.art !== 'search' && <em className="hl3-pv__em">{label}{selected ? ' · editing' : ''}{m.visibility ? ` · ${visibilityLabel(m.visibility)}` : ''}</em>}
      <Body m={m} />
    </li>
  );
}

/**
 * LIVE PREVIEW: a schematic phone drawn from the layout JSON alone, as the chosen "Preview as"
 * person would see it (sections they would not see are left out, except the one being edited,
 * which stays, greyed, so it can still be edited). It does not run the app.
 */
export function PhonePreview({ blocks, reg, fixed, selectedId, persona, onSelect, note }) {
  const screen = useRef(null);
  const [scroll, setScroll] = useState({ page: 1, pages: 1 });
  const now = Date.now();
  const keep = selectedId === FIXED_ID ? null : selectedId;
  const opts = { now, lang: persona.lang, persona };
  const models = shownBlocks(blocks, reg, opts, keep);
  // The fixed pair is selected as one row; its blocks draw highlighted together.
  const fixedIds = new Set(blocks.slice(0, fixed).map((b) => b.id));

  const measure = useCallback(() => {
    const el = screen.current;
    if (!el) return;
    const h = el.clientHeight || 1;
    setScroll({ page: Math.min(Math.ceil(el.scrollHeight / h), Math.floor(el.scrollTop / h) + 1), pages: Math.max(1, Math.ceil((el.scrollHeight - 1) / h)) });
  }, []);
  useLayoutEffect(measure, [measure, models.length, blocks, persona]);
  useEffect(() => {
    const el = screen.current?.querySelector('[aria-current="true"]')?.parentElement;
    const box = screen.current;
    if (el && box) box.scrollTo({ top: Math.max(0, el.offsetTop - 20), behavior: 'smooth' });
  }, [selectedId]);

  return (
    <div className="hl3-phone">
      <div className="hl3-label hl3-phone__head">Live preview<span>Scroll {scroll.page} of {scroll.pages}</span></div>
      <div className="hl3-phone__frame">
        <div className="hl3-phone__screen">
          <ol ref={screen} className="hl3-phone__scroll" aria-label="Schematic phone preview" onScroll={measure}>
            {models.map((m) => <PreviewBlock key={m.id} m={m} selected={m.id === selectedId || (selectedId === FIXED_ID && fixedIds.has(m.id))} onSelect={(id) => onSelect(fixedIds.has(id) ? FIXED_ID : id)} />)}
            {models.length === 0 && <li className="hl3-pv__empty">Empty Home</li>}
          </ol>
          <div className="hl3-phone__nav" aria-hidden="true"><i className="hl3-phone__tab hl3-phone__tab--on" /><i /><i /><i /><i /></div>
        </div>
      </div>
      <p className="hl3-note hl3-note--c">Click a block to edit it. The preview follows the “Preview as” choice above.</p>
      {note && <p className="hl3-note hl3-note--c hl3-note--warn">{note}</p>}
    </div>
  );
}
