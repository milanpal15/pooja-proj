# Firebase Authentication — setup

Sign-in is now **Firebase Auth**: real SMS OTP on a phone number, plus Google
Sign-In. The old on-device `demoOtp` is gone.

Nothing here works until you create a Firebase project and drop two files in.
Until then the app shows "Sign-in is temporarily unavailable" and the backend
answers `503` on `/api/auth/*` — by design, so a missing key fails loudly
instead of quietly trusting whoever calls.

> **This needs a development build.** `@react-native-firebase/*` and
> `@react-native-google-signin/google-signin` are native modules, so **Expo Go
> cannot run the app any more**. Use `npx expo run:android`.

---

> **This repo targets the Firebase project `pooja-app-aa462`**, Android package
> **`com.poojaapp.poojaapp`**. The app's `google-services.json` and the
> backend's service-account key must both come from that same project —
> mismatched, every token is rejected with an audience error. The API prints
> which project its key is for on boot, and names both projects when a token
> is rejected for this reason.

## 1. Enable the providers

1. <https://console.firebase.google.com> → **pooja-app-aa462**.
2. **Build → Authentication → Get started**, then enable two providers under
   **Sign-in method**:
   - **Phone**
   - **Google** (pick a support email when prompted)

### Test numbers (do this — it saves your SMS quota)

Under **Phone → Advanced → Phone numbers for testing**, add e.g.
`+91 9999999999` with code `123456`. That pair signs in without sending an SMS
and without burning the free daily quota, which is small.

---

## 2. Register the Android app

**Project settings → Your apps → Add app → Android.**

- **Package name** — must be exactly `com.poojaapp.poojaapp`
  (from `poojaappclone/app.json` → `expo.android.package`). Gradle fails with
  "No matching client found for package name" if these disagree.
- **SHA-1 certificate fingerprint** — **required**, or Google Sign-In fails with
  a bare `DEVELOPER_ERROR` and phone auth falls back to a reCAPTCHA web page.

> **A `google-services.json` with no `client_type: 1` entry means no SHA-1 is
> registered yet.** Google Sign-In will fail with `DEVELOPER_ERROR` until you
> add one and re-download the file. Phone OTP still works without it, but
> falls back to a reCAPTCHA web page instead of silent Play Integrity.

**The debug SHA-1 to register:**

```
5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

> **Read this before you go looking in `~/.android/debug.keystore` — that is
> the wrong file.** Expo's prebuild template ships its own keystore at
> `android/app/debug.keystore`, and `android/app/build.gradle` points the
> debug signing config at it (`storeFile file('debug.keystore')`). Gradle
> never touches the Android Studio one. Register the fingerprint of the wrong
> keystore and Google's OAuth server rejects sign-in with *"This android
> application is not registered to use OAuth2.0"* — while the Firebase console
> shows a fingerprint that looks perfectly correct.

Read it from the keystore Gradle actually uses:

```bash
cd poojaappclone
keytool -list -v -alias androiddebugkey \
  -keystore android/app/debug.keystore \
  -storepass android -keypass android | grep SHA1
```

Or, decisively, from the APK that is installed on the device:

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/debug/app-debug.apk | grep -i SHA-1
```

Because this keystore lives in the repo's generated `android/` rather than in
each developer's home directory, one fingerprint covers the whole team. A
release build is signed with a different key — add that SHA-1 too when you
ship.

Then **download `google-services.json`** and put it at:

```
poojaappclone/google-services.json
```

It is gitignored. Every developer downloads their own.

---

## 3. Set the Google web client id

Google Sign-In needs the **web** OAuth client id — *not* the Android one. With
the wrong id you get `DEVELOPER_ERROR`, which names nothing.

Find it in the `google-services.json` you just downloaded: the `oauth_client`
entry whose `"client_type": 3`. It ends in `.apps.googleusercontent.com`.

