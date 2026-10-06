package expo.modules.poojaalarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * One alarm, as the devotee set it.
 *
 * `sound` is the URL of a tone uploaded from the dashboard, or null for the
 * device's own alarm sound. Empty string means silent — show it, make no
 * noise. A bare name is read as a bundled raw resource, which is how tones
 * saved before the audio moved to the dashboard still resolve.
 */
data class AlarmEntry(
  val id: String,
  val title: String,
  val body: String,
  val hour: Int,
  val minute: Int,
  val sound: String?,
  val vibrate: Boolean,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("title", title)
    .put("body", body)
    .put("hour", hour)
    .put("minute", minute)
    .put("sound", sound ?: JSONObject.NULL)
    .put("vibrate", vibrate)

  companion object {
    fun fromJson(o: JSONObject) = AlarmEntry(
      id = o.getString("id"),
      title = o.optString("title"),
      body = o.optString("body"),
      hour = o.optInt("hour"),
      minute = o.optInt("minute"),
      sound = if (o.isNull("sound")) null else o.optString("sound"),
      vibrate = o.optBoolean("vibrate", true),
    )
  }
}

/**
 * The alarms, on disk.
 *
 * Android forgets every scheduled alarm on reboot and gives no way to read
 * them back, so this file — not AlarmManager — is the source of truth.
 * `BootReceiver` replays it; nothing else can.
 */
object AlarmStore {
  private const val PREFS = "pooja.alarms"
  private const val KEY = "entries"

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun all(ctx: Context): List<AlarmEntry> {
    val raw = prefs(ctx).getString(KEY, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { AlarmEntry.fromJson(arr.getJSONObject(it)) }
    } catch (_: Throwable) {
      emptyList()
    }
  }

  @Synchronized
  fun find(ctx: Context, id: String): AlarmEntry? = all(ctx).firstOrNull { it.id == id }

  @Synchronized
  fun replaceAll(ctx: Context, entries: List<AlarmEntry>) {
    val arr = JSONArray()
    entries.forEach { arr.put(it.toJson()) }
    prefs(ctx).edit().putString(KEY, arr.toString()).apply()
  }

  @Synchronized
  fun put(ctx: Context, entry: AlarmEntry) {
    replaceAll(ctx, all(ctx).filter { it.id != entry.id } + entry)
  }

  @Synchronized
  fun remove(ctx: Context, id: String) {
    replaceAll(ctx, all(ctx).filter { it.id != id })
  }
}
