import { LAYOUTS, TONES, sourceOf } from './sources.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const labelOf = (list, value) => list.find((x) => x.value === value)?.label ?? value;

/** The row's second line: what is in the block, in the operator's words. */
export function describe(section, heroSlides) {
  const src = sourceOf(section);
  const n = section.items?.length ?? 0;
  switch (section.source) {
    case 'hero': {
      if (!heroSlides) return 'Image or HTML slides';
      const scheduled = heroSlides.filter((s) => s.startsAt || s.endsAt).length;
      return `${plural(heroSlides.length, 'slide')} · ${scheduled} scheduled · image or HTML`;
    }
    case 'grid':
      return `${plural(n, 'tile')} · NEW and Coming-soon badges`;
    case 'daily':
      return `${plural(n, 'row')} + muhurat countdown from Panchang`;
    case 'features':
      return `${plural(n, 'card')} · each follows its flag`;
    case 'knowledge':
      return n ? `${plural(n, 'deity')} chosen · photo tiles from Knowledge` : src.note;
    case 'custom':
      return `${labelOf(LAYOUTS, section.layout || 'photo3')} · ${plural(n, 'item')} · ${labelOf(TONES, section.tone || 'gold').toLowerCase()} band`;
    default:
      return src.note;
  }
}
