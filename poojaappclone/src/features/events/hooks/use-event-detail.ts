import { type EventDetail, fetchEvent } from '@/lib/api';

import { type Resource, useCachedResource } from './use-cached-resource';

const isDetail = (v: unknown) => !!v && typeof v === 'object' && Array.isArray((v as EventDetail).blocks);

/** One event, cached per slug. */
export function useEventDetail(slug: string): Resource<EventDetail> {
  return useCachedResource<EventDetail>(`events.detail.v1.${slug}`, () => fetchEvent(slug), isDetail);
}
