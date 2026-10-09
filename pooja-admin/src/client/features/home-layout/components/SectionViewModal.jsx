import { ReadOnlyList, ViewOnlyModal } from '../../../ui/index.js';
import { describe } from '../lib/describe.js';
import { scheduleLabel } from '../lib/schedule.js';
import { LAYOUTS, TONES, nameOf, sourceOf } from '../lib/sources.js';

const labelOf = (list, v) => list.find((x) => x.value === v)?.label ?? v;

/** A block's details as text, for an account that cannot edit. */
export function SectionViewModal({ section, heroSlides, onClose }) {
  const src = sourceOf(section);
  return (
    <ViewOnlyModal title={nameOf(section)} subtitle={src.label} onClose={onClose}>
      <ReadOnlyList
        label="Section details"
        rows={[
          { label: 'Title (English)', value: section.title },
          { label: 'Title (Hindi)', value: section.titleHi },
          { label: 'Contents', value: describe(section, heroSlides) },
          { label: 'Band colour', value: labelOf(TONES, section.tone) },
          ...(section.source === 'custom' ? [{ label: 'Layout', value: labelOf(LAYOUTS, section.layout) }] : []),
          { label: 'Schedule', value: scheduleLabel(section) || 'Always' },
          { label: 'Items', value: (section.items || []).map((i) => i.title || i.deitySlug).join(', ') },
          { label: 'Visible', value: section.enabled ? 'On' : 'Off' },
        ]}
      />
    </ViewOnlyModal>
  );
}
