package expo.modules.poojaalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Android drops every scheduled alarm on reboot and offers no way to read
 * them back, so without this an alarm silently stops existing the first time
 * the phone restarts — the failure a devotee would only discover by missing
 * the aarti.
 *
 * Also re-arms when the clock or timezone changes, since "6:00" means a
 * different instant after a flight, and after an app update, which clears
 * pending intents the same way a reboot does.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      -> AlarmScheduler.rearmAll(context)
    }
  }
}
