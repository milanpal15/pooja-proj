import { useContext } from 'react';

import { Accordion, Badge, Button, Field } from '../../../ui/index.js';
import { countUnder } from '../lib/errors.js';
import { summaryLine } from '../lib/summary.js';
import { ActionFields, MoreText, WhoSees } from './CommonFields.jsx';
import { BuilderContext, useBuilder } from './BuilderContext.js';
import { DataEditor } from './DataEditor.jsx';
import { Glyph } from './Glyph.jsx';
import { SchemaFields } from './SchemaFields.jsx';

const COMMON_TARGET = ['audience', 'startsAt', 'endsAt', 'language', 'flag'];
const COMMON_ACTION = ['action', 'actionLabel', 'actionLabelHi'];
const MORE = ['titleHi', 'subtitle', 'subtitleHi', 'tone'];
const sum = (errs, keys) => keys.reduce((n, k) => n + countUnder(errs, k), 0);
const Bad = ({ n }) => (n ? <Badge tone="danger">{n} to fix</Badge> : null);

export const FOOTNOTE = 'Sections with data (poojas, chadhava, live darshan, your next seva) hide themselves when they have nothing to show, so Home never shows an empty block.';

/** The panel's title row: type icon, the section's name and its Duplicate / Remove. */
function Head({ icon, name, children }) {
  return (
    <div className="hl3-edhead">
      <span className="hl3-ic"><Glyph name={icon} /></span>
      <b className="hl3-edhead__name">{name}</b>
      {children}
    </div>
  );
}

/**
 * The selected section's form, generated from the registry: LOOK (the title, then the type's
 * props: a short enum such as the column count or the tile style is a segmented control),
 * the tiles or the live source, the tap action, then WHO SEES THIS SECTION. No section type
 * is named anywhere in here.
 */
export function BlockForm({ block, onChange, onDuplicate, onRemove }) {
  const { reg, errors, dis, err, ro } = useBuilder();
  const type = reg.typeMap[block.type];
  const propsBad = countUnder(errors, 'props');
  const dataBad = countUnder(errors, 'data');
  const hasData = type && type.data.modes.length > 0;
  const onlyInline = hasData && type.data.modes.length === 1 && type.data.modes[0] === 'inline';
  return (
    <div className="hl3-editor">
      <Head icon={type?.icon} name={block.title || type?.title || block.type}>
        {!ro && (
          <>
            <Button variant="outline" size="sm" onClick={onDuplicate}>Duplicate</Button>
            <Button variant="outline" size="sm" onClick={onRemove}>Remove</Button>
          </>
        )}
      </Head>
      <div className="hl3-edbody">
        {errors[''] && <p className="ui-field__error" role="alert">{errors['']}</p>}
        {!type && <p className="ui-field__hint">This section type is not in the registry. The app skips it if it does not know it.</p>}
        <section className="hl3-group">
          <div className="hl3-label">Look <Bad n={propsBad + sum(errors, ['title'])} /></div>
          <Field label="Section title" value={block.title} maxLength={reg.limits.text} placeholder={type?.title ? `No title (${type.title.toLowerCase()})` : ''} error={err('title')} onChange={(v) => onChange({ title: v })} {...dis} />
          {type?.props && <SchemaFields schema={type.props} values={block.props || {}} onChange={(props) => onChange({ props })} base="props" />}
          <Accordion title="Hindi title, subtitle and colour" summary={sum(errors, MORE) ? `${sum(errors, MORE)} to fix` : ''} defaultOpen={sum(errors, MORE) > 0}>
            <MoreText block={block} onChange={onChange} />
          </Accordion>
          {type?.minAppVersion && <p className="ui-field__hint">Needs app version {type.minAppVersion} or newer; older apps skip it.</p>}
        </section>
        {hasData && (
          <section className="hl3-group hl3-group--rule">
            {!onlyInline && <div className="hl3-label">Content <Bad n={dataBad} /></div>}
            <DataEditor block={block} type={type} onChange={(data) => onChange({ data })} />
          </section>
        )}
        <section className="hl3-group hl3-group--rule">
          <Accordion title="Tap action" summary={sum(errors, COMMON_ACTION) ? `${sum(errors, COMMON_ACTION)} to fix` : block.action?.type && block.action.type !== 'none' ? block.action.type : ''} defaultOpen={sum(errors, COMMON_ACTION) > 0}>
            <ActionFields block={block} onChange={onChange} />
          </Accordion>
        </section>
        <section className="hl3-group hl3-group--rule">
          <div className="hl3-label">Who sees this section <Bad n={sum(errors, COMMON_TARGET)} /></div>
          <WhoSees block={block} onChange={onChange} />
        </section>
        <p className="hl3-note">{FOOTNOTE}</p>
        <p className="hl3-note hl3-note--id">{summaryLine(block, reg)} · id {block.id}</p>
      </div>
    </div>
  );
}

/**
 * "Top bar and search": the locked row. The blocks behind it (the registry's fixed types) cannot be switched off,
 * moved, removed or targeted, but their own options (the wallet chip, the search hint) can be edited.
 */
export function FixedForm({ blocks, errorsFor, onChange }) {
  const builder = useContext(BuilderContext);
  return (
    <div className="hl3-editor">
      <Head icon="search" name="Top bar and search"><Badge tone="neutral">Fixed</Badge></Head>
      <div className="hl3-edbody">
        <p className="ui-field__hint">These two sections open every layout and cannot be switched off, moved, removed or limited to an audience.</p>
        {blocks.map((b) => {
          const type = builder.reg.typeMap[b.type];
          return (
            <BuilderContext.Provider key={b.id} value={{ ...builder, errors: errorsFor(b.id) }}>
              <section className="hl3-group hl3-group--rule">
                <div className="hl3-label">{type?.title || b.type}</div>
                {type?.description && <p className="ui-field__hint">{type.description}</p>}
                {type?.props ? <SchemaFields schema={type.props} values={b.props || {}} onChange={(props) => onChange(b.id, { props })} base="props" /> : null}
              </section>
            </BuilderContext.Provider>
          );
        })}
      </div>
    </div>
  );
}
