import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/** `go('/poojas?q=x')` — push an in-app path. Paths here are built from our own routes, so typed-route checking adds nothing. */
export function useGo() {
  const router = useRouter();
  return useCallback((path: string) => router.push(path as never), [router]);
}
