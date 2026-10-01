# expo-wallpaper (local module)

Sets the Android wallpaper from a local file, via `WallpaperManager`.

Written rather than installed: every community package for this was last
published in 2022–23, before React Native's New Architecture, and this app
runs RN 0.86. Forty lines of Kotlin against a stable platform API is a
smaller liability than an unmaintained bridge module.

```ts
import { isAvailable, setWallpaper, supportsLockScreen } from '@/../modules/expo-wallpaper';

if (isAvailable()) {
  await setWallpaper(fileUri, 'lock'); // 'home' | 'lock' | 'both'
}
```

- **Android only.** iOS exposes no public wallpaper API; `isAvailable()`
  returns false there and on Expo Go.
- **Separate home/lock targets need Android 7+** — `supportsLockScreen()`.
- `SET_WALLPAPER` is a normal install-time permission, declared in
  `app.json`. Nothing to request at runtime.
- Being a local module, it is picked up by autolinking at `expo prebuild`.
  Changing the Kotlin needs a rebuild, not just a Metro reload.
