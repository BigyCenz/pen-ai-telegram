# Studio di design

## Problemi della versione precedente
- Nessuna icona vera (glifi unicode), tab bar piatta, gerarchia visiva debole: titoli, etichette e valori avevano quasi lo stesso peso.
- Lo stato della penna era sparso in due card di testo; la batteria era una riga come le altre.
- Impostazioni: un'unica pagina lunga, con chip di testo lunghi e due telecomandi di cui uno inutile a schermo spento.

## Principi
1. **Stato prima di tutto.** La cosa che l'utente vuole sapere, ovunque si trovi, è "la penna è connessa?". Per questo c'è una scheda di stato in cima alla schermata Penna e un pallino di stato sull'icona della tab.
2. **Un colore, un significato.** Verde = ok, ambra = serve attenzione / in corso, rosso = errore, blu = azione principale. Un accento per area (viola AI, azzurro Telegram, blu Bluetooth, turchese WiFi) usato solo nelle icone.
3. **Raggruppare per compito, non per tecnologia.** Penna, Telecomando, AI, Telegram: quattro sezioni comprimibili con riassunto e spunta di completezza in testata.
4. **Mostrare solo ciò che serve ora.** Prima della connessione i due passi numerati; dopo, solo i dati del dispositivo. Il pulsante Salva compare solo con modifiche non salvate.
5. **Icona + testo.** Le icone aiutano a scandire la pagina, ma ogni azione resta con etichetta.

## Sistema
- **Superfici** a 4 livelli (`bg` → `surface` → `surfaceAlt` → `surfaceHigh`), bordi sottili al posto di ombre pesanti.
- **Raggi** 10 / 14 / 20 / 28 / pillola; **griglia** a 8 pt.
- **Tipografia**: titolo 24/800, sezione 16/700, corpo 15, etichette 12 maiuscole spaziate, monospace per log e ID.
- **Icone**: Ionicons (`@expo/vector-icons`), contorno per stato inattivo e pieno per attivo.
- **Componenti**: `Button` (6 varianti), `IconBadge`, `StatTile`, `BatteryIndicator` (verde ≥ 60%, ambra 30–59%, rosso < 30%), `Segmented`, `StatusBadge`, `ConfigField` (con occhio per chiavi e token), `ScreenHeader`.

## Schermate
- **Penna**: scheda di stato con gradiente (verde connessa, rosso errore) + pillole batteria / WiFi / telecomando; sotto i passi 1-2 oppure i riquadri del dispositivo.
- **Scatta**: pulsante di scatto grande con anello, anteprima con orario sopra, risposta AI in riquadro viola.
- **Log**: icona per tipo di riga, errori evidenziati, filtri Tutti / Errori / Telecomando.
- **Impostazioni**: sezioni comprimibili, selettori a segmenti per provider AI e azione di ogni pressione.
