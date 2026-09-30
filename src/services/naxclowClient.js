// Client per il protocollo REALE della penna V720/A9-Naxclow, ricavato da
// DUE catture Wireshark reali (pen1: 30/09/2026, pen2: 30/09/2026 - sessione
// completa con discovery + login + live view + snapshot).
//
// PROTOCOLLO CONFERMATO (v2, aggiornato dopo analisi di pen2.pcap):
//
// TRASPORTO: TCP, porta 6123, IP penna = gateway della rete AP (es.
// 192.168.169.1, verificabile in Impostazioni WiFi → dettagli rete →
// Gateway).
//
// L'app originale apre in realtà FINO A 3 connessioni TCP distinte per una
// sessione completa:
//   1-2) Connessioni di "discovery" (brevissime, si apre/chiude subito):
//        il telefono manda un frame vuoto type=114, la penna risponde con
//        un frame type=114 contenente {"devId","devName","devModel","battery"}
//        in chiaro. QUESTO è il modo corretto per ottenere il devId, non va
//        derivato dal SSID (che resta solo un fallback se la discovery non
//        risponde, per compatibilità con firmware che non la implementano).
//   3)   Connessione di sessione "vera": ping/pong (type=115) → login (501)
//        → query stato device (502/code:4) → avvio live view (502/code:3)
//        → da qui in poi la penna manda in autonomia, senza altri comandi,
//        un flusso continuo di frame type=1 (JPEG completi, uno via l'altro,
//        NON legati singolarmente a un comando specifico) intrecciati a
//        frame type=4 (video live, formato offuscato non decifrato).
//        Il comando 218 (snapshot "vero", es. da pulsante) si limita ad
//        agganciarsi a questo flusso già in corso: l'ack arriva più tardi
//        come JSON separato ({"code":502,"content":{"code":218,...}}) e
//        NON è temporalmente legato a uno specifico frame JPEG. Per questo
//        lo snapshot va implementato come "prendi il prossimo frame JPEG
//        completo che INIZIA dopo l'invio del comando", scartando un
//        eventuale frame già a metà ricezione in quel momento.
//   A metà sessione compare anche un frame vuoto type=100 (keepalive) ogni
//   ~9 secondi, inviato dal telefono.
//
// FORMATO HEADER: 20 byte fissi seguiti dal payload:
//     [0:4]   uint32 LE  lunghezza del payload che segue
//     [4:8]   uint32 LE  tipo messaggio:
//                         0   = comando/risposta JSON
//                         1   = chunk immagine snapshot/live in chiaro (JPEG)
//                         4   = chunk video live (offuscato, non decifrato)
//                         100 = keepalive periodico (telefono → penna)
//                         114 = discovery devId (richiesta/risposta)
//                         115 = ping/pong iniziale, prima del login
//     [8:16]  8 byte     placeholder: ASCII "00000000" per type 0 e 100;
//                        8 byte raw a zero per type 1/4/114/115 (differenza
//                        confermata byte-per-byte dal pcap, va rispettata)
//     [16:20] uint32 LE  zero per JSON/controllo; contatore progressivo per
//                        i chunk immagine (non usato per la ricostruzione,
//                        solo diagnostico)
//
// Login: JSON {"unixTimer":<unix>,"code":501,"target":"<devId>","token":"NaxclowToken"}
//   risposta: {"code":501,"target":"<devId>","status":200}
// Query stato device (opzionale, best-effort):
//   {"code":502,"content":{"unixTimer":<unix>,"devTarget":"<devId>","code":4}}
//   risposta: {"code":502,"target":"<devId>","content":{"code":4,"devPower":...,"wifiName":...,"version":...}}
// Avvio live view (fa partire lo stream continuo di frame type=1/type=4):
//   {"code":502,"content":{"devTarget":"<devId>","code":3}}
// Richiesta SNAPSHOT (si aggancia al flusso già in corso):
//   {"code":502,"content":{"devTarget":"<devId>","code":218}}
//
// devId: preferibilmente ottenuto via discoverDevice(); il fallback dal SSID
// (es. "Nax_22C160004AFB" -> "22C160004AFB") resta disponibile ma è meno
// affidabile perché dipende da un pattern di naming non garantito su tutti
// i firmware/modelli.

import TcpSocket from 'react-native-tcp-socket';

const DEVICE_PORT = 6123;
const HEADER_LEN = 20;
const DEVICE_TOKEN = 'NaxclowToken';

const TYPE_JSON = 0;
const TYPE_IMAGE = 1;
const TYPE_VIDEO = 4;
const TYPE_KEEPALIVE = 100;
const TYPE_DISCOVERY = 114;
const TYPE_PING = 115;

