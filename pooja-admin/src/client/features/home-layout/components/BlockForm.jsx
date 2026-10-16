import { Badge, Card, Switch } from '../../../ui/index.js';
import { countUnder } from '../lib/errors.js';
import { ActionFields, TargetingFields, TextFields } from './CommonFields.jsx';
import { useBuilder } from './BuilderContext.js';
import { DataEditor } from './DataEditor.jsx';
import { SchemaFields } from './SchemaFields.jsx';

const COMMON_TARGET = ['startsAt', 'endsAt', 'language', 'flag'];
const COMMON_ACTION = ['action', 'actionLabel', 'actionLabelHi'];
const sum = (errs, keys) => keys.reduce((n, k) => n + countUnder(errs, k), 0);
const Bad = ({ n }) => (n ? <Badge tone="danger">{n} to fix</Badge> : null);

/**
 * The selected block's form, generated from the registry: the common fields,
 * then `props` from the type's schema, then the data editor. No block type is
 * named anywhere in here.
 */
export function BlockForm({ block, onChange }) {
  const { reg, errors, dis } = useBuilder();
  const type = reg.typeMap[block.type];
  const patch = (p) => onChange(p);
  const propsBad = countUnder(errors, 'props');
  const dataBad = countUnder(errors, 'data');
  return (
    <div className="hl2-form">
      <Card
        title={type?.title || block.type}
        description={type?.description || (type ? '' : 'This block type is not in the registry. The app skips it if it does not know it.')}
        actions={<span className="hl2-id">{block.id}</span>}>
        <div className="hl2-fields">
          {errors[''] && <p className="ui-field__error" role="alert">{errors['']}</p>}
          <Switch variant="card" label="Shown on Home" hint="Switched off, the block stays in the layout but the phone skips it." checked={block.enabled !== false} onChange={(v) => patch({ enabled: v })} {...dis} />
          <TextFields block={block} onChange={patch} />
          {type?.minAppVersion && <p className="ui-field__hint">Needs app version {type.minAppVersion} or newer; older apps skip it.</p>}
        </div>
      </Card>
      {type?.props && (
        <Card title="Options" actions={<Bad n={propsBad} />}>
          <SchemaFields schema={type.props} values={block.props || {}} onChange={(props) => patch({ props })} base="props" />
        </Card>
      )}
      {type && type.data.modes.length > 0 && (
        <Card title="Content" actions={<Bad n={dataBad} />}>
          <DataEditor block={block} type={type} onChange={(data) => patch({ data })} />
        </Card>
      )}
      <Card title="Targeting" description="Schedule, language and feature flag. The same layout goes to everyone; there are no per-person rules." actions={<Bad n={sum(errors, COMMON_TARGET)} />}>
        <TargetingFields block={block} onChange={patch} />
      </Card>
      <Card title="Tap action" actions={<Bad n={sum(errors, COMMON_ACTION)} />}>
        <ActionFields block={block} onChange={patch} />
      </Card>
    </div>
  );
}
