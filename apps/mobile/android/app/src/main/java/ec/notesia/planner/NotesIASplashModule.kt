package ec.notesia.planner

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** La app avisa aquí cuando ya muestra su primera pantalla real. */
class NotesIASplashModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "NotesIASplash"

  @ReactMethod
  fun hide() {
    ready = true
  }

  companion object {
    @Volatile var ready = false
  }
}
