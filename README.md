# Sognabandiera Studio

Programma per PC per disegnare gli alzabandiera: pali dal catalogo in millimetri,
inclinazioni, legature, tiranti, assi e passi di montaggio. Il modello si salva
come file `.json` oppure si pubblica direttamente nell'app Sognabandiera.

Si apre da Chrome o Edge e si installa come programma (icona ⊕ nella barra
dell'indirizzo → **Installa**). Dopo il primo avvio funziona anche senza internet;
serve la rete solo per accedere e pubblicare nell'app.

## Comandi

| Tasto | Azione |
|---|---|
| P | Nuovo palo dal catalogo |
| L | Lega i due pali selezionati (o uno, poi clic sull'altro) |
| T | Tirante dalla punta del palo selezionato |
| A | Nuova asse |
| G | Sposta con le frecce nel 3D |
| R | Ruota con gli anelli nel 3D |
| K | Aggancia la base del pezzo a un punto (estremità di un palo o terreno) |
| Ctrl+D | Duplica |
| Canc | Elimina |
| Ctrl+Z / Ctrl+Y | Annulla / Ripeti |
| Ctrl+S | Salva il file |
| F, 1, 3, 7 | Inquadra tutto, fronte, lato, alto |
| Ctrl+clic | Selezione multipla |

Vista 3D: tasto sinistro ruota, destro sposta, rotella zoom.

## Convenzioni

- Misure in **mm** nell'interfaccia, metri nel file.
- **Inclinazione**: 0° palo dritto, 90° sdraiato.
- **Direzione** (in pianta): 0° verso destra (asse X rosso), 90° verso chi guarda (asse Z blu).
- La **base** di un palo è il punto da cui si misurano inclinazione e direzione.

## Legature

Una legatura unisce due pali nel punto in cui si incrociano (o, per i pali
affiancati, a una distanza scelta dalla base). Se i pali non si toccano la
legatura diventa **rossa**; il pulsante **Accosta** sposta il secondo palo
finché tocca il primo. Il cordino si calcola con la regola del catalogo:

    cordino = base + coefficiente × (Ø palo 1 + Ø palo 2)   → arrotondato ai 50 cm

## Catalogo

File → Catalogo: pali (nome, lunghezza, diametro, quantità in magazzino),
legature (tipo, cordino, regola, istruzioni del nodo) e cordini (diametro,
lunghezza, quantità). Con l'accesso admin il catalogo è salvato su Firebase ed
è lo stesso su tutti i PC. La scheda **Distinta** segnala se il magazzino non basta.

## Sviluppo

- `js/calcoli.js` è la copia di `lib/models/modello3d.dart`: se cambi uno, cambia l'altro.
  Prova: `node studio/test/calcoli.test.js`.
- Prova in locale: `python3 -m http.server` nella cartella `studio`, poi
  `http://localhost:8000/?esempio=esempi/tre-cavalletti.json`.
- Per pubblicare una nuova versione cambia `VERSIONE` in `sw.js`.
