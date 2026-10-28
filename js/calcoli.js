// Calcoli sul modello Sognabandiera: distinta pali, legature, misure, passi.
// È la copia fedele di lib/models/modello3d.dart dell'app: se cambi uno,
// cambia anche l'altro (i test in studio/test e test/ controllano gli stessi casi).
(function (radice) {
  'use strict';

  // ---------------------------------------------------------- formattazione
  /** 2 → "2", 2.5 → "2,5", 2.25 → "2,25" (come num1 dell'app). */
  function num1(v) {
    if (v === Math.round(v)) return String(Math.trunc(v));
    const una = Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
    return v.toFixed(una ? 1 : 2).replace('.', ',');
  }
  const m1 = (v) => num1(Math.round(v * 10) / 10) + ' m';
  const suPer = (v, passo) => Math.ceil(v / passo - 1e-9) * passo;
  const maiuscola = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  function plurale(s, n) {
    if (n === 1 || !s) return s;
    if (s.endsWith('a')) return s.slice(0, -1) + 'e';
    if (s.endsWith('e')) return s.slice(0, -1) + 'i';
    return s;
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const n = (v, def = 0) => (typeof v === 'number' ? v : def);

  /** Stima del cordino (m) se il modello non lo indica: regola pratica dell'app. */
  function stimaCordino(tipo, d1, d2) {
    const k = String(tipo || '').toLowerCase().startsWith('parallel') ? 9 : 13;
    return suPer(0.8 + k * (d1 + d2), 0.5);
  }

  function crea(dati) {
    const pezzi = dati.pezzi || [];
    const legature = dati.legature || [];
    const passi = dati.passi || [];
    const cordinoMm = n(dati.cordinoMm, 6);

    function nomeTipo(tipo) {
      const i = dati.info && dati.info[tipo];
      if (i && typeof i.titolo === 'string') return i.titolo;
      const t = String(tipo || '').replace(/_/g, ' ');
      return t ? t[0].toUpperCase() + t.slice(1) : 'Pezzo';
    }
    const contaNelMateriale = (p) => p.livello !== 'traccia' && p.livello !== 'persona' && p.distinta !== false;
    function cordinoDi(l) {
      if (typeof l.cordinoM === 'number') return l.cordinoM;
      const d1 = n(l.d, 0.12), d2 = n(l.d2, d1);
      return stimaCordino(l.tipo, d1, d2);
    }
    const raggruppa = (lista, chiave) => {
      const m = new Map();
      lista.forEach((x) => { const k = chiave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
      return m;
    };

    // ---------------------------------------------------------------- pali
    function pali() {
      const g = raggruppa(pezzi.filter((p) => p.forma === 'palo' && contaNelMateriale(p)), (p) => p.tipo || '');
      return [...g.entries()].map(([tipo, lista]) => {
        const lung = lista.map((p) => dist(p.a, p.b));
        const minL = Math.min(...lung), maxL = Math.max(...lung);
        return {
          nome: nomeTipo(tipo),
          quantita: lista.length,
          lunghezzaCm: suPer(maxL * 100, 10),
          diametroCm: Math.round(Math.max(...lista.map((p) => n(p.d))) * 100),
          note: maxL - minL > 0.1 ? `Lunghezze da ${m1(minL)} a ${m1(maxL)}` : '',
        };
      });
    }

    // ------------------------------------------------------------ legature
    function legatureDistinta() {
      const g = raggruppa(legature, (l) => `${l.tipo || ''}|${l.dove || ''}`);
      const cat = dati.catalogoLegature || {};
      return [...g.values()].map((lista) => {
        const l = lista[0];
        const c = cat[l.tipo] || {};
        return {
          tipo: maiuscola(l.tipo || ''),
          posizione: l.dove || '',
          quantita: lista.length,
          cordinoDiametroMm: n(l.cordinoMm, cordinoMm),
          cordinoLunghezzaM: Math.max(...lista.map(cordinoDi)),
          note: c.istruzioni || '',
        };
      });
    }

    // -------------------------------------------------------------- misure
    function misure() {
      const out = [];
      const strutturali = pezzi.filter((p) => p.livello !== 'traccia' && p.livello !== 'persona');
      let altezza = 0;
      strutturali.forEach((p) => ['a', 'b', 'p'].forEach((k) => {
        if (Array.isArray(p[k])) altezza = Math.max(altezza, p[k][1] + (k === 'p' ? n(p.r) : 0));
      }));
      if (altezza > 0) out.push({ nome: 'Altezza massima', valore: '≈ ' + m1(altezza) });

      const ingombro = (punti) => {
        if (!punti.length) return null;
        const xs = punti.map((p) => p[0]), zs = punti.map((p) => p[2]);
        const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...zs) - Math.min(...zs);
        if (w < 0.05 && d < 0.05) return null;
        return `≈ ${num1(Math.round(w * 10) / 10)} × ${num1(Math.round(d * 10) / 10)} m`;
      };
      const piedi = [];
      strutturali.filter((p) => p.forma === 'palo').forEach((p) => ['a', 'b'].forEach((k) => { if (p[k][1] < 0.3) piedi.push(p[k]); }));
      const iPali = ingombro(piedi);
      if (iPali) out.push({ nome: 'Ingombro dei pali a terra', valore: iPali });
      const picchetti = strutturali.filter((p) => p.forma === 'picchetto' && p.fino == null);
      const iTot = ingombro([...piedi, ...picchetti.map((p) => p.p)]);
      if (iTot && iTot !== iPali) out.push({ nome: 'Ingombro con tiranti', valore: iTot });

      (dati.quote || []).forEach((q) => {
        const t = q.testo || '', i = t.indexOf('≈');
        if (i > 0) out.push({ nome: maiuscola(t.slice(0, i).trim()), valore: t.slice(i).trim() });
        else out.push({ nome: maiuscola(t), valore: '≈ ' + m1(dist(q.a, q.b)) });
      });

      const p = pezzi.filter((x) => x.forma === 'palo' && contaNelMateriale(x));
      if (p.length) {
        const metri = p.reduce((s, x) => s + dist(x.a, x.b), 0);
        out.push({ nome: 'Pali in totale', valore: `${p.length}, ≈ ${num1(Math.round(metri))} m` });
      }
      if (legature.length) {
        const metri = legature.reduce((s, l) => s + cordinoDi(l), 0);
        out.push({ nome: 'Cordino per le legature', valore: `${legature.length} ${legature.length === 1 ? 'cordino' : 'cordini'}, ≈ ${num1(Math.round(metri))} m (Ø ${num1(cordinoMm)} mm)` });
      }
      const corde = raggruppa(strutturali.filter((x) => x.forma === 'corda'), (x) => x.tipo || '');
      corde.forEach((lista, tipo) => {
        const l = lista.map((c) => dist(c.a, c.b) + 1);
        out.push({ nome: nomeTipo(tipo), valore: `${l.length} corde da ≈ ${num1(suPer(Math.max(...l), 0.5))} m` });
      });
      const assi = raggruppa(strutturali.filter((x) => x.forma === 'asse'), (x) => x.tipo || '');
      assi.forEach((lista, tipo) => {
        const l = lista.map((a) => dist(a.a, a.b));
        const sp = Math.round(n(lista[0].spessore) * 100);
        const da = Math.min(...l), a = Math.max(...l);
        out.push({ nome: nomeTipo(tipo), valore: `${lista.length} assi${a - da > 0.1 ? `, da ${m1(da)} a ${m1(a)}` : ` da ${m1(a)}`}, spessore ${sp} cm` });
      });
      const nPicchetti = picchetti.length + strutturali.filter((x) => x.forma === 'picchetto' && x.fino != null).length;
      if (nPicchetti > 0) out.push({ nome: 'Picchetti', valore: String(nPicchetti) });
      return out;
    }

    // --------------------------------------------------------------- passi
    function materialePasso(np, attrezzi) {
      const righe = [];
      if (attrezzi) righe.push(attrezzi);
      const delPasso = pezzi.filter((p) => p.passo === np && contaNelMateriale(p));
      const pal = new Map(), cor = new Map(), ass = new Map();
      let picch = 0;
      const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
      delPasso.forEach((p) => {
        const t = p.tipo || '';
        if (p.forma === 'palo') add(pal, t, p);
        else if (p.forma === 'corda') add(cor, t, dist(p.a, p.b) + 1);
        else if (p.forma === 'asse') add(ass, t, dist(p.a, p.b));
        else if (p.forma === 'picchetto') picch++;
      });
      pal.forEach((g, tipo) => {
        const l = Math.max(...g.map((p) => dist(p.a, p.b)));
        const d = Math.round(Math.max(...g.map((p) => n(p.d))) * 100);
        righe.push(`${g.length} × ${nomeTipo(tipo)} (${num1(Math.round(suPer(l, 0.1) * 10) / 10)} m, Ø ${d} cm)`);
      });
      ass.forEach((l, tipo) => {
        const da = Math.min(...l), a = Math.max(...l);
        righe.push(`${l.length} × ${nomeTipo(tipo)} (${a - da > 0.1 ? `${m1(da)}–${m1(a)}` : m1(a)})`);
      });
      cor.forEach((l, tipo) => righe.push(`${l.length} × ${nomeTipo(tipo)} (corda da ≈ ${num1(suPer(Math.max(...l), 0.5))} m)`));
      if (picch > 0) righe.push(`${picch} ${picch === 1 ? 'picchetto' : 'picchetti'}`);
      const leg = legature.filter((l) => l.passo === np);
      if (leg.length) {
        const perTipo = new Map();
        leg.forEach((l) => perTipo.set(l.tipo || '', (perTipo.get(l.tipo || '') || 0) + 1));
        const metri = leg.reduce((s, l) => s + cordinoDi(l), 0);
        const dettaglio = [...perTipo.entries()].map(([t, c]) => `${c} ${plurale(t, c)}`).join(', ');
        righe.push(`${leg.length} ${leg.length === 1 ? 'cordino' : 'cordini'} (${dettaglio}; ≈ ${num1(Math.round(metri))} m)`);
      }
      return righe.join('\n');
    }

    function passiDistinta() {
      return passi.map((p, i) => ({
        titolo: p.titolo || '',
        descrizione: p.descrizione || '',
        foto: null,
        serve: materialePasso(i + 1, p.attrezzi || ''),
        sicurezza: p.sicurezza || '',
        passo3d: i + 1,
      }));
    }

    return { pali, legature: legatureDistinta, misure, passi: passiDistinta, materialePasso, nomeTipo, cordinoDi };
  }

  const Calcoli = { crea, stimaCordino, num1, suPer };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calcoli;
  else radice.Calcoli = Calcoli;
})(typeof window !== 'undefined' ? window : globalThis);
