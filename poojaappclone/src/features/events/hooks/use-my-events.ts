import { type EventCard, fetchMyEvents } from '@/lib/api';
import { useAuth } from '@/providers/auth';

import { type Resource, useCachedResource } from './use-cached-resource';

/** `GET /api/me/events` — the caller's joined events. Cached PER DEVOTEE so accounts never see each other's. */
export function useMyEvents(): Resource<EventCard[]> {
  const { user } = useAuth();
  return useCachedResource<EventCard[]>(`events.mine.v1.${user?.uid ?? 'guest'}`, user ? fetchMyEvents : () => Promise.resolve([]), Array.isArray);
}
