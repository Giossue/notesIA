package ec.notesia.planner

import android.content.ClipData
import android.content.Intent
import android.util.Base64
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/** Guarda un archivo generado por la app y abre el menú del sistema para guardarlo o compartirlo. */
class NotesIAFilesModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "NotesIAFiles"

  @ReactMethod
  fun share(base64: String, fileName: String, mimeType: String, title: String, promise: Promise) {
    try {
      val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80)
      val folder = File(reactContext.cacheDir, "exports").apply { mkdirs() }
      // Solo se guarda la última exportación: no se acumulan datos personales.
      folder.listFiles()?.forEach { it.delete() }
      val file = File(folder, safeName)
      file.writeBytes(Base64.decode(base64, Base64.DEFAULT))
      val uri =
          FileProvider.getUriForFile(reactContext, "${reactContext.packageName}.files", file)
      val send =
          Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newRawUri(safeName, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }
      val chooser =
          Intent.createChooser(send, title).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      val activity = reactContext.currentActivity
      if (activity != null) activity.startActivity(chooser) else reactContext.startActivity(chooser)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SHARE_FAILED", "No se pudo abrir el archivo para compartirlo.", error)
    }
  }
}
