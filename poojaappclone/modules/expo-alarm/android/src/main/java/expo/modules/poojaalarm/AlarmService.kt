package expo.modules.poojaalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * The ringing.
 *
 * What separates this from the notification it replaced:
 *
 *  - the sound plays on **STREAM_ALARM**, so it is governed by the alarm
 *    volume and is heard when the phone is on silent or vibrate — the whole
 *    reason a 4:30am alarm is an alarm and not a notification;
 *  - it **loops** until dismissed, rather than playing once;
 *  - it carries a **full-screen intent**, so the ringing screen takes over a
 *    locked device instead of landing in the shade;
 *  - it runs as a **foreground service**, so it keeps going with the app
 *    closed and the screen off.
 *
 * It stops itself after ten minutes. An alarm nobody is there to hear should
 * give up rather than run the battery flat.
 */
class AlarmService : Service() {

  companion object {
    const val ACTION_RING = "expo.modules.poojaalarm.RING"
    const val ACTION_DISMISS = "expo.modules.poojaalarm.DISMISS"
    const val ACTION_SNOOZE = "expo.modules.poojaalarm.SNOOZE"

    const val CHANNEL_ID = "pooja-alarm"
    private const val NOTIFICATION_ID = 0xA1A2

    const val SNOOZE_MINUTES = 10
    private const val AUTO_STOP_MS = 10 * 60 * 1000L

    /** The alarm currently ringing, so the activity can label itself. */
    @Volatile
    var ringingId: String? = null
      private set
  }

  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val stopper = Handler(Looper.getMainLooper())
  private val autoStop = Runnable { stopRinging() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_DISMISS -> {
        stopRinging()
        return START_NOT_STICKY
      }

      ACTION_SNOOZE -> {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: ringingId
        if (id != null) {
          AlarmScheduler.armAt(
            this,
            id,
            System.currentTimeMillis() + SNOOZE_MINUTES * 60_000L,
          )
        }
        stopRinging()
        return START_NOT_STICKY
      }
    }

    val id = intent?.getStringExtra(AlarmScheduler.EXTRA_ID)
    val entry = id?.let { AlarmStore.find(this, it) }
    if (entry == null) {
      stopSelf()
      return START_NOT_STICKY
    }

    ringingId = entry.id
    startForeground(NOTIFICATION_ID, buildNotification(entry))
    acquireWakeLock()
    startSound(entry)
    startVibration(entry)
    stopper.removeCallbacks(autoStop)
    stopper.postDelayed(autoStop, AUTO_STOP_MS)

    // START_STICKY would have Android restart this with a null intent after
    // a kill, which would ring with no alarm to ring for.
    return START_NOT_STICKY
  }

  /* ───────────────────────────────────────────────────── notification ── */

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.alarm_channel_name),
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      // The service owns the audio so it can loop on the alarm stream; the
      // channel must stay silent or the two play over each other.
      setSound(null, null)
      enableVibration(false)
      setBypassDnd(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    nm.createNotificationChannel(channel)
  }

  private fun service(action: String, id: String): PendingIntent {
    val i = Intent(this, AlarmService::class.java).apply {
      this.action = action
      putExtra(AlarmScheduler.EXTRA_ID, id)
    }
    return PendingIntent.getService(
      this,
      action.hashCode(),
      i,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun buildNotification(entry: AlarmEntry): Notification {
    ensureChannel()

    val full = PendingIntent.getActivity(
      this,
      entry.id.hashCode(),
      Intent(this, AlarmActivity::class.java).apply {
        putExtra(AlarmScheduler.EXTRA_ID, entry.id)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val icon = applicationInfo.icon

    return Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(icon)
      .setContentTitle(entry.title)
      .setContentText(entry.body)
      .setCategory(Notification.CATEGORY_ALARM)
      .setOngoing(true)
      .setAutoCancel(false)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      // `true` means "show it even if the screen is already on" — without
      // it an alarm arriving while the devotee is reading lands silently in
      // the shade, which is exactly the behaviour being fixed.
      .setFullScreenIntent(full, true)
      .setContentIntent(full)
      .addAction(
        Notification.Action.Builder(
          null,
          getString(R.string.alarm_snooze),
          service(ACTION_SNOOZE, entry.id),
        ).build(),
      )
      .addAction(
        Notification.Action.Builder(
          null,
          getString(R.string.alarm_dismiss),
          service(ACTION_DISMISS, entry.id),
        ).build(),
      )
      .build()
  }

  /* ──────────────────────────────────────────────────────────── sound ── */

  private fun soundUri(entry: AlarmEntry): Uri? {
    val name = entry.sound
    // Empty string is the devotee choosing silence; null is "use whatever
    // this phone's alarm sound is".
    if (name != null && name.isEmpty()) return null
    if (name == null) {
      return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    }
    val resId = resources.getIdentifier(name, "raw", packageName)
    return if (resId != 0) {
      Uri.parse("android.resource://$packageName/raw/$name")
    } else {
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    }
  }

  private fun startSound(entry: AlarmEntry) {
    val uri = soundUri(entry) ?: return
    try {
      player = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            // USAGE_ALARM is what routes this to the alarm stream, and so
            // what makes it audible on a silenced phone.
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setDataSource(this@AlarmService, uri)
        isLooping = true
        prepare()
        start()
      }
    } catch (_: Throwable) {
      // A missing or unplayable tone must not cost the devotee the alarm:
      // the notification and vibration still fire.
      player = null
    }

    // If the alarm volume is at zero the alarm is inaudible, which for an
    // alarm is a failure rather than a preference. Nudge it to something
    // that can be heard; the devotee's ringer and media volumes are left
    // entirely alone.
    try {
      val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      if (am.getStreamVolume(AudioManager.STREAM_ALARM) == 0) {
        val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        am.setStreamVolume(AudioManager.STREAM_ALARM, (max * 0.6f).toInt().coerceAtLeast(1), 0)
      }
    } catch (_: Throwable) {
      // Some OEMs refuse this; ringing quietly beats not ringing.
    }
  }

  @Suppress("DEPRECATION")
  private fun startVibration(entry: AlarmEntry) {
    if (!entry.vibrate) return
    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    } else {
      getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
    val pattern = longArrayOf(0, 600, 600)
    try {
      vibrator?.vibrate(
        VibrationEffect.createWaveform(pattern, 0),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
    } catch (_: Throwable) {
      vibrator = null
    }
  }

  private fun acquireWakeLock() {
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = pm.newWakeLock(
        PowerManager.PARTIAL_WAKE_LOCK,
        "pooja:alarm",
      ).apply { acquire(AUTO_STOP_MS) }
    } catch (_: Throwable) {
      wakeLock = null
    }
  }

  /* ───────────────────────────────────────────────────────── stopping ── */

  private fun stopRinging() {
    stopper.removeCallbacks(autoStop)
    ringingId = null

    try {
      player?.stop()
    } catch (_: Throwable) {
      // already stopped
    }
    player?.release()
    player = null

    vibrator?.cancel()
    vibrator = null

    if (wakeLock?.isHeld == true) wakeLock?.release()
    wakeLock = null

    AlarmActivity.finishIfShowing()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  override fun onDestroy() {
    stopRinging()
    super.onDestroy()
  }
}
