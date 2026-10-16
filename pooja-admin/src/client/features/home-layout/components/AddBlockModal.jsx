import { Button, Modal } from '../../../ui/index.js';
import { groupTypes } from '../lib/registry.js';

/** The palette: every block type the registry lists, grouped. Picking one adds it after the selected block. */
export function AddBlockModal({ reg, onPick, onClose }) {
  return (
    <Modal open onClose={onClose} title="Add a section" subtitle="It goes in after the section you have selected." size="md" footer={<Button variant="secondary" onClick={onClose}>Cancel</Button>}>
      {reg.types.length === 0 && <p className="ui-field__hint">The registry lists no section types.</p>}
      {groupTypes(reg.types.filter((t) => !t.fixed)).map((g) => (
        <section key={g.label} className="hl2-palette__group">
          <h3 className="hl2-palette__label">{g.label}</h3>
          <ul className="hl2-palette">
            {g.types.map((t) => (
              <li key={t.type}>
                <button type="button" className="hl2-palette__item" onClick={() => onPick(t)}>
                  <b>{t.title}</b>
                  <span>{t.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  );
}
