package expo.modules.cellularnetwork

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.Promise

// PERCHÉ QUESTO MODULO ESISTE
//
// react-native-wifi-reborn (usato per connettersi alla penna) espone
// releaseWifiForcing(), che internamente chiama solo
// ConnectivityManager.bindProcessToNetwork(null). Quella chiamata SCIOGLIE
// il binding esplicito del processo, ma NON forza Android a passare alla
// rete cellulare: si limita a "lasciare scegliere al sistema". In pratica,
// su molti device (confermato empiricamente su questo progetto tramite
// cattura di rete: pen3.pcap mostra query DNS senza risposta con WiFi
// attivo, che invece funzionano a WiFi spento) Android continua a
// preferire il WiFi già connesso anche se dichiarato "senza internet",
// perché la richiesta di rete WiFi fatta da connectToPen() tramite
// requestNetwork() resta comunque attiva finché non viene esplicitamente
// rilasciata — bindProcessToNetwork(null) non la rilascia, la scioglie
// solo dal singolo processo.
//
// Questo modulo fa la cosa corretta: richiede esplicitamente la rete
// TRANSPORT_CELLULAR con requestNetwork() e, quando diventa disponibile,
// chiama bindProcessToNetwork(quella rete specifica) — non null. Questo è
// l'unico modo documentato per garantire che le richieste HTTP del
// processo passino sui dati mobili anche con un WiFi "senza internet"
// ancora attivamente connesso.
class CellularNetworkModule : Module() {
  private var connectivityManager: ConnectivityManager? = null
  private var activeCallback: ConnectivityManager.NetworkCallback? = null

  override fun definition() = ModuleDefinition {
    Name("CellularNetwork")

    OnCreate {
      connectivityManager = appContext.reactContext
        ?.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    }

    // Richiede esplicitamente la rete cellulare e ci binda il processo.
    // Risolve quando il binding è attivo, rigetta se la rete cellulare
    // non è disponibile entro il timeout (es. dati mobili spenti/assenti
    // di segnale) o se il permesso di sistema manca.
    AsyncFunction("requestCellular") { timeoutMs: Double?, promise: Promise ->
      val cm = connectivityManager
      if (cm == null) {
        promise.reject(Exceptions.ReactContextLost())
        return@AsyncFunction
      }

      // Se una richiesta precedente è ancora attiva, la rilascia prima di
      // farne una nuova: evitare di accumulare callback registrate senza
      // mai rimuoverle (memory/registration leak lato ConnectivityManager).
      releaseActiveCallback(cm)

      val request = NetworkRequest.Builder()
        .addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
        .build()

      val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
          super.onAvailable(network)
          try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
              cm.bindProcessToNetwork(network)
            } else {
              @Suppress("DEPRECATION")
              ConnectivityManager.setProcessDefaultNetwork(network)
            }
            promise.resolve(null)
          } catch (e: Exception) {
            promise.reject("ERR_BIND_FAILED", "Binding alla rete cellulare fallito: ${e.message}", e)
          }
          // Il callback resta registrato apposta (non viene rimosso qui):
          // se la rete cellulare dovesse sparire/tornare durante la
          // sessione, onAvailable verrebbe richiamato di nuovo e il
          // binding verrebbe ristabilito automaticamente. Viene rimosso
          // esplicitamente solo da releaseCellular()/requestCellular()
          // successive.
        }

        override fun onUnavailable() {
          super.onUnavailable()
          promise.reject(
            "ERR_CELLULAR_UNAVAILABLE",
            "Rete cellulare non disponibile (dati mobili spenti, assenza di segnale, o SIM non presente).",
            null
          )
        }
      }

      activeCallback = callback

      try {
        val timeout = (timeoutMs ?: 8000.0).toLong()
        cm.requestNetwork(request, callback, timeout.toInt())
      } catch (e: Exception) {
        promise.reject("ERR_REQUEST_FAILED", "Richiesta rete cellulare fallita: ${e.message}", e)
      }
    }

    // Rilascia il binding esplicito e la richiesta di rete cellulare
    // attiva. Da chiamare quando la chiamata verso il servizio esterno è
    // terminata, per non tenere il processo bindato ai dati mobili più
    // del necessario (es. così la successiva richiesta verso la penna,
    // che parla solo sulla sua rete WiFi, non finisce accidentalmente
    // instradata sui dati mobili).
    Function("releaseCellular") {
      val cm = connectivityManager ?: return@Function
      releaseActiveCallback(cm)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        cm.bindProcessToNetwork(null)
      } else {
        @Suppress("DEPRECATION")
        ConnectivityManager.setProcessDefaultNetwork(null)
      }
    }
  }

  private fun releaseActiveCallback(cm: ConnectivityManager) {
    activeCallback?.let {
      try {
        cm.unregisterNetworkCallback(it)
      } catch (e: IllegalArgumentException) {
        // Già rimossa (es. scaduta per timeout lato sistema): non è un
        // errore fatale, ignorato di proposito.
      }
    }
    activeCallback = null
  }
}