const ASCII_ZEROES = Buffer.from('00000000', 'ascii'); // 8 byte, per type 0/100
const RAW_ZEROES = Buffer.alloc(8); // 8 byte a zero, per type 1/4/114/115

const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

export function extractDevIdFromSsid(ssid) {
  const m = /^Nax_(.+)$/i.exec(ssid || '');
  return m ? m[1] : null;
}

function buildHeader(length, type, placeholder8 = RAW_ZEROES, trailing = 0) {
  const buf = Buffer.alloc(HEADER_LEN);
  buf.writeUInt32LE(length, 0);
  buf.writeUInt32LE(type, 4);
  placeholder8.copy(buf, 8);
  buf.writeUInt32LE(trailing, 16);
  return buf;
}

function buildJsonMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = buildHeader(json.length, TYPE_JSON, ASCII_ZEROES);
  return Buffer.concat([header, json]);
}

function buildEmptyFrame(type, placeholder8 = RAW_ZEROES) {
  return buildHeader(0, type, placeholder8);
}

// Discovery del devId: apre una connessione TCP breve e a se stante (come fa
// l'app originale), manda un frame vuoto type=114 e attende la risposta
// JSON in chiaro con devId/devName/devModel/battery. Va chiamata PRIMA di
// aprire la connessione di sessione principale.
export function discoverDevice({ deviceIp, devicePort = DEVICE_PORT, timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let recvBuffer = Buffer.alloc(0);
    let socket = null;

    const settle = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (socket) socket.destroy();
      fn(arg);
    };

    const timeout = setTimeout(() => {
      settle(reject, new Error('Timeout discovery devId: la penna non ha risposto al frame type=114'));
    }, timeoutMs);

    socket = TcpSocket.createConnection({ host: deviceIp, port: devicePort }, () => {
      socket.write(buildEmptyFrame(TYPE_DISCOVERY, RAW_ZEROES));
    });

    socket.on('data', (chunk) => {
      recvBuffer = Buffer.concat([recvBuffer, Buffer.from(chunk)]);
      if (recvBuffer.length < HEADER_LEN) return;
      const length = recvBuffer.readUInt32LE(0);
      const type = recvBuffer.readUInt32LE(4);
      if (recvBuffer.length < HEADER_LEN + length) return;
      const payload = recvBuffer.slice(HEADER_LEN, HEADER_LEN + length);
      if (type === TYPE_DISCOVERY && length > 0) {
        try {
          const info = JSON.parse(payload.toString('utf8'));
          settle(resolve, info);
        } catch (e) {
          settle(reject, new Error(`Risposta discovery non valida: ${e.message}`));
        }
      }
      // altri tipi durante la discovery vengono ignorati: non dovrebbero
      // capitarne, ma non è un errore fatale se capitano.
    });

    socket.on('error', (err) => settle(reject, err));
  });
}

export class NaxclowClient {
  constructor({ deviceIp, devicePort = DEVICE_PORT, ssid, devId } = {}) {
    this.deviceIp = deviceIp;
    this.devicePort = devicePort;
    this.devId = devId || extractDevIdFromSsid(ssid);
    this.socket = null;
    this.connected = false;
    this.recvBuffer = Buffer.alloc(0);
    this.messageHandlers = [];
    this.frameHandlers = [];

    // stato assemblatore immagini: le penne di questa famiglia trasmettono
    // un flusso continuo di JPEG completi una volta avviata la live view,
    // non un singolo frame per singolo comando.
    this._imgAssembleBuf = Buffer.alloc(0);
    this._assembling = false;
    this._frameSeq = 0;

    // stato handshake iniziale (ping/pong prima del login)
    this._awaitingPong = false;
    this._pendingConnectResolve = null;

    this._keepaliveTimer = null;
    this._livePreviewOff = null;
  }

  connect(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const overallTimeout = setTimeout(() => {
        finish(reject, new Error('Timeout connessione/handshake iniziale con la penna (ping/pong type=115 senza risposta)'));
      }, timeoutMs);

      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        clearTimeout(overallTimeout);
        fn(arg);
      };

      this._pendingConnectResolve = () => finish(resolve, undefined);

