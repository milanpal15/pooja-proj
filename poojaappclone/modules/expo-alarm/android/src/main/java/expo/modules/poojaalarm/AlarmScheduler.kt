package expo.modules.poojaalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.util.Calendar

/**
 * Registers alarms with the OS.
 *
 * Uses `setAlarmClock`, not `setRepeating` or `setWindow`, and the difference
 * is the whole feature. A plain alarm is inexact — the one this replaced was
 * handed a ONE HOUR window and could be deferred further by Doze, so a 4:30am
 * Mangala Aarti might arrive at 5:40. `setAlarmClock` is exact, survives Doze,
 * and puts the alarm icon in the status bar so the devotee can see one is set.
 *
 * It is NOT exempt from the exact-alarm permission, contrary to a reasonable
 * reading of the docs: from Android 12 it throws SecurityException without
 * USE_EXACT_ALARM or SCHEDULE_EXACT_ALARM. Where the permission is refused
 * this degrades to `setAndAllowWhileIdle` — late, but ringing, which beats an
 * alarm that threw on the way to being set and simply never existed.
 *
 * Each firing re-arms the next day rather than repeating, because a repeating
 * alarm cannot be exact.
 */
object AlarmScheduler {

  const val ACTION_FIRE = "expo.modules.poojaalarm.FIRE"
  const val EXTRA_ID = "alarmId"

  private fun manager(ctx: Context) =
    ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  /** Stable per-alarm request code; two alarms must never collide. */
  private fun requestCode(id: String) = id.hashCode()

  private fun firePendingIntent(ctx: Context, id: String): PendingIntent {
    val intent = Intent(ctx, AlarmReceiver::class.java).apply {
      action = ACTION_FIRE
      putExtra(EXTRA_ID, id)
      // Without a distinct data uri, Intent.filterEquals() treats every
      // alarm as the same intent and they overwrite one another.
      data = android.net.Uri.parse("poojaalarm://$id")
    }
    return PendingIntent.getBroadcast(
      ctx,
      requestCode(id),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Opens the app when the devotee taps the status-bar alarm chip. */
  private fun showPendingIntent(ctx: Context): PendingIntent {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
      ?: Intent(Intent.ACTION_MAIN)
    return PendingIntent.getActivity(
      ctx,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** The next time this hour:minute comes round, today or tomorrow. */
  fun nextOccurrence(hour: Int, minute: Int, from: Long = System.currentTimeMillis()): Long {
    val c = Calendar.getInstance().apply {
      timeInMillis = from
      set(Calendar.HOUR_OF_DAY, hour)
      set(Calendar.MINUTE, minute)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    // `<=` not `<`: re-arming at the exact moment one fires must land on
    // tomorrow, or the alarm fires again immediately, forever.
    if (c.timeInMillis <= from) c.add(Calendar.DAY_OF_YEAR, 1)
    return c.timeInMillis
  }

  /** Save and arm. Returns when it will next go off. */
  fun schedule(ctx: Context, entry: AlarmEntry): Long {
    AlarmStore.put(ctx, entry)
    return arm(ctx, entry)
  }

  /** Arm an already-stored alarm for its next occurrence. */
  fun arm(ctx: Context, entry: AlarmEntry): Long {
    val at = nextOccurrence(entry.hour, entry.minute)
    armAt(ctx, entry.id, at)
    return at
  }

  /** Whether the OS will let this app set an exact alarm at all. */
  fun canScheduleExact(ctx: Context): Boolean =
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
      manager(ctx).canScheduleExactAlarms()
    } else {
      true
    }

  /** Arm at an exact instant — used for the next day and for snooze. */
  fun armAt(ctx: Context, id: String, at: Long) {
    val am = manager(ctx)
    val operation = firePendingIntent(ctx, id)
    try {
      if (canScheduleExact(ctx)) {
        am.setAlarmClock(AlarmManager.AlarmClockInfo(at, showPendingIntent(ctx)), operation)
        return
      }
    } catch (_: SecurityException) {
      // Fall through: the permission can be revoked between the check and
      // the call, and an alarm must not be lost to that race.
    }
    // Inexact, but Doze-exempt, so it still fires — just not to the minute.
    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
  }

  fun cancel(ctx: Context, id: String) {
    manager(ctx).cancel(firePendingIntent(ctx, id))
    AlarmStore.remove(ctx, id)
  }

  fun cancelAll(ctx: Context) {
    AlarmStore.all(ctx).forEach { manager(ctx).cancel(firePendingIntent(ctx, it.id)) }
    AlarmStore.replaceAll(ctx, emptyList())
  }

  /** Re-arm everything on disk — after a reboot, update, or clock change. */
  fun rearmAll(ctx: Context) {
    AlarmStore.all(ctx).forEach { arm(ctx, it) }
  }
}
