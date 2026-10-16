/**
 * A tiny bus: the API client reports a `426 app_outdated` / `503 maintenance` answer from ANY call here,
 * and the app-policy feature (which owns the screens) subscribes. Lives in lib/ so the client does not
 * import a feature. Pure — no React Native.
 */
export type GateSignal = { httpStatus: number; body: unknown };

/** Is this response the server saying "this build / the service is gated"? Needs the parsed body. */
export function isGateResponse(httpStatus: number, body: unknown): boolean {
  if (httpStatus !== 426 && httpStatus !== 503) return false;
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  return httpStatus === 426 ? code === 'app_outdated' : code === 'maintenance';
}

type Listener = (s: GateSignal) => void;
const listeners = new Set<Listener>();

export function onGateSignal(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitGateSignal(s: GateSignal): void {
  for (const fn of [...listeners]) {
    try {
      fn(s);
    } catch {
      // a listener must never break the request that triggered it
    }
  }
}
