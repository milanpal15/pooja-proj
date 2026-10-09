import { useId, useState } from 'react';

/**
 * A disclosure: a button that opens its panel. For long forms split into
 * sections the operator opens one at a time. `summary` is the quiet text on
 * the right ("3 items"), so a closed section still says what it holds.
 *
 * @typedef {Object} AccordionProps
 * @property {string} title
 * @property {string} [summary]
 * @property {boolean} [defaultOpen]
 */
export function Accordion({ title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = useId();
  return (
    <section className={`ui-acc ${open ? 'ui-acc--open' : ''}`}>
      <h3 className="ui-acc__head">
        <button type="button" className="ui-acc__btn" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
          <span className="ui-acc__chev" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className="ui-acc__title">{title}</span>
          {summary && <span className="ui-acc__sum">{summary}</span>}
        </button>
      </h3>
      <div id={panel} className="ui-acc__panel" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
