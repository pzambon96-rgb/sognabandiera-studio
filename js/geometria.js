// Geometria dei pali: angoli, punti più vicini tra due pali, arrotondamenti.
// Convenzioni: metri nel modello, millimetri nell'interfaccia; Y verso l'alto.
// Inclinazione = angolo dalla verticale (0° = palo dritto, 90° = sdraiato).
// Direzione = angolo in pianta: 0° = verso destra (asse X), 90° = verso chi guarda (asse Z).
(function () {
  'use strict';
  const RAD = Math.PI / 180;

  const sottrai = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const somma = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const per = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const scalare = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const lunghezza = (a) => Math.hypot(a[0], a[1], a[2]);
  const distanza = (a, b) => lunghezza(sottrai(a, b));
  const normalizza = (a) => { const l = lunghezza(a) || 1; return per(a, 1 / l); };
  const lungo = (a, b, t) => somma(a, per(sottrai(b, a), t));
  const arrotonda = (v, passo = 0.001) => Math.round(v / passo) * passo;
  const arr3 = (p) => p.map((v) => Math.round(v * 1000) / 1000);

  function dirDaAngoli(inclinazione, direzione) {
    const i = inclinazione * RAD, d = direzione * RAD;
    return [Math.sin(i) * Math.cos(d), Math.cos(i), Math.sin(i) * Math.sin(d)];
  }

  function angoliDaDir(v) {
    const u = normalizza(v);
    const incl = Math.acos(Math.max(-1, Math.min(1, u[1]))) / RAD;
    let dir = Math.atan2(u[2], u[0]) / RAD;
    if (dir < 0) dir += 360;
    if (incl < 1e-6) dir = 0;
    return { inclinazione: incl, direzione: dir };
  }

  /** Punto del segmento a-b più vicino a p, con il parametro t (0..1). */
  function piuVicinoSuSegmento(p, a, b) {
    const ab = sottrai(b, a), l2 = scalare(ab, ab);
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, scalare(sottrai(p, a), ab) / l2));
    return { p: lungo(a, b, t), t };
  }

  /**
   * Punti più vicini tra i segmenti a1-b1 e a2-b2.
   * Per pali quasi paralleli usa il centro del tratto in cui si affiancano.
   * Restituisce { p1, p2, t1, t2, distanza, paralleli }.
   */
  function puntiPiuVicini(a1, b1, a2, b2) {
    const d1 = sottrai(b1, a1), d2 = sottrai(b2, a2), r = sottrai(a1, a2);
    const a = scalare(d1, d1), e = scalare(d2, d2), f = scalare(d2, r);
    const c = scalare(d1, r), b = scalare(d1, d2), den = a * e - b * b;
    const paralleli = den < 1e-6 * a * e || den < 1e-12;
    let s, t;
    if (paralleli) {
      // proiezione del secondo palo sul primo: centro della sovrapposizione
      const ta = scalare(sottrai(a2, a1), d1) / a, tb = scalare(sottrai(b2, a1), d1) / a;
      const lo = Math.max(0, Math.min(ta, tb)), hi = Math.min(1, Math.max(ta, tb));
      s = lo <= hi ? (lo + hi) / 2 : (Math.abs(lo) < Math.abs(hi - 1) ? 0 : 1);
      t = piuVicinoSuSegmento(lungo(a1, b1, s), a2, b2).t;
    } else {
      s = Math.max(0, Math.min(1, (b * f - c * e) / den));
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
    const p1 = lungo(a1, b1, s), p2 = lungo(a2, b2, t);
    return { p1, p2, t1: s, t2: t, distanza: distanza(p1, p2), paralleli };
  }

  /** Angolo tra due pali in gradi (0–90). */
  function angoloTra(a1, b1, a2, b2) {
    const c = Math.abs(scalare(normalizza(sottrai(b1, a1)), normalizza(sottrai(b2, a2))));
    return Math.acos(Math.min(1, c)) / RAD;
  }

  window.Geo = {
    RAD, sottrai, somma, per, scalare, lunghezza, distanza, normalizza, lungo, arrotonda, arr3,
    dirDaAngoli, angoliDaDir, piuVicinoSuSegmento, puntiPiuVicini, angoloTra,
  };
})();
