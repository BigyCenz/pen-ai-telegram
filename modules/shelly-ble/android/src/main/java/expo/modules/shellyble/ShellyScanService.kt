package expo.modules.shellyble

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.ParcelUuid
import android.os.PowerManager

// Canale tra il servizio (che vive anche a schermo spento) e il modulo Expo
// (che inoltra gli eventi al JS). I callback sono impostati dal modulo.
object ShellyBus {
  @Volatile var onButton: ((mac: String, event: String, packetId: Int, rssi: Int) -> Unit)? = null
  @Volatile var onLog: ((String) -> Unit)? = null
  @Volatile var running: Boolean = false
}

// Servizio in primo piano che tiene attiva la scansione BLE filtrata sugli
// advertising BTHome (service data UUID 0xFCD2) dello Shelly BLU Button1.
//
// Perché un servizio in primo piano: a schermo spento Android ferma le
// scansioni dell'app in background; con un servizio in primo piano (notifica
// fissa) il processo resta vivo, e con le scansioni FILTRATE (dal 8.1 quelle
// senza filtro si fermano a schermo spento) i pacchetti continuano ad
// arrivare. Wake lock e WiFi lock servono a non perdere la sessione TCP con
// la penna mentre il telefono è inattivo.
class ShellyScanService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.shellyble.START"
    const val ACTION_STOP = "expo.modules.shellyble.STOP"
    const val EXTRA_MAC = "mac"
    private const val CHANNEL_ID = "shelly_remote"
    private const val NOTIF_ID = 4711
    // Lo stesso evento viene ripetuto più volte con lo stesso packet id: lo
    // scarto se è uguale all'ultimo dello stesso dispositivo entro questa
    // finestra. Dopo la finestra lo accetto comunque, perché il contatore
    // è a 8 bit e torna a valori già visti.
    private const val DEDUP_WINDOW_MS = 10_000L
    private val BTHOME_UUID: ParcelUuid = ParcelUuid.fromString("0000fcd2-0000-1000-8000-00805f9b34fb")
  }

  private var scanCallback: ScanCallback? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null
  private var wifiLockLowLatency: WifiManager.WifiLock? = null
  private val lastSeen = HashMap<String, Pair<Int, Long>>() // mac -> (packetId, timestamp)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      shutdown()
      return START_NOT_STICKY
    }

    startInForeground()
    acquireLocks()
    stopScan() // se era già in corso (es. cambio MAC) riparto da zero
    lastSeen.clear()
    startScan(intent?.getStringExtra(EXTRA_MAC)?.takeIf { it.isNotBlank() })
    // NOT_STICKY: se il sistema uccide il processo, anche il JS (che gestisce
    // scatto e invio) è morto, quindi un riavvio del solo servizio non servirebbe.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopScan()
    releaseLocks()
    ShellyBus.running = false
    super.onDestroy()
  }

  private fun log(msg: String) {
    ShellyBus.onLog?.invoke(msg)
  }

  private fun startInForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Telecomando Shelly", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION") Notification.Builder(this)
    }
    val notification = builder
      .setContentTitle("Telecomando Shelly attivo")
      .setContentText("In ascolto del pulsante, anche a schermo spento")
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .apply { if (pending != null) setContentIntent(pending) }
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    } else {
      startForeground(NOTIF_ID, notification)
    }
    ShellyBus.running = true
  }

  @Suppress("DEPRECATION")
  private fun acquireLocks() {
    if (wakeLock == null) {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "penai:shelly").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
    if (wifiLock == null) {
      val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      // WIFI_MODE_FULL_LOW_LATENCY funziona solo con schermo acceso e app in
      // primo piano; a schermo spento il WiFi andrebbe in risparmio energia e
      // la sessione con la penna cadrebbe. WIFI_MODE_FULL_HIGH_PERF (deprecato
      // ma ancora onorato) tiene il WiFi sveglio anche a schermo spento: li
      // tengo entrambi.
      wifiLock = wm?.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "penai:shelly-hp")?.apply {
        setReferenceCounted(false)
        acquire()
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        wifiLockLowLatency = wm?.createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "penai:shelly-ll")?.apply {
          setReferenceCounted(false)
          acquire()
        }
      }
    }
  }

  private fun releaseLocks() {
    try { wakeLock?.takeIf { it.isHeld }?.release() } catch (_: Exception) {}
    try { wifiLock?.takeIf { it.isHeld }?.release() } catch (_: Exception) {}
    try { wifiLockLowLatency?.takeIf { it.isHeld }?.release() } catch (_: Exception) {}
    wakeLock = null
    wifiLock = null
    wifiLockLowLatency = null
  }

  private fun hasScanPermission(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
    } else {
      checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }
  }

  private fun startScan(mac: String?) {
    if (!hasScanPermission()) {
      log("Scansione BLE non avviata: permesso Bluetooth/posizione mancante.")
      shutdown()
      return
    }
    val adapter = (getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
    if (adapter == null || !adapter.isEnabled) {
      log("Scansione BLE non avviata: Bluetooth spento o non disponibile.")
      shutdown()
      return
    }
    val scanner = adapter.bluetoothLeScanner
    if (scanner == null) {
      log("Scansione BLE non avviata: scanner BLE non disponibile.")
      shutdown()
      return
    }

    // Filtro sul service data BTHome (dati e maschera vuoti = "qualunque
    // contenuto per questo UUID"). Con un MAC noto lo aggiungo allo stesso
    // filtro (condizioni in AND), così vengono ignorati gli altri dispositivi.
    val filter = ScanFilter.Builder()
      .setServiceData(BTHOME_UUID, ByteArray(0), ByteArray(0))
      .apply { if (mac != null) setDeviceAddress(mac.uppercase()) }
      .build()
    val settings = ScanSettings.Builder()
      .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
      .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
      .build()

    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) = handle(result)
      override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach { handle(it) }
      override fun onScanFailed(errorCode: Int) {
        log("Scansione BLE fallita (codice $errorCode).")
      }
    }
    try {
      scanner.startScan(listOf(filter), settings, callback)
      scanCallback = callback
      log(if (mac != null) "Scansione BLE avviata (solo $mac)." else "Scansione BLE avviata (tutti i dispositivi BTHome).")
    } catch (e: SecurityException) {
      log("Scansione BLE negata dal sistema: ${e.message}")
      shutdown()
    } catch (e: Exception) {
      log("Scansione BLE non avviata: ${e.message}")
      shutdown()
    }
  }

  private fun stopScan() {
    val cb = scanCallback ?: return
    try {
      val adapter = (getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
      adapter?.bluetoothLeScanner?.stopScan(cb)
    } catch (_: Exception) {
      // Bluetooth già spento o permesso revocato: niente da fermare.
    }
    scanCallback = null
  }

  private fun handle(result: ScanResult) {
    val data = result.scanRecord?.getServiceData(BTHOME_UUID) ?: return
    val reading = BtHomeParser.parse(data) ?: return
    val mac = result.device.address ?: return

    if (reading.encrypted) {
      log("Pacchetto BTHome cifrato da $mac: non supportato (disattiva la cifratura del pulsante).")
      return
    }
    val event = reading.buttonEvent ?: return
    val packetId = reading.packetId ?: -1

    val now = System.currentTimeMillis()
    val prev = lastSeen[mac]
    if (packetId >= 0 && prev != null && prev.first == packetId && now - prev.second < DEDUP_WINDOW_MS) {
      return
    }
    lastSeen[mac] = Pair(packetId, now)
    ShellyBus.onButton?.invoke(mac, event, packetId, result.rssi)
  }

  private fun shutdown() {
    stopScan()
    releaseLocks()
    ShellyBus.running = false
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }
}
