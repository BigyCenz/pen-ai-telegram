// Client per il protocollo REALE della penna V720/A9-Naxclow, ricavato da
// cattura Wireshark reale (pcap analizzato il 30/09/2026).
//
// PROTOCOLLO CONFERMATO (non più placeholder):
// - Trasporto: TCP, porta 6123, IP penna = gateway della rete AP (es. 192.168.169.1,
//   verificabile in Impostazioni WiFi → dettagli rete → Gateway).
// - Ogni messaggio ha un header fisso di 20 byte seguito dal payload:
//     [0:4]   uint32 LE  lunghezza del payload che segue
//     [4:8]   uint32 LE  tipo messaggio (0 = comando/risposta JSON,
//                        1 = chunk immagine snapshot in chiaro,
//                        4 = chunk video live, offuscato/non-JPEG diretto)
//     [8:16]  8 byte     "00000000" ASCII per messaggi JSON, zero raw per ping/binari
//     [16:20] uint32 LE  zero per JSON; contatore progressivo per chunk binari
// - Login: JSON {"unixTimer":<unix>,"code":501,"target":"<devId>","token":"NaxclowToken"}
//   risposta: {"code":501,"target":"<devId>","status":200}
// - Avvio live view (utile prima dello snapshot, osservato nell'app originale):
//   {"code":502,"content":{"devTarget":"<devId>","code":3}}
// - Richiesta SNAPSHOT (comando confermato dal pcap):
//   {"code":502,"content":{"devTarget":"<devId>","code":218}}
//   La risposta arriva come una sequenza di messaggi tipo=1, ciascuno da max
//   1004 byte di payload, da concatenare nell'ordine di arrivo fino a trovare
//   il marker di fine JPEG (FF D9). Nel mezzo possono arrivare anche chunk
//   tipo=4 (video live) e messaggi JSON: vanno ignorati per l'estrazione
//   dello snapshot.
//
// devId: ricavabile dal nome della rete della penna, es. SSID "Nax_22C160004AFB"
// -> devId "22C160004AFB".

import TcpSocket from 'react-native-tcp-socket';

const DEVICE_PORT = 6123;
const HEADER_LEN = 20;
const DEVICE_TOKEN = 'NaxclowToken';

function extractDevIdFromSsid(ssid) {
  const m = /^Nax_(.+)$/i.exec(ssid || '');
  return m ? m[1] : null;
}

function buildHeader({ length = 0, type = 0, asciiPlaceholder = true, trailing = 0 }) {
  const buf = Buffer.alloc(HEADER_LEN);
  buf.writeUInt32LE(length, 0);
  buf.writeUInt32LE(type, 4);
  if (asciiPlaceholder) {
    buf.write('00000000', 8, 'ascii');
  }
  buf.writeUInt32LE(trailing, 16);
  return buf;
}

function buildJsonMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = buildHeader({ length: json.length, type: 0, asciiPlaceholder: true });
  return Buffer.concat([header, json]);
}

export class NaxclowClient {
  constructor({ deviceIp, devicePort = DEVICE_PORT, ssid } = {}) {
    this.deviceIp = deviceIp;
    this.devicePort = devicePort;
    this.devId = extractDevIdFromSsid(ssid);
    this.socket = null;
    this.connected = false;
    this.recvBuffer = Buffer.alloc(0);
    this.messageHandlers = [];
  }

