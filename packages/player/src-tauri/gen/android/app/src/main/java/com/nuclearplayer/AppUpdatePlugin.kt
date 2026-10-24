package com.nuclearplayer

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.concurrent.Executors

@InvokeArg
class InstallArgs {
  lateinit var path: String
}

// Installs an APK that the app downloaded itself, over the running install.
//
// It goes through PackageInstaller instead of an ACTION_VIEW intent because a
// session lets Android 12+ skip the confirmation screen when the app is the one
// that installed the previous version. The first update after a manual install
// still asks once; the system decides, not us.
//
// Android only accepts the new APK if it is signed with the same key (or one
// the old key vouches for through a rotation lineage), so a tampered download
// is rejected by the OS no matter where it came from.
@TauriPlugin
class AppUpdatePlugin(private val activity: Activity) : Plugin(activity) {
  private val context = activity.applicationContext
  private val worker = Executors.newSingleThreadExecutor()

  private var pendingInvoke: Invoke? = null

  private val resultReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
      val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)

      when (status) {
        PackageInstaller.STATUS_PENDING_USER_ACTION -> {
          val confirmation = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java)
          if (confirmation == null) {
            finish { it.reject("The installer asked for confirmation without a screen to show") }
            return
          }
          activity.startActivity(confirmation)
          finish { it.resolve() }
        }
        PackageInstaller.STATUS_SUCCESS -> finish { it.resolve() }
        else -> {
          Log.w(TAG, "Install failed with status $status: $message")
          finish { it.reject(message ?: "Install failed with status $status") }
        }
      }
    }
  }

  override fun load(webView: android.webkit.WebView) {
    ContextCompat.registerReceiver(
      context,
      resultReceiver,
      IntentFilter(ACTION_INSTALL_RESULT),
      ContextCompat.RECEIVER_NOT_EXPORTED
    )
  }

  override fun onDestroy() {
    context.unregisterReceiver(resultReceiver)
    worker.shutdownNow()
  }

  @Command
  fun canInstall(invoke: Invoke) {
    val result = JSObject()
    result.put("value", context.packageManager.canRequestPackageInstalls())
    invoke.resolve(result)
  }

  @Command
  fun openInstallSettings(invoke: Invoke) {
    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
    activity.startActivity(intent)
    invoke.resolve()
  }

  @Command
  fun install(invoke: Invoke) {
    val args = invoke.parseArgs(InstallArgs::class.java)
    val apk = File(args.path)
    if (!apk.isFile) {
      invoke.reject("No update file at ${args.path}")
      return
    }

    pendingInvoke = invoke
    worker.execute {
      try {
        commit(apk)
      } catch (error: Exception) {
        Log.w(TAG, "Could not start the install", error)
        finish { it.reject(error.message ?: "Could not start the install") }
      }
    }
  }

  private fun commit(apk: File) {
    val installer = context.packageManager.packageInstaller
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
    params.setAppPackageName(context.packageName)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
    }

    val sessionId = installer.createSession(params)
    installer.openSession(sessionId).use { session ->
      apk.inputStream().use { input ->
        session.openWrite(SESSION_ENTRY, 0, apk.length()).use { output ->
          input.copyTo(output)
          session.fsync(output)
        }
      }

      val resultIntent = Intent(ACTION_INSTALL_RESULT).setPackage(context.packageName)
      val pending = PendingIntent.getBroadcast(
        context,
        sessionId,
        resultIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      )
      session.commit(pending.intentSender)
    }
  }

  private fun finish(action: (Invoke) -> Unit) {
    val invoke = pendingInvoke ?: return
    pendingInvoke = null
    action(invoke)
  }

  companion object {
    private const val TAG = "AppUpdatePlugin"
    private const val ACTION_INSTALL_RESULT = "com.nuclearplayer.INSTALL_RESULT"
    private const val SESSION_ENTRY = "nuclear-android.apk"
  }
}
