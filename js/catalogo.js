// Catalogo: pali, legature e cordini disponibili, con le quantità in magazzino.
// Si salva nel browser e, con il login admin, su Firebase (catalogo/principale)
// così è lo stesso su tutti i PC.
(function () {
  'use strict';
  const CHIAVE = 'sognabandiera-catalogo';

  const PREDEFINITO = {
    versione: 1,
    pali: [
      { id: 'p2000-80', nome: 'Palo 2 m Ø 80', lunghezzaMm: 2000, diametroMm: 80, quantita: 20 },
      { id: 'p3000-100', nome: 'Palo 3 m Ø 100', lunghezzaMm: 3000, diametroMm: 100, quantita: 20 },
      { id: 'p4000-110', nome: 'Palo 4 m Ø 110', lunghezzaMm: 4000, diametroMm: 110, quantita: 15 },
      { id: 'p5000-120', nome: 'Palo 5 m Ø 120', lunghezzaMm: 5000, diametroMm: 120, quantita: 12 },
      { id: 'p6000-130', nome: 'Palo 6 m Ø 130', lunghezzaMm: 6000, diametroMm: 130, quantita: 8 },
      { id: 'p6500-150', nome: 'Antenna 6,5 m Ø 150', lunghezzaMm: 6500, diametroMm: 150, quantita: 4 },
    ],
    legature: [
      { id: 'quadra', nome: 'Quadra', cordinoMm: 6, base: 0.8, k: 13,
        istruzioni: 'Unisce due pali che si incrociano ad angolo retto. Parti con un nodo parlato sotto il traverso, fai 4 giri passando dietro e davanti ai pali, poi 2–3 giri di strozzatura tra i pali e chiudi con un nodo parlato.' },
      { id: 'diagonale', nome: 'Diagonale', cordinoMm: 6, base: 0.8, k: 13,
        istruzioni: 'Per pali che tendono ad aprirsi a X. Parti con un nodo di bozzello intorno all\'incrocio, 3–4 giri su una diagonale e 3–4 sull\'altra, strozzatura tra i pali e nodo parlato finale.' },
      { id: 'parallela', nome: 'Parallela', cordinoMm: 6, base: 0.8, k: 9,
        istruzioni: 'Per affiancare due pali e allungarli. Nodo parlato su un palo, 8–10 giri stretti intorno a entrambi, 2 giri di strozzatura tra i pali e nodo parlato sull\'altro palo. Ripeti ogni 70–80 cm.' },
      { id: 'tripode', nome: 'Tripode', cordinoMm: 6, base: 1.2, k: 12,
        istruzioni: 'Tre pali affiancati a terra: nodo parlato sul palo esterno, 6–8 giri a otto tra i tre pali, strozzature negli spazi e nodo finale. Poi apri le gambe.' },
    ],
    cordini: [
      { id: 'c6-3', diametroMm: 6, lunghezzaM: 3, quantita: 20 },
      { id: 'c6-4', diametroMm: 6, lunghezzaM: 4, quantita: 30 },
      { id: 'c6-5', diametroMm: 6, lunghezzaM: 5, quantita: 30 },
      { id: 'c6-6', diametroMm: 6, lunghezzaM: 6, quantita: 15 },
      { id: 'c10-8', diametroMm: 10, lunghezzaM: 8, quantita: 10 },
    ],
  };

  let dati = null;
  const ascoltatori = [];

  function carica() {
    try {
      const s = localStorage.getItem(CHIAVE);
      if (s) { dati = JSON.parse(s); return; }
    } catch (e) { /* storage non disponibile: si usa il predefinito */ }
    dati = JSON.parse(JSON.stringify(PREDEFINITO));
  }

  function imposta(nuovo, { locale = true } = {}) {
    dati = nuovo;
    if (locale) {
      try { localStorage.setItem(CHIAVE, JSON.stringify(dati)); } catch (e) { /* ignora */ }
    }
    ascoltatori.forEach((f) => f());
  }

  const idNuovo = (pref) => pref + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const tipoLegatura = (nome) => String(nome || '').trim().toLowerCase();

  /** Voce del catalogo legature per un tipo (es. "quadra"). */
  function legatura(tipo) {
    const t = tipoLegatura(tipo);
    return dati.legature.find((l) => tipoLegatura(l.nome) === t || l.id === t) || null;
  }

  /** Metri di cordino per una legatura secondo la regola del catalogo, ai 50 cm superiori. */
  function cordinoPer(tipo, d1, d2) {
    const l = legatura(tipo);
    if (!l) return Calcoli.stimaCordino(tipo, d1, d2);
    return Calcoli.suPer((Number(l.base) || 0) + (Number(l.k) || 0) * (d1 + d2), 0.5);
  }

  /**
   * Controlla se il magazzino basta per il modello.
   * Ogni legatura usa il cordino più corto (stesso diametro) che basta.
   * Restituisce righe {voce, servono, disponibili, manca}.
   */
  function verifica(modello) {
    const righe = [];
    const pali = (modello.pezzi || []).filter((p) => p.forma === 'palo' && p.distinta !== false);
    dati.pali.forEach((c) => {
      const n = pali.filter((p) => p.cat === c.id).length;
      if (n) righe.push({ tipo: 'palo', voce: c.nome, servono: n, disponibili: c.quantita, manca: Math.max(0, n - c.quantita) });
    });
    const fuori = pali.filter((p) => !p.cat || !dati.pali.some((c) => c.id === p.cat)).length;
    if (fuori) righe.push({ tipo: 'palo', voce: 'Pali fuori catalogo', servono: fuori, disponibili: null, manca: 0 });

    const uso = new Map(); // id cordino → quantità
    let senza = 0;
    (modello.legature || []).forEach((l) => {
      const mm = Number(l.cordinoMm || modello.cordinoMm || 6);
      const serve = typeof l.cordinoM === 'number' ? l.cordinoM : Calcoli.stimaCordino(l.tipo, l.d || 0.12, l.d2 || l.d || 0.12);
      const adatti = dati.cordini.filter((c) => Number(c.diametroMm) === mm && Number(c.lunghezzaM) >= serve - 1e-9)
        .sort((a, b) => a.lunghezzaM - b.lunghezzaM);
      if (!adatti.length) { senza++; return; }
      uso.set(adatti[0].id, (uso.get(adatti[0].id) || 0) + 1);
    });
    dati.cordini.forEach((c) => {
      const n = uso.get(c.id) || 0;
      if (n) righe.push({ tipo: 'cordino', voce: `Cordino Ø ${c.diametroMm} mm da ${Calcoli.num1(c.lunghezzaM)} m`, servono: n, disponibili: c.quantita, manca: Math.max(0, n - c.quantita) });
    });
    if (senza) righe.push({ tipo: 'cordino', voce: 'Legature senza un cordino abbastanza lungo', servono: senza, disponibili: 0, manca: senza });
    return righe;
  }

  /** Copia ridotta delle legature, salvata nel modello: all'app servono nome e istruzioni. */
  function perModello() {
    const o = {};
    dati.legature.forEach((l) => { o[tipoLegatura(l.nome)] = { nome: l.nome, cordinoMm: l.cordinoMm, istruzioni: l.istruzioni || '' }; });
    return o;
  }

  carica();
  window.Catalogo = {
    PREDEFINITO,
    get dati() { return dati; },
    imposta, idNuovo, legatura, cordinoPer, verifica, perModello, tipoLegatura,
    palo: (id) => dati.pali.find((p) => p.id === id) || null,
    quandoCambia: (f) => ascoltatori.push(f),
  };
})();
