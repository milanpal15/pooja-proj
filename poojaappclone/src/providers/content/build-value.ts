import type { ImageSourcePropType } from 'react-native';

import type { Deity } from '@/constants/deities';

import { deityImageFor, toneSound } from './assets';
import { toDeity } from './resources/deities';
import { upcomingFestivals } from './resources/festivals';
import { sevasFor } from './resources/sevas';
import { settingNumber, settingText } from './resources/settings';
import { buildTempleList, templeRatingFor } from './resources/temples';
import type { Content, ContentContextValue } from './types';

/** Fold the dashboard's rows into the lists and selectors the screens read. */
export function buildContentValue(content: Content, loading: boolean): ContentContextValue {
  const imageBySlug = new Map(
    content.deities.filter((d) => d.imageUrl).map((d) => [d.slug, d.imageUrl as string]),
  );
  const templeBySlug = new Map(content.temples.map((tpl) => [tpl.slug, tpl]));

  const artFor = (slug: string): ImageSourcePropType | undefined =>
    deityImageFor(imageBySlug, slug);

  /*
   * What the screens draw.
   *
   * The dashboard is the only source. Nothing is compiled into the app,
   * so an empty dashboard renders empty states — which is the honest
   * answer, and the one that makes the dashboard's emptiness visible
   * instead of hiding it behind a catalogue nobody can edit.
   */
  const deityList: Deity[] = content.deities.map((d) => toDeity(d, artFor(d.slug)));

  const deityBySlug = new Map(deityList.map((d) => [d.id, d]));

  const templeList = buildTempleList(content.temples, deityList, deityBySlug);

  return {
    ...content,
    loading,
    deityList,
    templeList,
    deityName: (slug) => deityBySlug.get(slug)?.name ?? slug,
    deityById: (id) => {
      const key = Array.isArray(id) ? id[0] : id;
      return (key ? deityBySlug.get(key) : undefined) ?? deityList[0];
    },
    templeById: (id) => {
      const key = Array.isArray(id) ? id[0] : id;
      return templeList.find((tpl) => tpl.id === key) ?? templeList[0];
    },
    deityImage: (id) => deityImageFor(imageBySlug, id),
    deityArt: (id) => deityImageFor(imageBySlug, id),
    toneSound: (slug) => toneSound(content, slug),
    bookingEnabled: (slug) => templeBySlug.get(slug)?.bookingEnabled !== false,
    sevasFor: (opts) => sevasFor(content.sevas, opts),
    setting: (key, fallback) => settingNumber(content.settings, key, fallback),
    settingText: (key) => settingText(content.settings, key),
    templeRating: (slug) => templeRatingFor(templeBySlug, slug),
    upcomingFestivals: (limit = 4) => upcomingFestivals(content.festivals, limit),
  };
}
