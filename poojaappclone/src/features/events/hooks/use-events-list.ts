import { type EventsList, fetchEvents } from '@/lib/api';
import { useAuth } from '@/providers/auth';

import { type Resource, useCachedResource } from './use-cached-resource';

const isList = (v: unknown) => !!v && typeof v === 'object' && !!(v as EventsList).sections && Array.isArray((v as EventsList).types);

/** `GET /api/events`, cached (per devotee: it carries their own sections) so the list opens instantly and survives being offline. */
export function useEventsList(): Resource<EventsList> {
  const { user } = useAuth();
  return useCachedResource<EventsList>(`events.list.v2.${user?.uid ?? 'guest'}`, fetchEvents, isList);
}
