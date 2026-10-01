// Config plugin Expo per react-native-keyevent.
//
// PERCHÉ ESISTE: react-native-keyevent riceve i tasti hardware (es. quelli
// di un telecomando otturatore Bluetooth, che emula "volume su/giù") SOLO se
// la MainActivity li inoltra esplicitamente al modulo. Con il workflow Expo
// la cartella android/ viene rigenerata da `expo prebuild`, quindi una
// modifica manuale a MainActivity.kt andrebbe persa alla prima rigenerazione
// (senza questo plugin il listener JS non riceverebbe mai nessun evento e il
// telecomando sembrerebbe "non fare nulla", senza alcun errore visibile).
//
// Il plugin è idempotente: se il codice è già presente non lo duplica.
const { withMainActivity } = require('expo/config-plugins');

const IMPORT_KEYEVENT = 'import android.view.KeyEvent';
const IMPORT_MODULE = 'import com.github.kevinejohn.keyevent.KeyEventModule';

// getInstance() è null finché il modulo nativo non è stato creato dal
// bridge React (es. un tasto premuto durante l'avvio, prima del caricamento
// del JS): la safe-call (?.) evita un crash in quella finestra.
const METHODS = `
  // react-native-keyevent: inoltra i tasti hardware al modulo JS.
  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    KeyEventModule.getInstance()?.onKeyDownEvent(keyCode, event)
    return super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    KeyEventModule.getInstance()?.onKeyUpEvent(keyCode, event)
    return super.onKeyUp(keyCode, event)
  }
`;

module.exports = function withKeyEvent(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('withKeyEvent: atteso MainActivity in Kotlin (.kt), trovato ' + cfg.modResults.language);
    }

    let src = cfg.modResults.contents;
    if (src.includes('KeyEventModule')) return cfg; // già applicato

    const importsToAdd = [IMPORT_KEYEVENT, IMPORT_MODULE].filter((i) => !src.includes(i));
    if (importsToAdd.length > 0) {
      src = src.replace(/^(package .+\n)/m, `$1\n${importsToAdd.join('\n')}\n`);
    }

    // Inserisce i metodi subito prima della graffa di chiusura della classe
    // (l'ultima del file).
    const lastBrace = src.lastIndexOf('}');
    if (lastBrace === -1) throw new Error('withKeyEvent: MainActivity.kt non valida (nessuna graffa di chiusura)');
    src = src.slice(0, lastBrace) + METHODS + src.slice(lastBrace);

    cfg.modResults.contents = src;
    return cfg;
  });
};