  connect(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout connessione TCP alla penna')), timeoutMs);
      this.socket = TcpSocket.createConnection(
        { host: this.deviceIp, port: this.devicePort },
        () => {
          clearTimeout(timeout);
          this.connected = true;
          resolve();
        }
      );
      this.socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      this.socket.on('data', (data) => this._onData(data));
      this.socket.on('close', () => {
        this.connected = false;
      });
    });
  }

  _onData(chunk) {
    this.recvBuffer = Buffer.concat([this.recvBuffer, Buffer.from(chunk)]);
    // Estrae tutti i messaggi completi disponibili nel buffer
    while (this.recvBuffer.length >= HEADER_LEN) {
      const length = this.recvBuffer.readUInt32LE(0);
      const type = this.recvBuffer.readUInt32LE(4);
      const totalLen = HEADER_LEN + length;
      if (this.recvBuffer.length < totalLen) break; // messaggio incompleto, aspetta altri dati

      const payload = this.recvBuffer.slice(HEADER_LEN, totalLen);
      this.recvBuffer = this.recvBuffer.slice(totalLen);

      this.messageHandlers.forEach((h) => h(type, payload));
    }
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  _sendJson(obj) {
    if (!this.connected) throw new Error('Socket non connesso alla penna');
    this.socket.write(buildJsonMessage(obj));
  }

  // Login: obbligatorio prima di qualsiasi comando. Risolve quando riceve
  // status 200, rigetta su status diverso o timeout.
  login(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (!this.devId) return reject(new Error('devId non determinato: passa lo SSID (es. Nax_XXXX) al client'));

      const timeout = setTimeout(() => {
        off();
        reject(new Error('Timeout login: nessuna risposta dalla penna'));
      }, timeoutMs);

      const off = this.onMessage((type, payload) => {
        if (type !== 0) return;
        let msg;
        try {
          msg = JSON.parse(payload.toString('utf8'));
        } catch (e) {
          return;
        }
        if (msg.code === 501) {
          clearTimeout(timeout);
          off();
          if (msg.status === 200) resolve(msg);
          else reject(new Error(`Login rifiutato dalla penna (status ${msg.status})`));
        }
      });

      this._sendJson({
        unixTimer: Math.floor(Date.now() / 1000),
        code: 501,
        target: this.devId,
        token: DEVICE_TOKEN,
      });
    });
  }

  // Avvia la live view lato penna: osservato nell'app originale prima dello
  // snapshot. Non blocca in attesa di conferma esplicita (fire-and-forget
  // con breve attesa), per non complicare il flusso se il device non
  // risponde in modo distinguibile.
  startLiveView() {
    this._sendJson({ code: 502, content: { devTarget: this.devId, code: 3 } });
  }

  // Richiede uno snapshot e restituisce un Buffer JPEG completo, filtrando
  // solo i chunk di tipo 1 (immagine in chiaro) e ignorando eventuali chunk
  // video live (tipo 4) o messaggi JSON che arrivano nel mezzo.
  requestSnapshot(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      let imageBuffer = Buffer.alloc(0);
      let collecting = false;

      const timeout = setTimeout(() => {
        off();
        reject(new Error('Timeout: snapshot non ricevuto dalla penna'));
      }, timeoutMs);

      const off = this.onMessage((type, payload) => {
        if (type !== 1) return; // ignora video live (4) e JSON (0)
        collecting = true;
        imageBuffer = Buffer.concat([imageBuffer, payload]);

        // JPEG End Of Image marker: FF D9
        const eoiIndex = imageBuffer.indexOf(Buffer.from([0xff, 0xd9]));
        if (eoiIndex !== -1) {
          clearTimeout(timeout);
          off();
          resolve(imageBuffer.slice(0, eoiIndex + 2));
        }
      });

      this._sendJson({ code: 502, content: { devTarget: this.devId, code: 218 } });
    });
  }

  // "Live preview" implementata come richieste di snapshot ripetute: è
  // l'unico formato (tipo 1, JPEG in chiaro) che sappiamo decodificare con
  // certezza. Il vero streaming video continuo (tipo 4) usa un formato
  // diverso/offuscato non ancora decifrato, quindi non viene usato qui.
  startLivePreview(onFrame, intervalMs = 1500) {
    this.stopLivePreview();
    this._liveTimer = setInterval(async () => {
      if (this._fetchingFrame) return;
      this._fetchingFrame = true;
      try {
        const frame = await this.requestSnapshot(intervalMs);
        onFrame(frame);
      } catch (e) {
        // un frame perso ogni tanto è normale, non blocchiamo il loop
      } finally {
        this._fetchingFrame = false;
      }
    }, intervalMs);
  }

  stopLivePreview() {
    if (this._liveTimer) {
      clearInterval(this._liveTimer);
      this._liveTimer = null;
    }
  }

  close() {
    this.stopLivePreview();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.messageHandlers = [];
  }
}

export default NaxclowClient;
