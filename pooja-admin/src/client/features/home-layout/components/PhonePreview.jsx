import { useEffect, useRef } from 'react';

import { api } from '../../../lib/api/index.js';
import { Segmented } from '../../../ui/index.js';
import { previewModel, visibilityLabel } from '../lib/preview.js';

const initial = (s) => (s ? String(s).trim().charAt(0).toUpperCase() : '·');

function Tile({ it, shape }) {
  return (
    <li className={`hl2-tile hl2-tile--${shape}`}>
      <span className="hl2-tile__art" style={it.image ? { backgroundImage: `url(${api.asset(it.image)})` } : undefined}>
        {!it.image && <span aria-hidden="true">{it.icon ? it.icon.slice(0, 2) : initial(it.title)}</span>}
        {it.live && <i className="hl2-tile__live">LIVE</i>}
        {it.badge && <i className="hl2-tile__badge">{it.badge}</i>}
      </span>
      <span className="hl2-tile__name">{it.title || '(untitled)'}</span>
      {shape === 'row' && it.subtitle && <span className="hl2-tile__sub">{it.subtitle}</span>}
    </li>
  );
}

/** One block drawn from its model: a card with title, tone and what it holds. */
function PreviewBlock({ m, selected, onSelect }) {
  const off = m.visibility;
  return (
    <li className={`hl2-pv ${m.tone ? `hl-tone-${m.tone}` : ''} ${selected ? 'hl2-pv--on' : ''} ${off ? 'hl2-pv--off' : ''} ${m.kind === 'gap' ? 'hl2-pv--gap' : ''}`}>
      <button type="button" className="hl2-pv__hit" aria-label={`Select ${m.title || m.typeTitle}`} aria-current={selected ? 'true' : undefined} onClick={() => onSelect(m.id)} />
      {m.kind === 'gap' ? (
        <div className="hl2-pv__gap" style={{ height: Math.min(m.height, 96) / 2 + 12 }}><span>{m.typeTitle} · {m.height}px</span></div>
      ) : (
        <>
          <div className="hl2-pv__head">
            <span className="hl2-pv__title">{m.title || m.typeTitle}</span>
            {m.hasAction && <span className="hl2-pv__see">{m.actionLabel || 'See all'} ›</span>}
          </div>
          {m.subtitle && <div className="hl2-pv__sub">{m.subtitle}</div>}
          {m.kind === 'source' && (
            <div className="hl2-pv__hatch">live source: <b>{m.source}</b>{m.auth ? ' · signed-in only' : ''}{m.limit ? ` · up to ${m.limit}` : ''}</div>
          )}
          {m.kind === 'items' && (m.items.length === 0 ? (
            <div className="hl2-pv__empty">No cards yet</div>
          ) : (
            <ul className={`hl2-tiles hl2-tiles--${m.shape}`} style={m.cols ? { gridTemplateColumns: `repeat(${m.cols}, minmax(0, 1fr))` } : undefined}>
              {m.items.slice(0, m.cols ? m.cols * 2 : 6).map((it, i) => <Tile key={i} it={it} shape={m.shape} />)}
              {m.items.length > (m.cols ? m.cols * 2 : 6) && <li className="hl2-tile__more">+{m.items.length - (m.cols ? m.cols * 2 : 6)} more</li>}
            </ul>
          ))}
          {m.kind === 'plain' && (m.note || m.icon) && <div className="hl2-pv__plain">{m.note}{m.note && m.icon ? ' · ' : ''}{m.icon ? `icon: ${m.icon}` : ''}</div>}
        </>
      )}
      <div className="hl2-pv__meta">
        {m.unknownType && <span className="hl2-pv__chip hl2-pv__chip--warn">unknown type</span>}
        {off && <span className="hl2-pv__chip hl2-pv__chip--warn">{visibilityLabel(off)}</span>}
        {m.flag && <span className="hl2-pv__chip">flag: {m.flag}</span>}
        {m.language !== 'all' && <span className="hl2-pv__chip">{m.language.toUpperCase()} only</span>}
      </div>
    </li>
  );
}

/**
 * A schematic phone drawn from the layout JSON alone. It does not run the app:
 * live sources are hatched placeholders, and a block that would not show
 * (off, out of its dates, or in the other language) is greyed. The language
 * toggle only changes which texts and language-limited blocks are drawn.
 */
export function PhonePreview({ blocks, reg, selectedId, lang, onLang, onSelect }) {
  const now = Date.now();
  const screen = useRef(null);
  // Keep the selected block in view inside the phone (scrolls the phone, never the page).
  useEffect(() => {
    const el = screen.current?.querySelector('[aria-current="true"]')?.parentElement;
    const box = screen.current;
    if (el && box) box.scrollTo({ top: Math.max(0, el.offsetTop - 20), behavior: 'smooth' });
  }, [selectedId]);
  return (
    <div className="hl2-phone">
      <div className="hl2-phone__bar">
        <h2 className="hl2-h">Preview</h2>
        <Segmented label="Preview language" options={[{ value: 'en', label: 'EN' }, { value: 'hi', label: 'HI' }]} value={lang} onChange={onLang} />
      </div>
      <div className="hl2-phone__frame">
        <ol ref={screen} className="hl2-phone__screen" aria-label="Schematic phone preview">
          {blocks.map((b) => <PreviewBlock key={b.id} m={previewModel(b, reg, { now, lang })} selected={b.id === selectedId} onSelect={onSelect} />)}
          {blocks.length === 0 && <li className="hl2-pv__empty">Empty Home</li>}
        </ol>
      </div>
      <p className="hl2-phone__note">A sketch from the layout, not the app. Hatched blocks fill from live data on the phone.</p>
    </div>
  );
}
