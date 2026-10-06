package expo.modules.poojaalarm

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JS surface of the alarm.
 *
 * Deliberately small: the app hands over a whole list of alarms and this
 * replaces whatever was registered. Reconciling individual alarms against
 * AlarmManager is not possible — the OS will not tell you what is pending —
 * so replace-all is the only operation that cannot drift.
 */
class ExpoAlarmModule : Module() {

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  override fun definition() = ModuleDefinition {
    Name("ExpoAlarm")

    /**
     * Whether the ringing screen can actually take over the device.
     *
     * Android 14 restricted full-screen intents to calling and alarm apps;
     * everyone else has to be granted it. Without it the alarm still rings
     * and still shows, but as a heads-up notification rather than a
     * full-screen takeover, so the app needs to know which it is getting.
     */
    Property("canUseFullScreen") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        true
      } else {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.canUseFullScreenIntent()
      }
    }

    /**
     * Whether alarms will be exact.
     *
     * False means they still ring, via an inexact Doze-exempt alarm, but
     * may be minutes late — which for a 4:30am aarti is worth saying out
     * loud rather than hiding.
     */
    Property("canScheduleExact") { AlarmScheduler.canScheduleExact(context) }

    /** The Settings page that grants exact alarms, where one is needed. */
    AsyncFunction("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val i = Intent(
          Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
          Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
      }
    }

    /** Send the devotee to the one Settings page that grants it. */
    AsyncFunction("openFullScreenSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val i = Intent(
          Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
          Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
      }
    }

    /**
     * Replace every registered alarm with this list.
     *
     * Each item: { id, title, body, hour, minute, sound, vibrate }.
     * `sound` is a tone URL, `null` for the device's alarm sound, or `""`
     * for silence.
     *
     * Returns the next firing time of each, in epoch millis, so the app can
     * tell the devotee when it will actually go off.
     */
    AsyncFunction("setAlarms") { alarms: List<Map<String, Any?>> ->
      AlarmScheduler.cancelAll(context)
      alarms.mapNotNull { raw ->
        val id = raw["id"] as? String ?: return@mapNotNull null
        val entry = AlarmEntry(
          id = id,
          title = raw["title"] as? String ?: "",
          body = raw["body"] as? String ?: "",
          hour = (raw["hour"] as? Number)?.toInt() ?: 0,
          minute = (raw["minute"] as? Number)?.toInt() ?: 0,
          sound = raw["sound"] as? String,
          vibrate = raw["vibrate"] as? Boolean ?: true,
        )
        mapOf("id" to id, "at" to AlarmScheduler.schedule(context, entry).toDouble())
      }
    }

    AsyncFunction("cancelAll") {
      AlarmScheduler.cancelAll(context)
      stopRinging()
    }

    /** What is registered right now, with each next firing time. */
    AsyncFunction("scheduled") {
      AlarmStore.all(context).map {
        mapOf(
          "id" to it.id,
          "title" to it.title,
          "hour" to it.hour,
          "minute" to it.minute,
          "at" to AlarmScheduler.nextOccurrence(it.hour, it.minute).toDouble(),
        )
      }
    }

    /**
     * Ring one now, without changing its schedule.
     *
     * This is the Preview button: an alarm nobody has heard is an alarm
     * nobody trusts, and 4:30am is a poor time to discover the volume was
     * wrong.
     */
    AsyncFunction("preview") { id: String ->
      val i = Intent(context, AlarmService::class.java).apply {
        action = AlarmService.ACTION_RING
        putExtra(AlarmScheduler.EXTRA_ID, id)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(i)
      } else {
        context.startService(i)
      }
      // startService returns a ComponentName, which would become this
      // function's return value — a type the bridge cannot convert, so the
      // call rejects even though the alarm rang. Return nothing.
      Unit
    }

    AsyncFunction("stop") { stopRinging() }
  }

  private fun stopRinging() {
    context.startService(
      Intent(context, AlarmService::class.java).apply {
        action = AlarmService.ACTION_DISMISS
      },
    )
  }
}
