package ec.notesia.planner

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class NotesIASpeechPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): MutableList<NativeModule> =
      mutableListOf(
          NotesIAConfigModule(reactContext),
          NotesIASpeechModule(reactContext),
          NotesIASplashModule(reactContext),
          NotesIATtsModule(reactContext),
          NotesIAFilesModule(reactContext),
      )

  override fun createViewManagers(
      reactContext: ReactApplicationContext,
  ): MutableList<ViewManager<*, *>> = mutableListOf()
}
