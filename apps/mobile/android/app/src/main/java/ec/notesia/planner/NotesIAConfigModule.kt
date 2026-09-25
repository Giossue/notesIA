package ec.notesia.planner

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class NotesIAConfigModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "NotesIAConfig"

  override fun getConstants(): Map<String, Any> =
      mapOf("apiBaseUrl" to BuildConfig.NOTESIA_API_BASE_URL)
}
