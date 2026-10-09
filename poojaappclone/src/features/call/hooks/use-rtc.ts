import { useCallback, useEffect, useRef, useState } from 'react';

import type { RtcCredentials } from '@/lib/api';

import { ensureMicPermission } from '../lib/permissions';
import { createRtcClient, type RtcClient, type RtcErrorKind } from '../lib/rtc-client';

export type RtcProblem = RtcErrorKind | 'mic' | null;

/**
 * Join the voice channel once credentials arrive (call connected) and leave
 * when they go away or the screen unmounts. Mute/speaker are local state that
 * mirrors the SDK. Failures are surfaced as `problem`, never thrown.
 */
export function useRtc(creds: RtcCredentials | undefined | null) {
  const [muted, setMutedState] = useState(false);
  const [speaker, setSpeakerState] = useState(false);
  const [joined, setJoined] = useState(false);
  const [problem, setProblem] = useState<RtcProblem>(null);
  const client = useRef<RtcClient | null>(null);

  const channel = creds?.channel;
  const provider = creds?.provider;
  const credsRef = useRef(creds);
  useEffect(() => {
    credsRef.current = creds;
  });

  useEffect(() => {
    if (!channel || !provider) return;
    let cancelled = false;
    const c = createRtcClient(provider);
    client.current = c;

    (async () => {
      try {
        if (provider !== 'mock' && !(await ensureMicPermission())) {
          if (!cancelled) setProblem('mic');
          return;
        }
        if (cancelled || !credsRef.current) return;
        await c.join(credsRef.current, {
          onError: () => !cancelled && setProblem('failed'),
        });
        if (!cancelled) {
          setJoined(true);
          setProblem(null);
        }
      } catch (e) {
        if (!cancelled) setProblem((e as { kind?: RtcErrorKind }).kind ?? 'failed');
      }
    })();

    return () => {
      cancelled = true;
      client.current = null;
      setJoined(false);
      c.leave();
    };
  }, [channel, provider]);

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    client.current?.setMuted(m);
  }, []);
  const setSpeaker = useCallback((on: boolean) => {
    setSpeakerState(on);
    client.current?.setSpeaker(on);
  }, []);

  return { joined, muted, speaker, problem, setMuted, setSpeaker };
}
