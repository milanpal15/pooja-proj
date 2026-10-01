package expo.modules.wallpaper

import android.app.WallpaperManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Sets the device wallpaper from a local image file.
 *
 * Exists because no maintained community package does this any more — the
 * ones on npm were last published in 2022–23, before the New Architecture,
 * and would have to be trusted with a bridge that has since changed. This is
 * forty lines against `WallpaperManager` and owes nothing to anyone.
 *
 * Android only. `SET_WALLPAPER` is a normal install-time permission, so there
 * is nothing to request at runtime. iOS deliberately offers no equivalent
 * API, which is why `supportsLockScreen`/`isAvailable` exist rather than the
 * JS side assuming.
 */
class ExpoWallpaperModule : Module() {

  /** Matches the TARGET union on the JS side. */
  private fun flagsFor(target: String): Int = when (target) {
    "home" -> WallpaperManager.FLAG_SYSTEM
    "lock" -> WallpaperManager.FLAG_LOCK
    else -> WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoWallpaper")

    Constants(
      // Per-target wallpapers arrived in Nougat. Below that everything is one
      // wallpaper, and asking the devotee to pick would be a lie.
      "supportsLockScreen" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N),
    )

    AsyncFunction("setWallpaper") { uri: String, target: String ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "React context unavailable", null)

      val path = Uri.parse(uri).path
        ?: throw CodedException("ERR_BAD_URI", "Could not read a file path from: $uri", null)

      val file = File(path)
      if (!file.exists()) {
        throw CodedException("ERR_NO_FILE", "No file at: $path", null)
      }

      val bitmap = BitmapFactory.decodeFile(path)
        ?: throw CodedException("ERR_DECODE", "Not a decodable image: $path", null)

      val manager = WallpaperManager.getInstance(context)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          manager.setBitmap(bitmap, null, true, flagsFor(target))
        } else {
          // Pre-N has no lock-screen target; this sets the single wallpaper.
          manager.setBitmap(bitmap)
        }
      } finally {
        bitmap.recycle()
      }
      true
    }
  }
}
