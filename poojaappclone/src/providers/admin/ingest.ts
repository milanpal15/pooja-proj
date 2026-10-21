import { apiRequest } from '@/lib/api/client';

/** Fire-and-forget POST to the admin backend (ignores failures/offline). */
export async function post(path: string, body: unknown) {
  try {
    await apiRequest(path, { method: 'POST', data: body, timeout: 4000 });
  } catch {
    // offline / backend down — the app keeps working with local state
  }
}

export function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
