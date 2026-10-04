// Timer che funzionano anche a schermo spento.
//
// In background React Native sospende i timer JS (setTimeout/setInterval) ma
// continua a consegnare gli eventi nativi. Il servizio in primo piano emette
// un battito nativo ogni secondo (vedi modules/shelly-ble); qui ogni battito
// "pompa" i timer scaduti. In primo piano funziona come un normale
// setTimeout: scatta il primo tra il timer vero e il battito, una volta sola.
const jobs = new Map();
let nextId = 1;

function fire(id) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.delete(id);
  clearTimeout(job.handle);
  job.fn();
}

export function bgSetTimeout(fn, ms = 0) {
  const id = nextId++;
  const job = { fn, at: Date.now() + ms, handle: null };
  job.handle = setTimeout(() => fire(id), ms);
  jobs.set(id, job);
  return id;
}

export function bgClearTimeout(id) {
  const job = jobs.get(id);
  if (!job) return;
  clearTimeout(job.handle);
  jobs.delete(id);
}

export const bgSleep = (ms) => new Promise((resolve) => bgSetTimeout(resolve, ms));

// Chiamata a ogni battito nativo.
export function pumpTimers() {
  const now = Date.now();
  for (const [id, job] of [...jobs]) {
    if (now >= job.at) {
      try {
        fire(id);
      } catch (e) {
        console.warn('Errore in un timer', e);
      }
    }
  }
}
