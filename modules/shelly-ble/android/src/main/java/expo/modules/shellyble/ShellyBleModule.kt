package expo.modules.shellyble

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Ponte verso il JS per il telecomando Shelly BLU Button1 (BLE, BTHome v2).
// La scansione vera e propria vive in ShellyScanService, così continua a
// funzionare a schermo spento; questo modulo la avvia/ferma e inoltra al JS
// gli eventi del pulsante e i messaggi diagnostici.
class ShellyBleModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShellyBle")

    Events("onButtonEvent", "onRemoteLog", "onTick")

    OnCreate {
      ShellyBus.onButton = { mac, event, packetId, rssi ->
        sendEvent(
          "onButtonEvent",
          mapOf("mac" to mac, "event" to event, "packetId" to packetId, "rssi" to rssi)
        )
      }
      ShellyBus.onLog = { msg -> sendEvent("onRemoteLog", mapOf("message" to msg)) }
      ShellyBus.onTick = { sendEvent("onTick", mapOf("t" to System.currentTimeMillis())) }
    }

    OnDestroy {
      ShellyBus.onButton = null
      ShellyBus.onLog = null
      ShellyBus.onTick = null
    }

    // Avvia il servizio in primo piano. mac = null → ascolta qualunque
    // dispositivo BTHome (serve per "imparare" il pulsante).
    Function("startRemote") { mac: String?, scan: Boolean ->
      val ctx = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(ctx, ShellyScanService::class.java).apply {
        action = ShellyScanService.ACTION_START
        putExtra(ShellyScanService.EXTRA_MAC, mac)
        putExtra(ShellyScanService.EXTRA_SCAN, scan)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
      Unit
    }

    Function("stopRemote") {
      val ctx = appContext.reactContext ?: return@Function Unit
      ctx.startService(
        Intent(ctx, ShellyScanService::class.java).apply { action = ShellyScanService.ACTION_STOP }
      )
      Unit
    }

    Function("isRunning") { ShellyBus.running }

    Function("isIgnoringBatteryOptimizations") {
      val ctx = appContext.reactContext ?: return@Function false
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    // Apre la richiesta di sistema per escludere l'app dall'ottimizzazione
    // batteria (l'utente deve confermare: non si può fare in silenzio).
    Function("requestIgnoreBatteryOptimizations") {
      val ctx = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(
        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:${ctx.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
      Unit
    }
  }
}
