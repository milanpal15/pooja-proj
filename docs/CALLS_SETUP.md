# Voice calls — setup

The app's call code (`poojaappclone/src/features/call/`) talks to the voice SDK
through ONE file, `lib/rtc-client.ts`. The SDK itself is a **native module and is
deliberately not in `package.json`**: until it is installed and the app rebuilt,
calls still ring, connect and bill on the server (provider `mock` needs no SDK),
but a real `agora` call shows the toast "Voice calls need a new build" and ends
gracefully on the phone.

## 1. App (`poojaappclone/`)

```bash
cd poojaappclone
npx expo install react-native-agora      # pins the version Expo SDK 57 expects
```

Android permissions (add to `app.json` -> `expo.android.permissions` if prebuild
does not already merge them from the library's manifest):

```json
"permissions": ["RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS"]
```

`react-native-agora` ships no Expo config plugin; autolinking picks the module up
at prebuild, so no `plugins` entry is needed. Check the library's README for a
plugin if a newer release adds one, and confirm against
https://docs.expo.dev/versions/v57.0.0/ . For iOS (not built today) you would
also add `NSMicrophoneUsageDescription` under `expo.ios.infoPlist`.

Then rebuild the dev client (a Metro reload is NOT enough):

```bash
npx expo prebuild --clean     # android/ is generated and gitignored
npx expo run:android          # prebuild --clean also deletes android/local.properties; export ANDROID_HOME
```

The microphone permission is requested at call time (`lib/permissions.ts`), not at
launch. Use Node >= 20.19.4 (`PATH=/opt/homebrew/bin:$PATH`).

## 2. API (`pooja-api/.env`)

```
RTC_PROVIDER=agora
AGORA_APP_ID=<from the Agora console>
AGORA_APP_CERTIFICATE=<from the Agora console; enable "primary certificate">
```

`RTC_PROVIDER=mock` returns a fake channel for dev/test and is refused in
production. The server mints short-lived tokens (`agora-token` package) per call.

**With the calls service (`CALLS_URL` set on the monolith, the BFFs and identity — phase 6 of
`MICROSERVICES.md`) these three variables belong to `backend/services/calls/.env`** and the
monolith no longer reads them; the resolution rules (agora when both values are set, mock only
outside production, anything unusable = `503 calls_unavailable`) moved unchanged. The billing
ticker described below also runs in the calls service then (every `TICK_EVERY_MS`, default 5 s).

## 3. What cannot be verified without a device

Real two-way audio, speaker routing, mic permission prompts, and incoming calls
while the app is in the background (the astrologer app only polls while
foregrounded; background ringing needs FCM push, not yet wired).
