/**
 * The ONLY file that imports a voice SDK.
 *
 * Everything else talks to the `RtcClient` interface. Two implementations:
 *   - `mock`  no audio at all; used when the server answers `provider: 'mock'`
 *             (development / tests, where the API refuses mock in production).
 *   - `agora` `react-native-agora`, loaded lazily with a guarded `require` so
 *             a build WITHOUT the native module still boots, and the call
 *             screen can say "Voice calls need a new build" instead of crashing.
 *
 * See docs/CALLS_SETUP.md for installing the SDK (it is deliberately not in
 * package.json: it needs a native build).
 */

import type { RtcCredentials } from '@/lib/api';

export type RtcErrorKind = 'unavailable' | 'failed';

class RtcError extends Error {
  constructor(
    public kind: RtcErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RtcError';
  }
}

export interface RtcClient {
  join(creds: RtcCredentials, handlers?: { onError?: (e: RtcError) => void }): Promise<void>;
  leave(): Promise<void>;
  setMuted(muted: boolean): void;
  setSpeaker(on: boolean): void;
}

/* ───────────────────────────────────────────────────────────────── mock ── */

const mockClient: RtcClient = {
  async join() {},
  async leave() {},
  setMuted() {},
  setSpeaker() {},
};

/* ──────────────────────────────────────────────────────────────── agora ── */

// Minimal shape of the engine calls we use — the SDK is optional, so its
// types are not available at compile time.
type AgoraEngine = {
  initialize(cfg: { appId: string; channelProfile: number }): number;
  registerEventHandler(h: Record<string, (...a: unknown[]) => void>): boolean;
  enableAudio(): number;
  joinChannel(
    token: string,
    channel: string,
    uid: number,
    opts: Record<string, unknown>,
  ): number;
  leaveChannel(): number;
  release(): void;
  muteLocalAudioStream(m: boolean): number;
  setEnableSpeakerphone(on: boolean): number;
};

function loadAgora(): {
  createAgoraRtcEngine: () => AgoraEngine;
  ChannelProfileType: { ChannelProfileCommunication: number };
  ClientRoleType: { ClientRoleBroadcaster: number };
} {
  try {
    // Optional dependency: Metro tolerates a missing module inside try/catch.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require('react-native-agora');
    if (!sdk?.createAgoraRtcEngine) throw new Error('react-native-agora has no engine export');
    return sdk;
  } catch {
    throw new RtcError('unavailable', 'react-native-agora is not installed in this build');
  }
}

function createAgoraClient(): RtcClient {
  let engine: AgoraEngine | null = null;

  return {
    async join(creds, handlers) {
      const sdk = loadAgora();
      if (!creds.appId || !creds.token) {
        throw new RtcError('failed', 'The server did not send voice credentials');
      }
      const e = sdk.createAgoraRtcEngine();
      engine = e;
      try {
        e.initialize({
          appId: creds.appId,
          channelProfile: sdk.ChannelProfileType.ChannelProfileCommunication,
        });
        e.registerEventHandler({
          onError: (code: unknown) =>
            handlers?.onError?.(new RtcError('failed', `Agora error ${String(code)}`)),
        });
        e.enableAudio();
        const rc = e.joinChannel(creds.token, creds.channel, Number(creds.uid) || 0, {
          clientRoleType: sdk.ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          autoSubscribeAudio: true,
        });
        if (rc < 0) throw new RtcError('failed', `joinChannel returned ${rc}`);
        e.setEnableSpeakerphone(false);
      } catch (err) {
        await this.leave();
        throw err instanceof RtcError ? err : new RtcError('failed', String(err));
      }
    },
    async leave() {
      const e = engine;
      engine = null;
      if (!e) return;
      try {
        e.leaveChannel();
        e.release();
      } catch {
        // already torn down
      }
    },
    setMuted(m) {
      engine?.muteLocalAudioStream(m);
    },
    setSpeaker(on) {
      engine?.setEnableSpeakerphone(on);
    },
  };
}

/** Pick the implementation the server asked for. */
export function createRtcClient(provider: string): RtcClient {
  return provider === 'mock' ? mockClient : createAgoraClient();
}
