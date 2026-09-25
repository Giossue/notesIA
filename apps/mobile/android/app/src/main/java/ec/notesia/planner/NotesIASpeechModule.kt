package ec.notesia.planner

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NotesIASpeechModule.NAME)
class NotesIASpeechModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context), RecognitionListener {
  companion object {
    const val NAME = "NotesIASpeech"
  }

  private var recognizer: SpeechRecognizer? = null
  private var pendingPromise: Promise? = null
  private var currentLocale = ""
  private var usingOnDeviceRecognizer = false

  override fun getName(): String = NAME

  @ReactMethod
  fun isAvailable(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      promise.resolve(SpeechRecognizer.isRecognitionAvailable(context))
    }
  }

  @ReactMethod
  fun start(locale: String, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      if (pendingPromise != null) {
        promise.reject("BUSY", "Ya hay un dictado en curso.")
        return@runOnUiThread
      }
      if (
          ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
              PackageManager.PERMISSION_GRANTED
      ) {
        promise.reject("PERMISSION_DENIED", "Falta permiso para usar el micrófono.")
        return@runOnUiThread
      }
      val onDeviceAvailable =
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
              SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
      if (!SpeechRecognizer.isRecognitionAvailable(context)) {
        promise.reject("NOT_AVAILABLE", "El reconocimiento de voz no está disponible.")
        return@runOnUiThread
      }

      pendingPromise = promise
      currentLocale = locale
      startRecognizer(onDeviceAvailable)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      recognizer?.stopListening()
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      recognizer?.cancel()
      rejectAndRelease("CANCELLED", "Se canceló el dictado.")
      promise.resolve(null)
    }
  }

  override fun invalidate() {
    UiThreadUtil.runOnUiThread {
      recognizer?.cancel()
      rejectAndRelease("CANCELLED", "Se canceló el dictado.")
    }
    super.invalidate()
  }

  override fun onResults(results: Bundle?) {
    val transcript =
        results
            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.firstOrNull()
            ?.trim()
    if (transcript.isNullOrEmpty()) rejectAndRelease("NO_MATCH", "No se reconoció ninguna frase.")
    else resolveAndRelease(transcript)
  }

  override fun onError(error: Int) {
    if (
        usingOnDeviceRecognizer &&
            (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED ||
                error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)
    ) {
      releaseRecognizer()
      startRecognizer(false)
      return
    }
    val code =
        when (error) {
          SpeechRecognizer.ERROR_NO_MATCH -> "NO_MATCH"
          SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "TIMEOUT"
          SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "PERMISSION_DENIED"
          SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "BUSY"
          SpeechRecognizer.ERROR_NETWORK,
          SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "NETWORK"
          SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED,
          SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "LANGUAGE_UNAVAILABLE"
          else -> "RECOGNITION_FAILED"
        }
    val message =
        when (code) {
          "NO_MATCH" -> "No se reconoció ninguna frase."
          "TIMEOUT" -> "No se detectó voz a tiempo."
          "PERMISSION_DENIED" -> "Falta permiso para usar el micrófono."
          "BUSY" -> "El servicio de voz está ocupado."
          "NETWORK" -> "El servicio de voz necesita conexión."
          "LANGUAGE_UNAVAILABLE" -> "El idioma de dictado no está disponible en el dispositivo."
          else -> "No se pudo convertir la voz en texto."
        }
    rejectAndRelease(code, message)
  }

  private fun resolveAndRelease(value: String) {
    val promise = pendingPromise
    pendingPromise = null
    releaseRecognizer()
    promise?.resolve(value)
  }

  private fun rejectAndRelease(code: String, message: String) {
    val promise = pendingPromise
    pendingPromise = null
    releaseRecognizer()
    promise?.reject(code, message)
  }

  private fun releaseRecognizer() {
    recognizer?.destroy()
    recognizer = null
    usingOnDeviceRecognizer = false
  }

  private fun startRecognizer(onDevice: Boolean) {
    try {
      usingOnDeviceRecognizer = onDevice
      recognizer =
          if (onDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
              SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
          else SpeechRecognizer.createSpeechRecognizer(context)
      recognizer?.setRecognitionListener(this)
      recognizer?.startListening(
          Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, currentLocale)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
          },
      )
    } catch (_: RuntimeException) {
      if (onDevice) {
        releaseRecognizer()
        startRecognizer(false)
      } else {
        rejectAndRelease("START_FAILED", "No se pudo iniciar el dictado.")
      }
    }
  }

  override fun onReadyForSpeech(params: Bundle?) = Unit
  override fun onBeginningOfSpeech() = Unit
  override fun onRmsChanged(rmsdB: Float) = Unit
  override fun onBufferReceived(buffer: ByteArray?) = Unit
  override fun onEndOfSpeech() = Unit
  override fun onPartialResults(partialResults: Bundle?) = Unit
  override fun onEvent(eventType: Int, params: Bundle?) = Unit
}
