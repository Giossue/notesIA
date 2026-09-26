package ec.notesia.planner

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.common.assets.ReactFontManager

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(NotesIASpeechPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    ReactFontManager.getInstance().addCustomFont(this, "DM Sans", R.font.dm_sans)
    createNotificationChannel()
    loadReactNative(this)
  }

  /**
   * Canal de los avisos push, con nombre en español en los ajustes del teléfono.
   * El worker envía a este id (ANDROID_CHANNEL_ID en apps/worker/src/fcm.ts).
   */
  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel =
      NotificationChannel(
          getString(R.string.notification_channel_id),
          getString(R.string.notification_channel_name),
          NotificationManager.IMPORTANCE_HIGH,
        )
        .apply { description = getString(R.string.notification_channel_description) }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }
}
