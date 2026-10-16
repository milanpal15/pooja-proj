import { fetchMyBadges, type MyBadge } from '@/lib/api';
import { useAuth } from '@/providers/auth';

import { type Resource, useCachedResource } from './use-cached-resource';

/** `GET /api/me/badges`, cached per devotee. */
export function useMyBadges(): Resource<MyBadge[]> {
  const { user } = useAuth();
  return useCachedResource<MyBadge[]>(`events.badges.v1.${user?.uid ?? 'guest'}`, user ? fetchMyBadges : () => Promise.resolve([]), Array.isArray);
}
