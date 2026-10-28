// Documento aperto nello Studio: il modello Sognabandiera con tutte le
// operazioni di modifica, annulla/ripeti e il ricalcolo delle legature.
(function () {
  'use strict';
  const G = window.Geo;

  const LIVELLI_BASE = [
    ['struttura', 'Struttura', '#c49a5b'],
    ['piattaforma', 'Piattaforma', '#dcc68c'],
    ['antenne', 'Antenne', '#b4894a'],
    ['scala', 'Scala', '#b8413a'],
    ['bandiere', 'Bandiere e drizze', '#2f64b8'],
    ['legature', 'Legature', '#eeeeea'],
    ['tiranti', 'Tiranti', '#9aa6b2'],
    ['persona', 'Persona 1,75 m', '#3563a8'],
  ];

  const slug = (s) => String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'pezzo';

  function modelloVuoto() {
    return {
      formato: 'sognabandiera-modello',
      versione: 1,
      titolo: 'Nuovo alzabandiera',
      descrizione: '',
      cordinoMm: 6,
      livelli: LIVELLI_BASE.map(([id, nome, colore]) => ({ id, nome, colore })),
      info: { persona: { titolo: 'Persona di riferimento', descrizione: 'Alta 1,75 m, per avere la scala delle dimensioni.' } },
      pezzi: [{ id: 'u1', forma: 'persona', tipo: 'persona', livello: 'persona', p: [-2.5, 0, 1.2], altezza: 1.75 }],
      legature: [],
      quote: [],
      viste: [],
      passi: [],
    };
  }

  class Documento {
    constructor() {
      this.dati = modelloVuoto();
      this.annullabili = [];
      this.ripetibili = [];
      this.modificato = false;
      this.distanze = new Map(); // id legatura → distanza tra i pali (m)
      this.passoNuovi = 0;       // passo assegnato ai pezzi creati da ora
      this.ascoltatori = [];
      this._contatore = 1;
    }

    // ---------------------------------------------------------- stato
    quandoCambia(f) { this.ascoltatori.push(f); }
    _notifica(motivo) { this.ascoltatori.forEach((f) => f(motivo)); }

    nuovo() {
      this.dati = modelloVuoto();
      this._dopoCaricamento();
    }

    carica(dati) {
      if (!dati || dati.formato !== 'sognabandiera-modello') throw new Error('Il file non è un modello Sognabandiera.');
      this.dati = JSON.parse(JSON.stringify(dati));
      const d = this.dati;
      ['pezzi', 'legature', 'quote', 'viste', 'passi', 'livelli'].forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });
      if (!d.info) d.info = {};
      if (!d.livelli.length) d.livelli = LIVELLI_BASE.map(([id, nome, colore]) => ({ id, nome, colore }));
      // le legature caricate restano dove erano: si fissa il punto lungo il primo palo
      d.legature.forEach((l) => {
        if (!l.id) l.id = this.nuovoId('l');
        if (l.ancora == null && Array.isArray(l.p) && l.pali && l.pali.length === 2) {
          const p1 = this.pezzo(l.pali[0]);
          if (p1) {
            const dir = G.normalizza(G.sottrai(p1.b, p1.a));
            l.ancora = Math.round(G.scalare(G.sottrai(l.p, p1.a), dir) * 1000) / 1000;
          }
        }
      });
      this._dopoCaricamento();
    }

    _dopoCaricamento() {
      this.annullabili = [];
      this.ripetibili = [];
      this.modificato = false;
      this.passoNuovi = 0;
      let max = 0;
      [...this.dati.pezzi, ...this.dati.legature].forEach((o) => {
        const m = /(\d+)$/.exec(o.id || '');
        if (m) max = Math.max(max, +m[1]);
      });
      this._contatore = max + 1;
      this.ricalcolaLegature();
      this._notifica('carica');
    }

    /** Copia pulita da salvare o pubblicare. */
    esporta() {
      const d = JSON.parse(JSON.stringify(this.dati));
      d.catalogoLegature = Catalogo.perModello();
      return d;
    }

    nuovoId(pref) { return pref + (this._contatore++); }
    pezzo(id) { return this.dati.pezzi.find((p) => p.id === id) || null; }
    legatura(id) { return this.dati.legature.find((l) => l.id === id) || null; }
    oggetto(id) { return this.pezzo(id) || this.legatura(id); }

    /** Esegue una modifica annullabile. */
    modifica(etichetta, fn) {
      const prima = JSON.stringify(this.dati);
      const risultato = fn();
      this.ricalcolaLegature();
      this.annullabili.push({ etichetta, dati: prima });
      if (this.annullabili.length > 150) this.annullabili.shift();
      this.ripetibili = [];
      this.modificato = true;
      this._notifica('modifica');
      return risultato;
    }

    annulla() {
      const u = this.annullabili.pop();
      if (!u) return null;
      this.ripetibili.push({ etichetta: u.etichetta, dati: JSON.stringify(this.dati) });
      this.dati = JSON.parse(u.dati);
      this.ricalcolaLegature();
      this.modificato = true;
      this._notifica('annulla');
      return u.etichetta;
    }

    ripeti() {
      const r = this.ripetibili.pop();
      if (!r) return null;
      this.annullabili.push({ etichetta: r.etichetta, dati: JSON.stringify(this.dati) });
      this.dati = JSON.parse(r.dati);
      this.ricalcolaLegature();
      this.modificato = true;
      this._notifica('ripeti');
      return r.etichetta;
    }

    // ------------------------------------------------------------ pali
    /** Geometria di un palo in termini comodi per l'interfaccia. */
    static assetto(p) {
      const v = G.sottrai(p.b, p.a);
      const { inclinazione, direzione } = G.angoliDaDir(v);
      return { a: p.a.slice(), lunghezza: G.lunghezza(v), inclinazione, direzione };
    }

    /** Ricostruisce l'estremo b da base, lunghezza e angoli. */
    static applicaAssetto(p, { a, lunghezza, inclinazione, direzione }) {
      const att = Documento.assetto(p);
      const base = a || att.a;
      const L = lunghezza != null ? lunghezza : att.lunghezza;
      const dir = G.dirDaAngoli(inclinazione != null ? inclinazione : att.inclinazione, direzione != null ? direzione : att.direzione);
      p.a = G.arr3(base);
      p.b = G.arr3(G.somma(base, G.per(dir, L)));
    }

    impostaRuolo(p, nome) {
      const tipo = slug(nome);
      p.tipo = tipo;
      if (!this.dati.info[tipo]) this.dati.info[tipo] = { titolo: String(nome).trim(), descrizione: '' };
    }

    nomeRuolo(p) {
      const i = this.dati.info[p.tipo];
      return (i && i.titolo) || (p.tipo || '').replace(/_/g, ' ') || 'Palo';
    }

    ruoli() {
      const s = new Set();
      this.dati.pezzi.filter((p) => p.forma === 'palo').forEach((p) => s.add(this.nomeRuolo(p)));
      return [...s].sort();
    }

    aggiungiPalo(voceCatalogo, { a = null, inclinazione = 0, direzione = 0, ruolo = null } = {}) {
      return this.modifica('Nuovo palo', () => {
        const base = a || this._postoLibero();
        const p = {
          id: this.nuovoId('p'), forma: 'palo', tipo: 'palo', livello: 'struttura',
          cat: voceCatalogo.id, d: voceCatalogo.diametroMm / 1000, a: G.arr3(base), b: base.slice(),
        };
        if (this.passoNuovi) p.passo = this.passoNuovi;
        this.impostaRuolo(p, ruolo || voceCatalogo.nome);
        Documento.applicaAssetto(p, { a: base, lunghezza: voceCatalogo.lunghezzaMm / 1000, inclinazione, direzione });
        this.dati.pezzi.push(p);
        return p;
      });
    }

    /** Punto a terra libero vicino all'origine, per non sovrapporre i pali nuovi. */
    _postoLibero() {
      const occupati = this.dati.pezzi.filter((p) => p.forma === 'palo').map((p) => p.a);
      for (let i = 0; i < 60; i++) {
        const x = (i % 10) * 0.5, z = Math.floor(i / 10) * 0.5;
        if (!occupati.some((q) => Math.hypot(q[0] - x, q[2] - z) < 0.3 && q[1] < 0.3)) return [x, 0, z];
      }
      return [0, 0, 0];
    }

    // -------------------------------------------------------- legature
    lega(id1, id2, tipo) {
      const p1 = this.pezzo(id1), p2 = this.pezzo(id2);
      if (!p1 || !p2 || p1.forma !== 'palo' || p2.forma !== 'palo') throw new Error('Seleziona due pali.');
      return this.modifica('Nuova legatura', () => {
        const v = G.puntiPiuVicini(p1.a, p1.b, p2.a, p2.b);
        const l = {
          id: this.nuovoId('l'), tipo: Catalogo.tipoLegatura(tipo), dove: `${this.nomeRuolo(p1)}–${this.nomeRuolo(p2)}`,
          pali: [id1, id2], lunghezza: 0.18,
        };
        if (v.paralleli) {
          l.ancora = Math.round(v.t1 * G.distanza(p1.a, p1.b) * 1000) / 1000;
          l.lunghezza = 0.15;
        }
        if (this.passoNuovi) l.passo = this.passoNuovi;
        this.dati.legature.push(l);
        // se i pali si compenetrano e il secondo non ha altre legature, lo appoggia al primo
        const altre = this.dati.legature.some((x) => x !== l && (x.pali || []).includes(id2));
        const r = (p1.d + p2.d) / 2;
        l._accostato = false;
        if (!altre && v.distanza < r * 0.9) { this._accosta(l); l._accostato = true; }
        return l;
      });
    }

    /** Sposta il secondo palo della legatura finché tocca il primo in superficie. */
    _accosta(l) {
      const p1 = this.pezzo(l.pali[0]), p2 = this.pezzo(l.pali[1]);
      if (!p1 || !p2) return false;
      let q1, q2;
      if (l.ancora != null) {
        q1 = G.lungo(p1.a, p1.b, Math.max(0, Math.min(1, l.ancora / G.distanza(p1.a, p1.b))));
        q2 = G.piuVicinoSuSegmento(q1, p2.a, p2.b).p;
      } else {
        const v = G.puntiPiuVicini(p1.a, p1.b, p2.a, p2.b); q1 = v.p1; q2 = v.p2;
      }
      const d1 = G.normalizza(G.sottrai(p1.b, p1.a)), d2 = G.normalizza(G.sottrai(p2.b, p2.a));
      let n = G.sottrai(q2, q1);
      // direzione di accostamento: quella attuale tolta la componente lungo il primo palo
      n = G.sottrai(n, G.per(d1, G.scalare(n, d1)));
      if (G.lunghezza(n) < 1e-4) {
        n = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
        if (G.lunghezza(n) < 1e-4) n = Math.abs(d1[1]) < 0.9 ? [-d1[2], 0, d1[0]] : [1, 0, 0];
        if (n[2] < 0 || (n[2] === 0 && n[0] < 0)) n = G.per(n, -1); // verso chi guarda
      }
      n = G.normalizza(n);
      const voluta = (p1.d + p2.d) / 2;
      const attuale = G.scalare(G.sottrai(q2, q1), n);
      const sposta = G.per(n, voluta - attuale);
      p2.a = G.arr3(G.somma(p2.a, sposta));
      p2.b = G.arr3(G.somma(p2.b, sposta));
      return true;
    }

    accosta(idLegatura) {
      const l = this.legatura(idLegatura);
      if (!l || (l.pali || []).length !== 2) return;
      this.modifica('Accosta i pali', () => this._accosta(l));
    }

    /** Ricolloca tutte le legature sui pali (dopo ogni modifica) e ricalcola il cordino. */
    ricalcolaLegature() {
      this.distanze.clear();
      this.dati.legature.forEach((l) => {
        if (!Array.isArray(l.pali) || l.pali.length !== 2) return;
        const p1 = this.pezzo(l.pali[0]), p2 = this.pezzo(l.pali[1]);
        if (!p1 || !p2) return;
        let q1, q2;
        if (l.ancora != null) {
          const L1 = G.distanza(p1.a, p1.b);
          q1 = G.lungo(p1.a, p1.b, Math.max(0, Math.min(1, l.ancora / L1)));
          q2 = G.piuVicinoSuSegmento(q1, p2.a, p2.b).p;
        } else {
          const v = G.puntiPiuVicini(p1.a, p1.b, p2.a, p2.b);
          q1 = v.p1; q2 = v.p2;
        }
        const dist = G.distanza(q1, q2);
        this.distanze.set(l.id, dist);
        const asse1 = G.normalizza(G.sottrai(p1.b, p1.a)), asse2 = G.normalizza(G.sottrai(p2.b, p2.a));
        if (l.ellisse) {
          l.p = G.arr3(G.lungo(q1, q2, 0.5));
          delete l.p2; delete l.asse2;
        } else {
          l.p = G.arr3(q1); l.p2 = G.arr3(q2); l.asse2 = G.arr3(asse2);
        }
        l.asse = G.arr3(asse1);
        l.d = p1.d; l.d2 = p2.d;
        const voce = Catalogo.legatura(l.tipo);
        l.cordinoMm = voce ? Number(voce.cordinoMm) : (this.dati.cordinoMm || 6);
        l.cordinoM = Catalogo.cordinoPer(l.tipo, p1.d, p2.d);
      });
    }

    /** True se i due pali di una legatura non si toccano (oltre 3 cm di gioco). */
    staccata(l) {
      const dist = this.distanze.get(l.id);
      if (dist == null) return false;
      return dist > (l.d + l.d2) / 2 + 0.03;
    }

    // ---------------------------------------------- tiranti, assi, altro
    tirante(idPalo) {
      const p = this.pezzo(idPalo);
      if (!p || p.forma !== 'palo') throw new Error('Seleziona un palo.');
      return this.modifica('Nuovo tirante', () => {
        const cima = p.a[1] > p.b[1] ? p.a : p.b;
        const centro = this._centro();
        let dx = cima[0] - centro[0], dz = cima[2] - centro[2];
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        if (l < 0.01) { dx = 1; dz = 0; }
        const dist = Math.max(1.5, cima[1] * 0.8);
        const terra = [cima[0] + dx * dist, 0.12, cima[2] + dz * dist];
        const c = { id: this.nuovoId('c'), forma: 'corda', tipo: 'tirante', livello: 'tiranti', a: G.arr3(cima), b: G.arr3(terra), d: 0.022 };
        const k = { id: this.nuovoId('k'), forma: 'picchetto', tipo: 'picchetto', livello: 'tiranti', p: G.arr3([terra[0], 0.1, terra[2]]) };
        if (this.passoNuovi) { c.passo = this.passoNuovi; k.passo = this.passoNuovi; }
        if (!this.dati.info.tirante) this.dati.info.tirante = { titolo: 'Tirante', descrizione: 'Corda dal palo a un picchetto a terra.' };
        if (!this.dati.info.picchetto) this.dati.info.picchetto = { titolo: 'Picchetto', descrizione: 'Ancoraggio a terra.' };
        this.dati.pezzi.push(c, k);
        return c;
      });
    }

    aggiungiAsse() {
      return this.modifica('Nuova asse', () => {
        const c = this._centro();
        const a = {
          id: this.nuovoId('s'), forma: 'asse', tipo: 'asse', livello: 'piattaforma',
          a: G.arr3([c[0] - 1, 1, c[2]]), b: G.arr3([c[0] + 1, 1, c[2]]), larghezza: 0.2, spessore: 0.05,
        };
        if (this.passoNuovi) a.passo = this.passoNuovi;
        if (!this.dati.info.asse) this.dati.info.asse = { titolo: 'Asse', descrizione: 'Tavola del piano.' };
        this.dati.pezzi.push(a);
        return a;
      });
    }

    _centro() {
      const pali = this.dati.pezzi.filter((p) => p.forma === 'palo');
      if (!pali.length) return [0, 0, 0];
      const s = pali.reduce((acc, p) => G.somma(acc, G.lungo(p.a, p.b, 0.5)), [0, 0, 0]);
      return G.per(s, 1 / pali.length);
    }

    elimina(ids) {
      const set = new Set(ids);
      if (!set.size) return;
      this.modifica('Elimina', () => {
        this.dati.pezzi = this.dati.pezzi.filter((p) => !set.has(p.id));
        this.dati.legature = this.dati.legature.filter((l) => !set.has(l.id) && !(l.pali || []).some((id) => set.has(id)));
      });
    }

    duplica(ids, scarto = [0.5, 0, 0]) {
      const set = new Set(ids);
      return this.modifica('Duplica', () => {
        const mappa = new Map();
        const nuovi = [];
        this.dati.pezzi.filter((p) => set.has(p.id)).forEach((p) => {
          const c = JSON.parse(JSON.stringify(p));
          c.id = this.nuovoId(p.forma[0]);
          ['a', 'b', 'p'].forEach((k) => { if (c[k]) c[k] = G.arr3(G.somma(c[k], scarto)); });
          if (c.punti) c.punti = c.punti.map((q) => G.arr3(G.somma(q, scarto)));
          mappa.set(p.id, c.id);
          this.dati.pezzi.push(c);
          nuovi.push(c.id);
        });
        this.dati.legature.filter((l) => (l.pali || []).length && l.pali.every((id) => mappa.has(id))).forEach((l) => {
          const c = JSON.parse(JSON.stringify(l));
          c.id = this.nuovoId('l');
          c.pali = l.pali.map((id) => mappa.get(id));
          this.dati.legature.push(c);
          nuovi.push(c.id);
        });
        return nuovi;
      });
    }

    /** Sposta di un vettore (m) i pezzi indicati. */
    sposta(ids, v, etichetta = 'Sposta') {
      const set = new Set(ids);
      this.modifica(etichetta, () => {
        this.dati.pezzi.filter((p) => set.has(p.id)).forEach((p) => {
          ['a', 'b', 'p'].forEach((k) => { if (p[k]) p[k] = G.arr3(G.somma(p[k], v)); });
          if (p.punti) p.punti = p.punti.map((q) => G.arr3(G.somma(q, v)));
        });
      });
    }

    // ------------------------------------------------------------ passi
    aggiungiPasso() {
      return this.modifica('Nuovo passo', () => {
        this.dati.passi.push({ titolo: `Passo ${this.dati.passi.length + 1}`, descrizione: '' });
        return this.dati.passi.length;
      });
    }

    eliminaPasso(n) {
      this.modifica('Elimina passo', () => {
        this.dati.passi.splice(n - 1, 1);
        const sposta = (o) => {
          if (o.passo === n) o.passo = Math.max(0, n - 1) || undefined;
          else if (o.passo > n) o.passo -= 1;
          if (o.fino > n) o.fino -= 1;
          if (!o.passo) delete o.passo;
        };
        this.dati.pezzi.forEach(sposta);
        this.dati.legature.forEach(sposta);
      });
    }

    scambiaPassi(n, m) {
      if (n < 1 || m < 1 || n > this.dati.passi.length || m > this.dati.passi.length) return;
      this.modifica('Riordina passi', () => {
        const ps = this.dati.passi;
        [ps[n - 1], ps[m - 1]] = [ps[m - 1], ps[n - 1]];
        const sc = (o) => { if (o.passo === n) o.passo = m; else if (o.passo === m) o.passo = n; };
        this.dati.pezzi.forEach(sc);
        this.dati.legature.forEach(sc);
      });
    }

    assegnaPasso(ids, n) {
      const set = new Set(ids);
      this.modifica('Assegna passo', () => {
        [...this.dati.pezzi, ...this.dati.legature].filter((o) => set.has(o.id)).forEach((o) => {
          if (n) o.passo = n; else delete o.passo;
        });
      });
    }

    contaNelPasso(n) {
      return [...this.dati.pezzi, ...this.dati.legature].filter((o) => o.passo === n).length;
    }
  }

  window.Documento = Documento;
  window.Documento.slug = slug;
})();
