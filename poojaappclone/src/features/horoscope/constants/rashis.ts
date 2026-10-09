import type { IconName } from '@/components/ui';

/**
 * The twelve rashis.
 *
 * `id` matches the slug the dashboard publishes readings against, so a row
 * entered for `mesha` reaches the Mesha card and nothing else. Dates of birth
 * are not collected anywhere — the devotee picks their own sign.
 */
export type Rashi = {
  id: string;
  name: string;
  nameHi: string;
  /** The familiar western name, which many devotees recognise faster. */
  western: string;
  /** Sanskrit glyph shown on the chip. */
  mark: string;
  icon: IconName;
};

export const RASHIS: Rashi[] = [
  { id: 'mesha', name: 'Mesha', nameHi: 'मेष', western: 'Aries', mark: 'मे', icon: 'sparkle' },
  { id: 'vrishabha', name: 'Vrishabha', nameHi: 'वृषभ', western: 'Taurus', mark: 'वृ', icon: 'star' },
  { id: 'mithuna', name: 'Mithuna', nameHi: 'मिथुन', western: 'Gemini', mark: 'मि', icon: 'person' },
  { id: 'karka', name: 'Karka', nameHi: 'कर्क', western: 'Cancer', mark: 'क', icon: 'lotus' },
  { id: 'simha', name: 'Simha', nameHi: 'सिंह', western: 'Leo', mark: 'सिं', icon: 'diya' },
  { id: 'kanya', name: 'Kanya', nameHi: 'कन्या', western: 'Virgo', mark: 'क', icon: 'marigold' },
  { id: 'tula', name: 'Tula', nameHi: 'तुला', western: 'Libra', mark: 'तु', icon: 'shankh' },
  { id: 'vrischika', name: 'Vrischika', nameHi: 'वृश्चिक', western: 'Scorpio', mark: 'वृ', icon: 'sparkle' },
  { id: 'dhanu', name: 'Dhanu', nameHi: 'धनु', western: 'Sagittarius', mark: 'ध', icon: 'star' },
  { id: 'makara', name: 'Makara', nameHi: 'मकर', western: 'Capricorn', mark: 'म', icon: 'temple' },
  { id: 'kumbha', name: 'Kumbha', nameHi: 'कुम्भ', western: 'Aquarius', mark: 'कुं', icon: 'shankh' },
  { id: 'meena', name: 'Meena', nameHi: 'मीन', western: 'Pisces', mark: 'मी', icon: 'lotus' },
];

export const RASHI_STORAGE_KEY = 'pooja.rashi';