      this.socket = TcpSocket.createConnection(
        { host: this.deviceIp, port: this.devicePort },
        () => {
          // Connesso a livello TCP: prima di considerarsi "pronti" va fatto
          // l'handshake ping/pong type=115 osservato nel pcap reale, altrimenti
          // il login successivo può andare in timeout senza risposta.
          this._awaitingPong = true;
          this.socket.write(buildEmptyFrame(TYPE_PING, RAW_ZEROES));
        }
      );
      this.socket.on('error', (err) => finish(reject, err));
      this.socket.on('data', (data) => this._onData(data));
      this.socket.on('close', () => {
        this.connected = false;
      });
    });
  }

  _onData(chunk) {
    this.recvBuffer = Buffer.concat([this.recvBuffer, Buffer.from(chunk)]);
    while (this.recvBuffer.length >= HEADER_LEN) {
      const length = this.recvBuffer.readUInt32LE(0);
      const type = this.recvBuffer.readUInt32LE(4);
      const totalLen = HEADER_LEN + length;
      if (this.recvBuffer.length < totalLen) break; // messaggio incompleto, aspetta altri dati

      const payload = this.recvBuffer.slice(HEADER_LEN, totalLen);
      this.recvBuffer = this.recvBuffer.slice(totalLen);

      this._dispatch(type, payload);
    }
  }

  _dispatch(type, payload) {
    // Pong dell'handshake iniziale: sblocca connect().
    if (type === TYPE_PING && this._awaitingPong) {
      this._awaitingPong = false;
      this.connected = true;
      const resolveConnect = this._pendingConnectResolve;
      this._pendingConnectResolve = null;
      if (resolveConnect) resolveConnect();
      return;
    }

    if (type === TYPE_IMAGE) {
      this._handleImageChunk(payload);
      return;
    }

    if (type === TYPE_VIDEO) {
      // Live view offuscata, formato non decifrato: ignorata di proposito.
      return;
    }

    // JSON di comando/risposta (type 0) e altri frame di controllo (100/114/
    // 115 fuori dalla fase di handshake) vanno ai subscriber generici.
    this.messageHandlers.forEach((h) => h(type, payload));
  }

  // Ricostruisce i JPEG dal flusso continuo di chunk type=1. La penna manda
  // frame completi uno dopo l'altro appena la live view è attiva: qui si
  // cerca sempre prima il marker di inizio JPEG (SOI, FF D8 FF) per evitare
  // di agganciarsi a metà di un frame già in corso, poi si accumula fino al
  // marker di fine (EOI, FF D9).
  _handleImageChunk(payload) {
    let buf = payload;

    if (!this._assembling) {
      const soiIdx = buf.indexOf(JPEG_SOI);
      if (soiIdx === -1) return; // chunk di coda di un frame precedente: scartato
      buf = buf.slice(soiIdx);
      this._assembling = true;
      this._imgAssembleBuf = Buffer.alloc(0);
      this._frameSeq += 1;
    }

    this._imgAssembleBuf = Buffer.concat([this._imgAssembleBuf, buf]);

    const eoiIdx = this._imgAssembleBuf.indexOf(JPEG_EOI);
    if (eoiIdx !== -1) {
      const completeFrame = this._imgAssembleBuf.slice(0, eoiIdx + 2);
      const finishedSeq = this._frameSeq;
      const leftover = this._imgAssembleBuf.slice(eoiIdx + 2);
      this._assembling = false;
      this._imgAssembleBuf = Buffer.alloc(0);
      this.frameHandlers.forEach((h) => h(completeFrame, finishedSeq));
      // Non osservato nel pcap analizzato (SOI e EOI sono sempre finiti in
      // chunk separati), ma se in un dato firmware capitasse che i byte
      // finali di un JPEG e l'inizio del successivo arrivino nello stesso
      // chunk fisico, questi byte residui vanno rielaborati subito, non
      // scartati, altrimenti si perde l'inizio del frame successivo.
      if (leftover.length > 0) {
        this._handleImageChunk(leftover);
      }
    }
  }

  // Sottoscrizione generica ai frame JPEG completi (usata sia da
  // requestSnapshot che da startLivePreview).
  onFrame(handler) {
    this.frameHandlers.push(handler);
    return () => {
      this.frameHandlers = this.frameHandlers.filter((h) => h !== handler);
    };
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
      if (!this.devId) return reject(new Error('devId non determinato: esegui discoverDevice() oppure passa lo SSID (es. Nax_XXXX) al client'));

      const timeout = setTimeout(() => {
        off();
        reject(new Error('Timeout login: nessuna risposta dalla penna'));
      }, timeoutMs);

      const off = this.onMessage((type, payload) => {
        if (type !== TYPE_JSON) return;
        let msg;
        try {
          msg = JSON.parse(payload.toString('utf8'));
        } catch (e) {
          return;
        }
        if (msg.code === 501) {
          clearTimeout(timeout);
          off();
          if (msg.status === 200) {
            this._startKeepalive();
            resolve(msg);
          } else {
            reject(new Error(`Login rifiutato dalla penna (status ${msg.status})`));
          }
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

  // Query dello stato/info device (batteria, wifiName, versione firmware...).
  // Best-effort: osservata nell'app originale subito dopo il login, ma non è
  // strettamente necessaria al resto del flusso, quindi non rigetta mai, si
  // limita a risolvere con null se non arriva risposta in tempo.
  queryStatus(timeoutMs = 4000) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        off();
        resolve(null);
      }, timeoutMs);

      const off = this.onMessage((type, payload) => {
        if (type !== TYPE_JSON) return;
        let msg;
        try {
          msg = JSON.parse(payload.toString('utf8'));
        } catch (e) {
          return;
        }
        if (msg.code === 502 && msg.content && msg.content.code === 4) {
          clearTimeout(timeout);
          off();
          resolve(msg.content);
        }
      });

      try {
        this._sendJson({
          code: 502,
          content: { unixTimer: Math.floor(Date.now() / 1000), devTarget: this.devId, code: 4 },
        });
      } catch (e) {
        clearTimeout(timeout);
        off();
        resolve(null);
      }
    });
  }

  // Avvia la live view lato penna: da qui in poi la penna trasmette in
  // autonomia un flusso continuo di frame JPEG (type=1) intrecciati a video
  // live non decifrato (type=4), senza bisogno di altri comandi espliciti.
  startLiveView() {
    this._sendJson({ code: 502, content: { devTarget: this.devId, code: 3 } });
  }

  // Richiede uno "snapshot": in realtà si aggancia al flusso di frame JPEG
  // già in corso (avviato da startLiveView). Per evitare di restituire un
  // frame già a metà ricezione nel momento in cui il comando viene inviato,
  // si aspetta il primo frame la cui ricostruzione INIZIA dopo l'invio del
  // comando 218 (tramite il contatore _frameSeq).
  requestSnapshot(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const seqAtRequest = this._frameSeq;

      const timeout = setTimeout(() => {
        off();
        offAck();
        reject(new Error('Timeout: nessuno snapshot ricevuto dalla penna dopo il comando'));
      }, timeoutMs);

      const off = this.onFrame((frameBuf, seq) => {
        if (seq > seqAtRequest) {
          clearTimeout(timeout);
          off();
          offAck();
          resolve(frameBuf);
        }
        // seq === seqAtRequest: frame già in corso prima del comando, va
        // scartato e si continua ad aspettare il successivo.
      });

      // L'ack del comando 218 arriva come JSON separato, spesso con ritardo
      // (anche qualche secondo) e non è legato a un frame specifico: viene
      // solo ascoltato per pulizia interna, non blocca la risoluzione.
      const offAck = this.onMessage((type, payload) => {
        if (type !== TYPE_JSON) return;
        try {
          const msg = JSON.parse(payload.toString('utf8'));
          if (msg.code === 502 && msg.content && msg.content.code === 218) {
            offAck();
          }
        } catch (e) {
          // ignorato
        }
      });

      this._sendJson({ code: 502, content: { devTarget: this.devId, code: 218 } });
    });
  }

  // "Live preview": si aggancia semplicemente al flusso continuo di frame
  // già generato dalla penna dopo startLiveView(), con un throttle lato
  // client per non inondare la UI/bridge RN con troppi aggiornamenti al
  // secondo (i frame reali possono arrivare anche più volte al secondo).
  startLivePreview(onFrame, { minIntervalMs = 800 } = {}) {
    this.stopLivePreview();
    let lastEmit = 0;
    this._livePreviewOff = this.onFrame((frameBuf) => {
      const now = Date.now();
      if (now - lastEmit >= minIntervalMs) {
        lastEmit = now;
        onFrame(frameBuf);
      }
    });
  }

  stopLivePreview() {
    if (this._livePreviewOff) {
      this._livePreviewOff();
      this._livePreviewOff = null;
    }
  }

  // Keepalive periodico (osservato ogni ~9s nel pcap reale, inviato dal
  // telefono): fire-and-forget, nessuna risposta è attesa dalla penna.
  _startKeepalive() {
    this._stopKeepalive();
    this._keepaliveTimer = setInterval(() => {
      if (this.connected && this.socket) {
        try {
          this.socket.write(buildEmptyFrame(TYPE_KEEPALIVE, ASCII_ZEROES));
        } catch (e) {
          // se il socket si è chiuso nel mezzo, non è un errore fatale
        }
      }
    }, 9000);
  }

  _stopKeepalive() {
    if (this._keepaliveTimer) {
      clearInterval(this._keepaliveTimer);
      this._keepaliveTimer = null;
    }
  }

  close() {
    this._stopKeepalive();
    this.stopLivePreview();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.messageHandlers = [];
    this.frameHandlers = [];
    this._assembling = false;
    this._imgAssembleBuf = Buffer.alloc(0);
  }
}

export default NaxclowClient;
