package expo.modules.poojaalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * The moment an alarm comes due.
 *
 * This does as little as possible: a receiver gets about ten seconds before
 * Android kills it, which is nowhere near long enough to ring. It hands over
 * to a foreground service and re-arms tomorrow.
 *
 * Starting a foreground service from the background is normally forbidden on
 * Android 12+, but an exact alarm is one of the named exemptions — which is
 * another reason this is built on `setAlarmClock`.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
    val entry = AlarmStore.find(context, id) ?: return

    // Re-arm first. If ringing throws for any reason, tomorrow's alarm is
    // already safe rather than lost along with it.
    AlarmScheduler.armAt(
      context,
      id,
      AlarmScheduler.nextOccurrence(entry.hour, entry.minute),
    )

    val ring = Intent(context, AlarmService::class.java).apply {
      action = AlarmService.ACTION_RING
      putExtra(AlarmScheduler.EXTRA_ID, id)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(ring)
    } else {
      context.startService(ring)
    }
  }
}