Create `poojaappclone/.env`:

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234567890-abcdef.apps.googleusercontent.com
```

(Or paste it straight into `GOOGLE_WEB_CLIENT_ID` in
`poojaappclone/src/constants/config.ts`.)

---

## 4. Give the backend a service-account key

**Project settings → Service accounts → Generate new private key.** Save it as:

```
pooja-admin/server/firebase-service-account.json
```

Also gitignored. `pooja-admin/server/.env` already points at it:

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

For a hosted deploy, put the whole JSON on one line in
`FIREBASE_SERVICE_ACCOUNT` instead.

Restart the API. It should log:

```
✓ Firebase Admin ready — ID tokens will be verified
```

If it logs the `⚠ Firebase Admin not configured` warning instead, the path is
wrong — sign-in will fail with 503 until you fix it.

---

## 5. Build and run

```bash
cd poojaappclone
export ANDROID_HOME="$HOME/Library/Android/sdk"   # see the two traps below
npx expo prebuild --clean     # regenerates android/ with the Firebase plugins
npx expo run:android
```

**Two things that will bite you here:**

1. **`prebuild --clean` deletes `android/local.properties`**, which carries
   `sdk.dir`. Without it Gradle stops at "SDK location not found". Either
   export `ANDROID_HOME` as above, or recreate the file:
   `echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties`.
2. **Node must be ≥ 20.19.4.** Expo SDK 57 requires it, and reading
   `poojaappclone/.env` needs `util.parseEnv` (Node ≥ 20.12) — on an older
   Node, prebuild dies with `parseEnv is not a function`. The nvm default on
   this machine is v20.1.0; Homebrew's node is current, so
   `export PATH=/opt/homebrew/bin:$PATH` is the quick fix.

`prebuild` is required — the config plugins have to inject the
`google-services` Gradle plugin, and that only happens at prebuild time. The
`android/` directory is generated and gitignored, so `--clean` is safe.

Then, as always, make the phone able to reach the backend:

```bash
adb reverse tcp:4000 tcp:4000
adb reverse tcp:8081 tcp:8081
```

---

## How it fits together

```
 App                             Backend                     Firebase
 ---                             -------                     --------
 Mobile -> requestOtp ------------------------------------>  sends SMS
 code   -> confirmOtp  ------------------------------------> verifies, mints
                                                             an ID token
 Google -> native picker ---------------------------------->  idToken ->
                                                             signInWithCredential

 onAuthStateChanged fires
        |
        +- POST /api/auth/sync --> requireAuth
             Bearer <ID token>      verifies signature + expiry
                                    (locally, against cached Google certs)
                                          |
                                    upserts the User row, keyed by uid
                                          |
                                    <-- profile { name, contact, ... }
```

Identity — `uid`, `phone_number`, `email`, provider — is read **from the
verified token only**. The request body supplies just `name`, `bio` and
`deviceId`, the three things a devotee actually types. That is the whole point
of the change: `POST /api/users` used to accept any `{contact, name}` from
anyone, so a stranger could type your number and become your account. It now
answers `410 Gone`.

### Blocking a user actually works now

Blocking from the dashboard does two things: the user row is flagged (every
authenticated request then answers `403`, which signs the app out with "This
account has been blocked"), and the Firebase refresh tokens are revoked so the
device cannot mint a fresh ID token. Deleting a user deletes the Firebase
account too — otherwise the next sign-in would silently recreate the row.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `DEVELOPER_ERROR` on Google sign-in | SHA-1 not registered in Firebase, or you used the Android client id instead of the **web** one |
| Sign-in fails, API logs `⚠ Firebase Admin not configured` | `FIREBASE_SERVICE_ACCOUNT_PATH` is wrong or the file is missing |
| App shows "Sign-in is temporarily unavailable" | The provider (Phone or Google) is not enabled in the Firebase console |
| A reCAPTCHA web page appears during phone sign-in | Play Integrity could not verify the app — usually a missing SHA-1. It still works, it is just the fallback |
| "Too many attempts" | Firebase rate-limited the number. Use a test number from step 1 |
| `libworklets.so` SIGSEGV after prebuild | Unrelated — run `npx expo install --fix` (see AGENTS.md §5) |
| Signed in, but the dashboard Users page is empty | The phone cannot reach the backend — check `adb reverse` (AGENTS.md §3) |
