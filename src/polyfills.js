// Polyfill necessario perché React Native NON fornisce l'oggetto globale
// `Buffer` di Node.js, mentre naxclowClient.js lo usa direttamente per
// costruire/parsare i frame binari del protocollo della penna
// (Buffer.alloc, Buffer.from, Buffer.concat, .writeUInt32LE, ecc.).
// Senza questo import il runtime va in crash con errori tipo
// "property 'buffer' doesn't exist" alla prima chiamata a NaxclowClient.
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}
