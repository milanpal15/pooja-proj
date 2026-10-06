package expo.modules.poojaalarm

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The ringing screen.
 *
 * Deliberately plain Android views rather than React Native: this has to
 * appear over the lock screen within milliseconds of the alarm firing, with
 * the app not running and possibly the device just woken. Booting the JS
 * runtime to draw two buttons would be slow and, if Metro or the bundle were
 * unavailable, would fail at the one moment it must not.
 *
 * It does not stop the alarm by itself — the service owns the sound, so
 * Dismiss and Snooze are messages to the service, and swiping this away
 * leaves the alarm ringing in the shade rather than silently cancelling it.
 */
class AlarmActivity : Activity() {

  companion object {
    @Volatile
    private var showing: AlarmActivity? = null

    /** Called by the service once the ringing has actually stopped. */
    fun finishIfShowing() {
      showing?.runOnUiThread { showing?.finish() }
    }
  }

  private var alarmId: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    setContentView(R.layout.activity_alarm)
    showing = this
    bind(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    bind(intent)
  }

  private fun bind(intent: Intent?) {
    alarmId = intent?.getStringExtra(AlarmScheduler.EXTRA_ID) ?: AlarmService.ringingId
    val entry = alarmId?.let { AlarmStore.find(this, it) }

    findViewById<TextView>(R.id.alarm_clock).text =
      SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date())
    findViewById<TextView>(R.id.alarm_title).text = entry?.title ?: ""
    findViewById<TextView>(R.id.alarm_body).text = entry?.body ?: ""

    findViewById<Button>(R.id.alarm_dismiss).setOnClickListener {
      send(AlarmService.ACTION_DISMISS)
    }
    findViewById<Button>(R.id.alarm_snooze).setOnClickListener {
      send(AlarmService.ACTION_SNOOZE)
    }
  }

  private fun send(action: String) {
    val i = Intent(this, AlarmService::class.java).apply {
      this.action = action
      putExtra(AlarmScheduler.EXTRA_ID, alarmId)
    }
    startService(i)
    finish()
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  /*
   * Back must not dismiss. On a real alarm clock the only ways out are
   * Dismiss and Snooze — otherwise the reflex of tapping Back silences the
   * aarti without the devotee deciding to.
   */
  @Deprecated("Back is intentionally inert on the ringing screen")
  override fun onBackPressed() {
    // no-op
  }

  override fun onDestroy() {
    if (showing === this) showing = null
    super.onDestroy()
  }
}
