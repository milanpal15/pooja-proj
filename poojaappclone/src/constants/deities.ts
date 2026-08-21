/**
 * Deity catalogue for the mandir screen. The horizontal strip at the top of the
 * screen scrolls through these and swaps the idol in the sanctum.
 */

import type { ImageSourcePropType } from 'react-native';

export type CrownKind = 'jata' | 'mukut' | 'tall' | 'plain';

export type Deity = {
  id: string;
  /** Hindi label shown in the strip and the title pill. */
  name: string;
  /** Full honorific for the header. */
  title: string;
  /** Skin / murti tone. */
  body: string;
  /** Robe colour. */
  robe: string;
  /** Halo + glow. */
  accent: string;
  /** Trim used for garlands, crown and jewellery. */
  trim: string;
  crown: CrownKind;
  /** Crescent moon in the hair (Shiva). */
  crescent?: boolean;
  /** Cobra behind the shoulder (Shiva). */
  serpent?: boolean;
  /** Elephant head (Ganesha). */
  elephant?: boolean;
  /** Mace resting at the side (Hanuman). */
  mace?: boolean;
  /**
   * Real murti artwork. When set, the sanctum renders this instead of the
   * procedural figure — drop in a transparent PNG/WebP and everything else
   * (halo, aarti orbit, marigolds) keeps working unchanged:
   *   image: require('@/assets/images/deities/shiva.png'),
   */
  image?: ImageSourcePropType;
  /** Sacred mark floating above the idol. */
  mark: string;
  mantra: string;
  offerings: string[];
};

export const DEITIES: Deity[] = [
  {
    id: 'shiva',
    name: 'शिव जी',
    title: 'भगवान शिव',
    body: '#E8DCC8',
    robe: '#C8862F',
    accent: '#FFC13D',
    trim: '#E4572E',
    crown: 'jata',
    crescent: true,
    serpent: true,
    mark: 'ॐ',
    mantra: 'ॐ नमः शिवाय',
    offerings: ['बिल्व पत्र', 'गंगा जल', 'धतूरा'],
  },
  {
    id: 'shani',
    name: 'शनि देव',
    title: 'शनि देव',
    body: '#4A5568',
    robe: '#1A202C',
    accent: '#63B3ED',
    trim: '#2C5282',
    crown: 'tall',
    mark: 'शं',
    mantra: 'ॐ शं शनैश्चराय नमः',
    offerings: ['तिल तेल', 'काला वस्त्र', 'उड़द'],
  },
  {
    id: 'vishnu',
    name: 'विष्णु जी',
    title: 'भगवान विष्णु',
    body: '#5A7FC7',
    robe: '#F6C453',
    accent: '#F6E05E',
    trim: '#3C5FA8',
    crown: 'mukut',
    mark: 'हरि',
    mantra: 'ॐ नमो नारायणाय',
    offerings: ['तुलसी दल', 'पंचामृत', 'चंदन'],
  },
  {
    id: 'ganesh',
    name: 'गणेश जी',
    title: 'श्री गणेश',
    body: '#E2703A',
    robe: '#F6C453',
    accent: '#FF9F45',
    trim: '#C0392B',
    crown: 'mukut',
    elephant: true,
    mark: 'श्री',
    mantra: 'ॐ गं गणपतये नमः',
    offerings: ['मोदक', 'दूर्वा', 'लाल फूल'],
  },
  {
    id: 'hanuman',
    name: 'हनुमान जी',
    title: 'श्री हनुमान',
    body: '#D95738',
    robe: '#E23E2C',
    accent: '#FF8A3D',
    trim: '#F2C14E',
    crown: 'plain',
    mace: true,
    mark: 'राम',
    mantra: 'ॐ हनुमते नमः',
    offerings: ['सिंदूर', 'बूंदी', 'चमेली तेल'],
  },
  {
    id: 'durga',
    name: 'दुर्गा माँ',
    title: 'माँ दुर्गा',
    body: '#F0C39B',
    robe: '#C0392B',
    accent: '#F06595',
    trim: '#F6C453',
    crown: 'tall',
    mark: 'ऐं',
    mantra: 'ॐ दुं दुर्गायै नमः',
    offerings: ['लाल चुनरी', 'नारियल', 'गुड़हल'],
  },
  {
    id: 'lakshmi',
    name: 'लक्ष्मी माँ',
    title: 'माँ लक्ष्मी',
    body: '#F2C9A0',
    robe: '#E8467C',
    accent: '#FFD166',
    trim: '#C9366F',
    crown: 'mukut',
    mark: 'श्रीं',
    mantra: 'ॐ श्रीं महालक्ष्म्यै नमः',
    offerings: ['कमल', 'खीर', 'कौड़ी'],
  },
  {
    id: 'krishna',
    name: 'कृष्ण जी',
    title: 'श्री कृष्ण',
    body: '#6B8FD4',
    robe: '#F6C453',
    accent: '#7DD3C0',
    trim: '#E8B04B',
    crown: 'mukut',
    mark: 'कृष्ण',
    mantra: 'ॐ नमो भगवते वासुदेवाय',
    offerings: ['माखन', 'तुलसी', 'मोरपंख'],
  },
];

export function deityById(id?: string | string[]) {
  const key = Array.isArray(id) ? id[0] : id;
  return DEITIES.find((d) => d.id === key) ?? DEITIES[0];
}

/** Hindi weekday / month line shown on the sanctum banner. */
export const PANCHANG_LINE = '॥ सोमवार, आषाढ़, त्रयोदशी ॥';

export const AARTI_CIRCLES = 5;
