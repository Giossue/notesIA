package ec.notesia.planner

import android.speech.tts.TextToSpeech
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

/** Lee en voz alta las respuestas del asistente con el motor de voz del teléfono. */
class NotesIATtsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  private var engine: TextToSpeech? = null
  private var ready = false
  // Peticiones que llegan mientras el motor se inicia; se atienden al terminar.
  private val pending = mutableListOf<(TextToSpeech?) -> Unit>()

  override fun getName() = "NotesIATts"

  @Synchronized
  private fun withEngine(onReady: (TextToSpeech?) -> Unit) {
    if (engine != null && ready) return onReady(engine)
    pending.add(onReady)
    if (engine != null) return
    engine =
        TextToSpeech(reactContext.applicationContext) { status ->
          val callbacks: List<(TextToSpeech?) -> Unit>
          synchronized(this) {
            ready = status == TextToSpeech.SUCCESS
            if (ready) {
              // Español de Ecuador si existe; si no, español genérico.
              val result = engine?.setLanguage(Locale.forLanguageTag("es-EC"))
              if (result == TextToSpeech.LANG_MISSING_DATA ||
                  result == TextToSpeech.LANG_NOT_SUPPORTED)
                  engine?.setLanguage(Locale.forLanguageTag("es"))
            } else {
              engine?.shutdown()
              engine = null
            }
            callbacks = pending.toList()
            pending.clear()
          }
          callbacks.forEach { it(if (ready) engine else null) }
        }
  }

  @ReactMethod
  fun isAvailable(promise: Promise) {
    withEngine { tts -> promise.resolve(tts != null) }
  }

  @ReactMethod
  fun speak(text: String, promise: Promise) {
    withEngine { tts ->
      if (tts == null) {
        promise.reject("NOT_AVAILABLE", "No hay un motor de voz disponible.")
      } else {
        tts.speak(text.take(TextToSpeech.getMaxSpeechInputLength()), TextToSpeech.QUEUE_FLUSH, null, "notesia")
        promise.resolve(null)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    engine?.stop()
    promise.resolve(null)
  }

  override fun invalidate() {
    engine?.shutdown()
    engine = null
    ready = false
    super.invalidate()
  }
}
