package ec.notesia.planner

import android.os.Bundle
import android.os.SystemClock
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "NotesIA"

  /**
   * Una sola pantalla de arranque: sigue visible hasta que la app avisa que ya
   * muestra su primera pantalla (NotesIASplash.hide). Tope de 8 s por si falla.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    val started = SystemClock.uptimeMillis()
    installSplashScreen().setKeepOnScreenCondition {
      !NotesIASplashModule.ready && SystemClock.uptimeMillis() - started < 8_000
    }
    super.onCreate(savedInstanceState)
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
