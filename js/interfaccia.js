// Pannelli dello Studio: elenco pezzi, proprietà, distinta, passi, progetto,
// dialoghi (catalogo, scelta palo, accesso, apertura/pubblicazione).
(function () {
  'use strict';
  const G = window.Geo;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mm = (m) => Math.round(m * 1000);
  const gradi = (v) => Math.round(v * 10) / 10;
  const num = (el) => { const v = parseFloat(String(el.value).replace(',', '.')); return Number.isFinite(v) ? v : null; };
  const n1 = (v) => Calcoli.num1(Math.round(v * 10) / 10);

  const NOMI_FORMA = { palo: 'Palo', corda: 'Corda', asse: 'Asse', picchetto: 'Picchetto', sfera: 'Pomolo', linee: 'Linee', bandiera: 'Bandiera', persona: 'Persona', anello: 'Buca' };

  let avvisoTimer = null;
  function avviso(testo, ms = 2600) {
    const el = $('#avviso');
    el.textContent = testo;
    el.classList.add('on');
    clearTimeout(avvisoTimer);
    avvisoTimer = setTimeout(() => el.classList.remove('on'), ms);
  }
  function suggerimento(testo) {
    const el = $('#suggerimento');
    el.textContent = testo || '';
    el.style.display = testo ? 'block' : 'none';
  }

  // ---------------------------------------------------------- dialoghi
  /** Apre il dialogo con l'HTML indicato; risolve con il valore del pulsante premuto (o null). */
  function dialogo(html, { largo = false, prepara } = {}) {
    const d = $('#dialogo'), f = $('#dialogo-form');
    f.innerHTML = html;
    // Invio nei campi non deve premere il primo pulsante (es. "Elimina")
    f.onkeydown = (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); };
    d.style.maxWidth = largo ? 'min(1100px, 96vw)' : 'min(620px, 94vw)';
    return new Promise((ok) => {
      d.onclose = () => ok(d.returnValue || null);
      d.returnValue = '';
      if (prepara) prepara(f);
      d.showModal();
      const primo = f.querySelector('input:not([type=hidden]),select,textarea');
      if (primo) primo.focus();
    });
  }
  const chiudiDialogo = (v) => $('#dialogo').close(v);
  async function conferma(titolo, testo, ok = 'Conferma') {
    const r = await dialogo(`<h2>${esc(titolo)}</h2><p>${esc(testo)}</p>
      <div class="piedi-dialogo"><button class="btn" value="no">Annulla</button><button class="btn primario" value="si">${esc(ok)}</button></div>`);
    return r === 'si';
  }

  // ------------------------------------------------------ elenco pezzi
  function descrizionePezzo(doc, o) {
    if (o.forma === 'palo') return { nome: doc.nomeRuolo(o), dx: `${mm(G.distanza(o.a, o.b))} mm` };
    if (o.tipo && doc.dati.info[o.tipo]) return { nome: doc.dati.info[o.tipo].titolo, dx: NOMI_FORMA[o.forma] || '' };
    return { nome: NOMI_FORMA[o.forma] || o.forma, dx: o.tipo && o.tipo !== o.forma ? o.tipo : '' };
  }

  function disegnaElenco(app) {
    const { doc } = app;
    const filtro = $('#cerca').value.trim().toLowerCase();
    const el = $('#elenco');
    const gruppi = new Map();
    const colori = Object.fromEntries(doc.dati.livelli.map((l) => [l.id, l.colore]));
    const nomeLiv = Object.fromEntries(doc.dati.livelli.map((l) => [l.id, l.nome]));
    doc.dati.pezzi.forEach((o) => {
      const d = descrizionePezzo(doc, o);
      if (filtro && !(`${d.nome} ${d.dx} ${o.id}`.toLowerCase().includes(filtro))) return;
      const g = nomeLiv[o.livello] || o.livello || 'Altro';
      if (!gruppi.has(g)) gruppi.set(g, []);
      gruppi.get(g).push({ o, d, colore: o.colore || colori[o.livello] || '#999' });
    });
    const leg = doc.dati.legature.filter((l) => !filtro || `legatura ${l.tipo} ${l.dove}`.toLowerCase().includes(filtro));
    let html = '';
    gruppi.forEach((lista, nome) => {
      html += `<div class="gruppo-elenco"><div>${esc(nome)} · ${lista.length}</div>`;
      lista.forEach(({ o, d, colore }) => {
        html += `<button class="voce${app.selezione.has(o.id) ? ' sel' : ''}" data-id="${o.id}"><span class="pallino" style="background:${esc(colore)}"></span>${esc(d.nome)}<span class="dx">${esc(d.dx)}${o.passo ? ` · P${o.passo}` : ''}</span></button>`;
      });
      html += '</div>';
    });
    if (leg.length) {
      html += `<div class="gruppo-elenco"><div>Legature · ${leg.length}</div>`;
      leg.forEach((l) => {
        const att = doc.staccata(l) ? '<span class="attenzione" title="I pali non si toccano">⚠</span>' : '';
        html += `<button class="voce${app.selezione.has(l.id) ? ' sel' : ''}" data-id="${l.id}"><span class="pallino" style="background:#eeeae0;border:1px solid #bbb"></span>${att}${esc(cap(l.tipo))}<span class="dx">${esc(l.dove || '')}${l.passo ? ` · P${l.passo}` : ''}</span></button>`;
      });
      html += '</div>';
    }
    el.innerHTML = html || '<p class="vuoto">Nessun pezzo. Inizia con <b>Palo</b>.</p>';
    $('#conta-pezzi').textContent = `${doc.dati.pezzi.length + doc.dati.legature.length}`;
  }
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

  // ------------------------------------------------------- proprietà
  function opzioniPassi(doc, attuale) {
    let h = `<option value="0"${!attuale ? ' selected' : ''}>— nessuno —</option>`;
    doc.dati.passi.forEach((p, i) => { h += `<option value="${i + 1}"${attuale === i + 1 ? ' selected' : ''}>${i + 1}. ${esc(p.titolo)}</option>`; });
    return h;
  }
  function opzioniLivelli(doc, attuale) {
    return doc.dati.livelli.map((l) => `<option value="${esc(l.id)}"${l.id === attuale ? ' selected' : ''}>${esc(l.nome)}</option>`).join('');
  }
  const campo = (etichetta, input) => `<div class="campo${input.includes('class="riga3"') ? ' xyz' : ''}"><label>${etichetta}</label>${input}</div>`;
  const inMm = (nome, valore, attr = '') => `<span class="unita" data-u="mm"><input name="${nome}" type="number" step="1" value="${valore}" ${attr}></span>`;
  const inGradi = (nome, valore) => `<span class="unita" data-u="°"><input name="${nome}" type="number" step="0.5" value="${valore}"></span>`;
  const xyz = (pref, p, attr = '') => `<div class="riga3">${['X', 'Y', 'Z'].map((k, i) => `<label>${k}${inMm(pref + i, mm(p[i]), attr)}</label>`).join('')}</div>`;

  function disegnaProprieta(app) {
    const { doc } = app;
    const el = $('#scheda-proprieta');
    const ids = [...app.selezione];
    const oggetti = ids.map((id) => doc.oggetto(id)).filter(Boolean);
    if (!oggetti.length) {
      el.innerHTML = `<p class="vuoto">Seleziona un pezzo cliccandolo nel 3D o nell'elenco.<br><br>
        <b>Ctrl+clic</b> per selezionarne più di uno.<br>Trascina per ruotare la vista, tasto destro per spostarla, rotella per lo zoom.</p>
        <h3>Inizia</h3><div class="pulsanti"><button class="btn primario" data-az="nuovoPalo">Aggiungi un palo</button></div>`;
      return;
    }
    if (oggetti.length > 1) return disegnaMultipla(app, el, oggetti);
    const o = oggetti[0];
    if (doc.legatura(o.id)) return disegnaLegatura(app, el, o);
    if (o.forma === 'palo') return disegnaPalo(app, el, o);
    return disegnaAltro(app, el, o);
  }

  function disegnaPalo(app, el, p) {
    const { doc } = app;
    const att = Documento.assetto(p);
    const voce = p.cat ? Catalogo.palo(p.cat) : null;
    const opzCat = Catalogo.dati.pali.map((c) => `<option value="${esc(c.id)}"${c.id === p.cat ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
    const punta = p.b;
    const legature = doc.dati.legature.filter((l) => (l.pali || []).includes(p.id));
    el.innerHTML = `
      <h3>Palo</h3>
      ${campo('Ruolo', `<input name="ruolo" list="ruoli" value="${esc(doc.nomeRuolo(p))}"><datalist id="ruoli">${doc.ruoli().map((r) => `<option value="${esc(r)}">`).join('')}</datalist>`)}
      ${campo('Dal catalogo', `<select name="cat"><option value="">Fuori catalogo</option>${opzCat}</select>`)}
      ${campo('Lunghezza', inMm('lunghezza', mm(att.lunghezza), voce ? 'readonly title="Lunghezza del catalogo: scegli un altro palo per cambiarla"' : ''))}
      ${campo('Diametro', inMm('diametro', mm(p.d), voce ? 'readonly' : ''))}
      ${!voce ? '<p class="nota">Palo fuori catalogo: lunghezza e diametro sono liberi e non contano per il magazzino.</p>' : ''}
      <h3>Posizione</h3>
      ${campo('Base', xyz('a', att.a))}
      ${campo('Inclinazione', inGradi('incl', gradi(att.inclinazione)))}
      ${campo('Direzione', inGradi('dir', gradi(att.direzione)))}
      <p class="nota">Inclinazione: 0° = dritto, 90° = sdraiato. Direzione in pianta: 0° = verso destra (X), 90° = verso di te (Z).</p>
      ${campo('Punta', xyz('b', punta))}
      <div class="pulsanti">
        <button class="btn piccolo" data-op="dritto">Dritto</button>
        <button class="btn piccolo" data-op="sdraia">Sdraiato</button>
        <button class="btn piccolo" data-op="inverti">Inverti base/punta</button>
        <button class="btn piccolo" data-op="terra">Appoggia a terra</button>
        <button class="btn piccolo" data-az="aggancia">Aggancia base…</button>
      </div>
      <h3>Montaggio</h3>
      ${campo('Passo', `<select name="passo">${opzioniPassi(doc, p.passo)}</select>`)}
      ${campo('Livello', `<select name="livello">${opzioniLivelli(doc, p.livello)}</select>`)}
      ${campo('Colore', `<span style="display:flex;gap:6px;align-items:center"><input name="colore" type="color" value="${esc(p.colore || '#c9a468')}" style="width:52px;padding:0;height:28px"><button class="btn piccolo" data-op="coloreLegno">Legno</button></span>`)}
      ${campo('Nella distinta', `<select name="distinta"><option value="si"${p.distinta !== false ? ' selected' : ''}>Sì</option><option value="no"${p.distinta === false ? ' selected' : ''}>No (solo disegno)</option></select>`)}
      <h3>Legature (${legature.length})</h3>
      ${legature.map((l) => `<button class="voce" data-id="${l.id}">${doc.staccata(l) ? '<span class="attenzione">⚠</span>' : ''}${esc(cap(l.tipo))}<span class="dx">${esc(l.dove || '')}</span></button>`).join('') || '<p class="nota">Nessuna. Selezionalo insieme a un altro palo (Ctrl+clic) e premi <b>Lega</b>.</p>'}
      <div class="pulsanti"><button class="btn" data-az="lega">Lega con un altro palo…</button><button class="btn" data-az="tirante">Aggiungi tirante</button></div>
      ${descrizioneRuolo(doc, p)}
    `;
    collegaCampi(el, (nome, input) => {
      const v = num(input);
      if (nome === 'ruolo') return doc.modifica('Ruolo', () => doc.impostaRuolo(p, input.value || 'Palo'));
      if (nome === 'cat') return doc.modifica('Palo dal catalogo', () => {
        const c = Catalogo.palo(input.value);
        if (c) { p.cat = c.id; p.d = c.diametroMm / 1000; Documento.applicaAssetto(p, { lunghezza: c.lunghezzaMm / 1000 }); }
        else delete p.cat;
      });
      if (nome === 'lunghezza' && v > 0) return doc.modifica('Lunghezza', () => Documento.applicaAssetto(p, { lunghezza: v / 1000 }));
      if (nome === 'diametro' && v > 0) return doc.modifica('Diametro', () => { p.d = v / 1000; });
      if (/^a[012]$/.test(nome) && v != null) return doc.modifica('Sposta base', () => { const a = p.a.slice(); a[+nome[1]] = v / 1000; Documento.applicaAssetto(p, { a }); });
      if (/^b[012]$/.test(nome) && v != null) return doc.modifica('Punta', () => {
        const b = p.b.slice(); b[+nome[1]] = v / 1000;
        const ang = G.angoliDaDir(G.sottrai(b, p.a));
        Documento.applicaAssetto(p, ang);
      });
      if (nome === 'incl' && v != null) return doc.modifica('Inclinazione', () => Documento.applicaAssetto(p, { inclinazione: Math.max(0, Math.min(180, v)) }));
      if (nome === 'dir' && v != null) return doc.modifica('Direzione', () => Documento.applicaAssetto(p, { direzione: ((v % 360) + 360) % 360 }));
      if (nome === 'passo') return doc.assegnaPasso([p.id], +input.value);
      if (nome === 'livello') return doc.modifica('Livello', () => { p.livello = input.value; });
      if (nome === 'colore') return doc.modifica('Colore', () => { p.colore = input.value; });
      if (nome === 'distinta') return doc.modifica('Distinta', () => { if (input.value === 'no') p.distinta = false; else delete p.distinta; });
      if (nome === 'descRuolo') return doc.modifica('Descrizione ruolo', () => { doc.dati.info[p.tipo] = { ...(doc.dati.info[p.tipo] || { titolo: doc.nomeRuolo(p) }), descrizione: input.value }; });
    });
    el.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => {
      const op = b.dataset.op;
      if (op === 'dritto') doc.modifica('Dritto', () => Documento.applicaAssetto(p, { inclinazione: 0 }));
      if (op === 'sdraia') doc.modifica('Sdraiato', () => Documento.applicaAssetto(p, { inclinazione: 90 }));
      if (op === 'inverti') doc.modifica('Inverti', () => { [p.a, p.b] = [p.b, p.a]; });
      if (op === 'terra') doc.modifica('Appoggia a terra', () => { const dy = -Math.min(p.a[1], p.b[1]); p.a = G.arr3(G.somma(p.a, [0, dy, 0])); p.b = G.arr3(G.somma(p.b, [0, dy, 0])); });
      if (op === 'coloreLegno') doc.modifica('Colore', () => { delete p.colore; });
    }));
  }

  function descrizioneRuolo(doc, p) {
    const i = doc.dati.info[p.tipo] || {};
    return `<h3>Descrizione del ruolo</h3><p class="nota">Si legge nell'app quando si tocca un "${esc(doc.nomeRuolo(p))}" nel 3D. Vale per tutti i pali con questo ruolo.</p>
      <div class="campo" style="grid-template-columns:1fr"><textarea name="descRuolo" rows="3">${esc(i.descrizione || '')}</textarea></div>`;
  }

  function disegnaLegatura(app, el, l) {
    const { doc } = app;
    const p1 = doc.pezzo((l.pali || [])[0]), p2 = doc.pezzo((l.pali || [])[1]);
    const voce = Catalogo.legatura(l.tipo);
    const opz = Catalogo.dati.legature.map((c) => `<option value="${esc(Catalogo.tipoLegatura(c.nome))}"${Catalogo.tipoLegatura(c.nome) === l.tipo ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
    const extra = voce ? '' : `<option value="${esc(l.tipo)}" selected>${esc(cap(l.tipo))} (non in catalogo)</option>`;
    const dist = doc.distanze.get(l.id);
    const auto = l.ancora == null;
    el.innerHTML = `
      <h3>Legatura</h3>
      ${doc.staccata(l) ? `<div class="box-avviso">I due pali qui distano ${mm(dist)} mm tra gli assi: non si toccano. Avvicinali o sposta la legatura.</div>` : ''}
      ${campo('Tipo', `<select name="tipo">${extra}${opz}</select>`)}
      ${campo('Posizione', `<input name="dove" value="${esc(l.dove || '')}" placeholder="es. Gamba–traverso">`)}
      ${campo('Pali', `<span>${p1 ? `<button class="btn piccolo" data-id="${p1.id}">${esc(doc.nomeRuolo(p1))}</button>` : '?'} ${p2 ? `<button class="btn piccolo" data-id="${p2.id}">${esc(doc.nomeRuolo(p2))}</button>` : ''}</span>`)}
      ${p2 ? campo('Punto', `<select name="auto"><option value="si"${auto ? ' selected' : ''}>Automatico (dove i pali si incrociano)</option><option value="no"${!auto ? ' selected' : ''}>A una distanza dalla base</option></select>`) : ''}
      ${p2 && !auto ? campo('Dalla base del 1° palo', inMm('ancora', mm(l.ancora))) : ''}
      ${p2 ? `<div class="pulsanti"><button class="btn piccolo" data-op="accosta" title="Sposta il secondo palo finché tocca il primo in superficie">Accosta il 2° palo al 1°</button></div>` : ''}
      ${campo('Cordino', `<b>${n1(l.cordinoM || 0)} m</b>&nbsp;Ø ${l.cordinoMm || doc.dati.cordinoMm || 6} mm`)}
      <p class="nota">Calcolato con la regola del catalogo per "${esc(voce ? voce.nome : l.tipo)}" e i diametri dei due pali.</p>
      ${campo('Passo', `<select name="passo">${opzioniPassi(doc, l.passo)}</select>`)}
      ${voce && voce.istruzioni ? `<h3>Come si fa</h3><p class="nota" style="font-size:13px;color:inherit">${esc(voce.istruzioni)}</p>` : ''}
    `;
    collegaCampi(el, (nome, input) => {
      if (nome === 'tipo') return doc.modifica('Tipo legatura', () => { l.tipo = input.value; });
      if (nome === 'dove') return doc.modifica('Posizione legatura', () => { l.dove = input.value; });
      if (nome === 'auto') return doc.modifica('Punto legatura', () => {
        if (input.value === 'si') delete l.ancora;
        else l.ancora = Math.round(G.distanza(p1.a, l.p) * 1000) / 1000;
      });
      if (nome === 'ancora' && num(input) != null) return doc.modifica('Punto legatura', () => { l.ancora = num(input) / 1000; });
      if (nome === 'passo') return doc.assegnaPasso([l.id], +input.value);
    });
    const acc = el.querySelector('[data-op=accosta]');
    if (acc) acc.addEventListener('click', () => doc.accosta(l.id));
  }

  function disegnaAltro(app, el, o) {
    const { doc } = app;
    const info = doc.dati.info[o.tipo] || {};
    let geo = '';
    if (o.forma === 'corda') {
      geo = `${campo('Dal punto', xyz('a', o.a))}${campo('Al punto', xyz('b', o.b))}
        ${campo('Lunghezza', `<b>${n1(G.distanza(o.a, o.b))} m</b>&nbsp;(+1 m per i nodi)`)}
        ${campo('Tipo', `<input name="tipo" value="${esc(info.titolo || o.tipo || '')}" list="tipiCorda"><datalist id="tipiCorda"><option value="Tirante"><option value="Controvento"><option value="Tirante provvisorio"><option value="Drizza"></datalist>`)}
        ${campo('Si toglie al passo', `<select name="fino">${opzioniPassi(doc, o.fino).replace('— nessuno —', '— resta —')}</select>`)}`;
    } else if (o.forma === 'asse') {
      const att = Documento.assetto(o);
      geo = `${campo('Inizio', xyz('a', att.a))}${campo('Lunghezza', inMm('lunghezza', mm(att.lunghezza)))}
        ${campo('Inclinazione', inGradi('incl', gradi(att.inclinazione)))}${campo('Direzione', inGradi('dir', gradi(att.direzione)))}
        ${campo('Larghezza', inMm('larghezza', mm(o.larghezza || 0.2)))}${campo('Spessore', inMm('spessore', mm(o.spessore || 0.05)))}
        <p class="nota">Per un'asse orizzontale: inclinazione 90°.</p>`;
    } else if (o.p) {
      geo = campo('Posizione', xyz('p', o.p));
    } else {
      geo = '<p class="nota">Questo pezzo si sposta solo con lo strumento Sposta.</p>';
    }
    el.innerHTML = `<h3>${esc(info.titolo || NOMI_FORMA[o.forma] || o.forma)}</h3>
      ${geo}
      <h3>Montaggio</h3>
      ${campo('Passo', `<select name="passo">${opzioniPassi(doc, o.passo)}</select>`)}
      ${campo('Livello', `<select name="livello">${opzioniLivelli(doc, o.livello)}</select>`)}`;
    collegaCampi(el, (nome, input) => {
      const v = num(input);
      if (/^[abp][012]$/.test(nome) && v != null) {
        return doc.modifica('Sposta', () => {
          const k = nome[0];
          if (o.forma === 'asse' && k === 'a') { const a = o.a.slice(); a[+nome[1]] = v / 1000; Documento.applicaAssetto(o, { a }); }
          else { o[k] = o[k].slice(); o[k][+nome[1]] = v / 1000; }
        });
      }
      if (nome === 'lunghezza' && v > 0) return doc.modifica('Lunghezza', () => Documento.applicaAssetto(o, { lunghezza: v / 1000 }));
      if (nome === 'incl' && v != null) return doc.modifica('Inclinazione', () => Documento.applicaAssetto(o, { inclinazione: v }));
      if (nome === 'dir' && v != null) return doc.modifica('Direzione', () => Documento.applicaAssetto(o, { direzione: v }));
      if (nome === 'larghezza' && v > 0) return doc.modifica('Larghezza', () => { o.larghezza = v / 1000; });
      if (nome === 'spessore' && v > 0) return doc.modifica('Spessore', () => { o.spessore = v / 1000; });
      if (nome === 'tipo') return doc.modifica('Tipo', () => doc.impostaRuolo(o, input.value || 'Corda'));
      if (nome === 'fino') return doc.modifica('Si toglie al passo', () => { if (+input.value) o.fino = +input.value; else delete o.fino; });
      if (nome === 'passo') return doc.assegnaPasso([o.id], +input.value);
      if (nome === 'livello') return doc.modifica('Livello', () => { o.livello = input.value; });
    });
  }

  function disegnaMultipla(app, el, oggetti) {
    const { doc } = app;
    const pali = oggetti.filter((o) => o.forma === 'palo');
    el.innerHTML = `<h3>${oggetti.length} pezzi selezionati</h3>
      ${pali.length === 2 ? '<div class="box-ok">Due pali selezionati: premi <b>Lega</b> per legarli.</div>' : ''}
      ${campo('Passo', `<select name="passo"><option value="">— cambia —</option>${opzioniPassi(doc, -1)}</select>`)}
      ${campo('Livello', `<select name="livello"><option value="">— cambia —</option>${opzioniLivelli(doc, null)}</select>`)}
      <h3>Sposta di</h3>${xyz('d', [0, 0, 0])}
      <div class="pulsanti"><button class="btn" data-op="sposta">Sposta</button><button class="btn" data-az="duplica">Duplica</button><button class="btn pericolo" data-az="elimina">Elimina</button></div>`;
    collegaCampi(el, (nome, input) => {
      if (nome === 'passo' && input.value !== '') return doc.assegnaPasso(oggetti.map((o) => o.id), +input.value);
      if (nome === 'livello' && input.value) return doc.modifica('Livello', () => oggetti.forEach((o) => { if (o.livello !== undefined || o.forma) o.livello = input.value; }));
    }, ['d0', 'd1', 'd2']);
    el.querySelector('[data-op=sposta]').addEventListener('click', () => {
      const v = ['d0', 'd1', 'd2'].map((k) => (num(el.querySelector(`[name=${k}]`)) || 0) / 1000);
      if (v.some((x) => x)) doc.sposta(oggetti.map((o) => o.id), v);
    });
  }

  /** Collega i campi del pannello: la modifica parte quando si esce dal campo o con Invio. */
  function collegaCampi(el, fn, esclusi = []) {
    el.querySelectorAll('input[name],select[name],textarea[name]').forEach((input) => {
      if (esclusi.includes(input.name)) return;
      input.addEventListener('change', () => fn(input.name, input));
      if (input.tagName === 'INPUT') input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    });
  }

  // -------------------------------------------------------- distinta
  function disegnaDistinta(app) {
    const el = $('#scheda-distinta');
    const dati = app.doc.esporta();
    const c = Calcoli.crea(dati);
    const pali = c.pali(), leg = c.legature(), mis = c.misure();
    const mag = Catalogo.verifica(dati);
    const mancano = mag.filter((r) => r.manca > 0);
    const staccate = app.doc.dati.legature.filter((l) => app.doc.staccata(l)).length;
    el.innerHTML = `
      ${staccate ? `<div class="box-avviso">${staccate} legatur${staccate === 1 ? 'a unisce' : 'e uniscono'} pali che non si toccano (in rosso nel 3D).</div>` : ''}
      ${mancano.length ? `<div class="box-avviso">Il magazzino non basta: ${mancano.map((r) => `${esc(r.voce)} (mancano ${r.manca})`).join(', ')}.</div>` : (mag.length ? '<div class="box-ok">Il magazzino basta per questo progetto.</div>' : '')}
      <h3>Pali</h3>
      ${pali.length ? `<table class="distinta"><tr><th>Ruolo</th><th>Q.tà</th><th>Lungh.</th><th>Ø</th></tr>
        ${pali.map((p) => `<tr><td>${esc(p.nome)}${p.note ? `<br><span class="nota">${esc(p.note)}</span>` : ''}</td><td class="n">${p.quantita}</td><td class="n">${n1(p.lunghezzaCm / 100)} m</td><td class="n">${p.diametroCm} cm</td></tr>`).join('')}</table>` : '<p class="nota">Nessun palo.</p>'}
      <h3>Legature</h3>
      ${leg.length ? `<table class="distinta"><tr><th>Tipo · posizione</th><th>Q.tà</th><th>Cordino</th></tr>
        ${leg.map((l) => `<tr><td><b>${esc(l.tipo)}</b><br><span class="nota">${esc(l.posizione)}</span></td><td class="n">${l.quantita}</td><td class="n">${n1(l.cordinoLunghezzaM)} m Ø ${l.cordinoDiametroMm}</td></tr>`).join('')}</table>` : '<p class="nota">Nessuna legatura.</p>'}
      <h3>Magazzino</h3>
      ${mag.length ? `<table class="distinta"><tr><th>Voce</th><th>Servono</th><th>Ci sono</th></tr>
        ${mag.map((r) => `<tr><td>${esc(r.voce)}</td><td class="n">${r.servono}</td><td class="n${r.manca ? ' manca' : ''}">${r.disponibili == null ? '—' : r.disponibili}</td></tr>`).join('')}</table>` : '<p class="nota">Niente da controllare.</p>'}
      <h3>Misure</h3>
      <table class="distinta">${mis.map((m) => `<tr><td>${esc(m.nome)}</td><td class="n">${esc(m.valore)}</td></tr>`).join('')}</table>
      <p class="nota">È esattamente ciò che vedrà l'app dopo la pubblicazione.</p>`;
  }

  // ----------------------------------------------------------- passi
  function disegnaPassi(app) {
    const { doc } = app;
    const el = $('#scheda-passi');
    const passi = doc.dati.passi;
    const senza = [...doc.dati.pezzi, ...doc.dati.legature].filter((o) => !o.passo && o.forma !== 'persona').length;
    el.innerHTML = `
      ${campo('Pezzi nuovi nel passo', `<select name="passoNuovi">${opzioniPassi(doc, doc.passoNuovi)}</select>`)}
      <p class="nota">I pezzi che aggiungi da ora finiscono in questo passo. Per spostarli: selezionali e cambia "Passo" nelle proprietà.</p>
      ${senza ? `<div class="box-avviso">${senza} pezzi non sono in nessun passo: nel montaggio guidato compaiono già dall'inizio.</div>` : ''}
      <div class="pulsanti"><button class="btn primario" data-op="nuovo">+ Nuovo passo</button>${passi.length ? '<button class="btn" data-op="anteprima">▶ Anteprima montaggio</button>' : ''}</div>
      ${passi.map((p, i) => `
        <div class="passo-voce${doc.passoNuovi === i + 1 ? ' corrente' : ''}" data-n="${i + 1}">
          <header><b>${i + 1}. ${esc(p.titolo)}</b><span class="conta">${doc.contaNelPasso(i + 1)} pezzi</span>
            <button class="btn piccolo" data-op="su" title="Sposta su">↑</button><button class="btn piccolo" data-op="giu" title="Sposta giù">↓</button>
            <button class="btn piccolo" data-op="apri">Modifica</button></header>
        </div>`).join('')}`;
    collegaCampi(el, (nome, input) => { if (nome === 'passoNuovi') { doc.passoNuovi = +input.value; disegnaPassi(app); } });
    el.querySelector('[data-op=nuovo]').addEventListener('click', () => { const n = doc.aggiungiPasso(); doc.passoNuovi = n; modificaPasso(app, n); });
    const ant = el.querySelector('[data-op=anteprima]');
    if (ant) ant.addEventListener('click', () => app.anteprima(1));
    el.querySelectorAll('.passo-voce').forEach((box) => {
      const n = +box.dataset.n;
      box.querySelector('[data-op=su]').addEventListener('click', () => doc.scambiaPassi(n, n - 1));
      box.querySelector('[data-op=giu]').addEventListener('click', () => doc.scambiaPassi(n, n + 1));
      box.querySelector('[data-op=apri]').addEventListener('click', () => modificaPasso(app, n));
    });
  }

  async function modificaPasso(app, n) {
    const { doc } = app;
    const p = doc.dati.passi[n - 1];
    const materiale = Calcoli.crea(doc.esporta()).materialePasso(n, '');
    const r = await dialogo(`<h2>Passo ${n}</h2>
      ${campo('Titolo', `<input name="titolo" value="${esc(p.titolo)}">`)}
      ${campo('Cosa fare', `<textarea name="descrizione" rows="6">${esc(p.descrizione)}</textarea>`)}
      ${campo('Attrezzi', `<input name="attrezzi" value="${esc(p.attrezzi || '')}" placeholder="es. vanga, metro, 6 persone">`)}
      ${campo('Sicurezza', `<textarea name="sicurezza" rows="2">${esc(p.sicurezza || '')}</textarea>`)}
      ${campo('Materiale', `<span class="nota" style="white-space:pre-line;margin:0">${esc(materiale) || 'Calcolato dai pezzi del passo (ancora nessuno).'}</span>`)}
      ${campo('Inquadratura', `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="camera" style="width:auto"${p.camera ? '' : ' checked'}> usa la vista attuale del 3D</label>`)}
      <div class="piedi-dialogo"><button class="btn pericolo" value="elimina" style="margin-right:auto">Elimina passo</button><button class="btn" value="no">Annulla</button><button class="btn primario" value="ok">Salva</button></div>`);
    if (r === 'elimina') {
      if (await conferma('Eliminare il passo?', 'I pezzi del passo passano al passo precedente.', 'Elimina')) doc.eliminaPasso(n);
      return;
    }
    if (r !== 'ok') return;
    const f = $('#dialogo-form');
    const val = (k) => f.querySelector(`[name=${k}]`).value.trim();
    const usaVista = f.querySelector('[name=camera]').checked;
    doc.modifica('Modifica passo', () => {
      Object.assign(p, { titolo: val('titolo') || `Passo ${n}`, descrizione: val('descrizione') });
      ['attrezzi', 'sicurezza'].forEach((k) => { if (val(k)) p[k] = val(k); else delete p[k]; });
      if (usaVista) Object.assign(p, app.scena.inquadraturaAttuale());
    });
  }

  // --------------------------------------------------------- progetto
  function disegnaProgetto(app) {
    const { doc } = app;
    const d = doc.dati;
    const el = $('#scheda-progetto');
    el.innerHTML = `
      ${campo('Titolo', `<input name="titolo" value="${esc(d.titolo)}">`)}
      ${campo('Descrizione', `<textarea name="descrizione" rows="4">${esc(d.descrizione)}</textarea>`)}
      ${app.idApp ? `<div class="box-ok">Collegato al progetto dell'app. "Pubblica nell'app" lo aggiorna.</div>` : ''}
      <h3>Viste del 3D nell'app (${d.viste.length})</h3>
      ${d.viste.map((v, i) => `<div class="campo"><input data-vista="${i}" value="${esc(v.nome)}"><span><button class="btn piccolo" data-vai="${i}">Vai</button> <button class="btn piccolo pericolo" data-togli="${i}">✕</button></span></div>`).join('')}
      <div class="pulsanti"><button class="btn" data-op="vista">+ Aggiungi la vista attuale</button></div>
      <h3>Quote (${d.quote.length})</h3>
      ${d.quote.map((q, i) => `<div class="campo"><input data-quota="${i}" value="${esc(q.testo)}"><span><button class="btn piccolo pericolo" data-togliq="${i}">✕</button></span></div>`).join('') || '<p class="nota">Nessuna quota.</p>'}
      <h3>Livelli</h3>
      ${d.livelli.map((l, i) => `<div class="campo"><input data-livello="${i}" value="${esc(l.nome)}"><input type="color" data-colore="${i}" value="${esc(l.colore)}" style="width:52px;padding:0;height:28px"></div>`).join('')}`;
    collegaCampi(el, (nome, input) => {
      if (nome === 'titolo') return doc.modifica('Titolo', () => { d.titolo = input.value; });
      if (nome === 'descrizione') return doc.modifica('Descrizione', () => { d.descrizione = input.value; });
    });
    const su = (sel, fn) => el.querySelectorAll(sel).forEach((x) => x.addEventListener('change', () => fn(x)));
    su('[data-vista]', (x) => doc.modifica('Nome vista', () => { d.viste[+x.dataset.vista].nome = x.value; }));
    su('[data-quota]', (x) => doc.modifica('Quota', () => { d.quote[+x.dataset.quota].testo = x.value; }));
    su('[data-livello]', (x) => doc.modifica('Livello', () => { d.livelli[+x.dataset.livello].nome = x.value; }));
    su('[data-colore]', (x) => doc.modifica('Colore livello', () => { d.livelli[+x.dataset.colore].colore = x.value; }));
    el.querySelectorAll('[data-vai]').forEach((b) => b.addEventListener('click', () => { const v = d.viste[+b.dataset.vai]; app.scena.vai(v.camera, v.target); }));
    el.querySelectorAll('[data-togli]').forEach((b) => b.addEventListener('click', () => doc.modifica('Togli vista', () => d.viste.splice(+b.dataset.togli, 1))));
    el.querySelectorAll('[data-togliq]').forEach((b) => b.addEventListener('click', () => doc.modifica('Togli quota', () => d.quote.splice(+b.dataset.togliq, 1))));
    el.querySelector('[data-op=vista]').addEventListener('click', () => doc.modifica('Nuova vista', () => d.viste.push({ nome: `Vista ${d.viste.length + 1}`, ...app.scena.inquadraturaAttuale() })));
  }

  // ------------------------------------------------- scelta del palo
  async function scegliPalo() {
    const pali = Catalogo.dati.pali;
    let scelto = null;
    const r = await dialogo(`<h2>Scegli il palo</h2>
      <div class="griglia-cat">${pali.map((c) => `<button class="carta-cat" type="button" data-id="${esc(c.id)}"><b>${esc(c.nome)}</b><span>${Calcoli.num1(c.lunghezzaMm / 1000)} m · Ø ${c.diametroMm} mm · ${c.quantita} in magazzino</span></button>`).join('')}</div>
      <div class="piedi-dialogo"><button class="btn" value="catalogo" style="margin-right:auto">Modifica catalogo…</button><button class="btn" value="no">Annulla</button></div>`, {
      prepara: (f) => f.querySelectorAll('.carta-cat').forEach((b) => b.addEventListener('click', () => { scelto = Catalogo.palo(b.dataset.id); chiudiDialogo('ok'); })),
    });
    if (r === 'catalogo') return 'catalogo';
    return r === 'ok' ? scelto : null;
  }

  async function scegliLegatura() {
    let scelto = null;
    const r = await dialogo(`<h2>Tipo di legatura</h2>
      <div class="griglia-cat">${Catalogo.dati.legature.map((c) => `<button class="carta-cat" type="button" data-t="${esc(Catalogo.tipoLegatura(c.nome))}"><b>${esc(c.nome)}</b><span>Cordino Ø ${c.cordinoMm} mm · ${Calcoli.num1(c.base)} m + ${Calcoli.num1(c.k)} × (Ø1+Ø2)</span></button>`).join('')}</div>
      <div class="piedi-dialogo"><button class="btn" value="no">Annulla</button></div>`, {
      prepara: (f) => f.querySelectorAll('.carta-cat').forEach((b) => b.addEventListener('click', () => { scelto = b.dataset.t; chiudiDialogo('ok'); })),
    });
    return r === 'ok' ? scelto : null;
  }

  // -------------------------------------------------------- catalogo
  async function dialogoCatalogo(app) {
    const copia = JSON.parse(JSON.stringify(Catalogo.dati));
    let scheda = 'pali';
    const righe = {
      pali: (c, i) => `<tr><td><input data-k="nome" data-i="${i}" value="${esc(c.nome)}"></td><td><input data-k="lunghezzaMm" data-i="${i}" type="number" value="${c.lunghezzaMm}"></td><td><input data-k="diametroMm" data-i="${i}" type="number" value="${c.diametroMm}"></td><td><input data-k="quantita" data-i="${i}" type="number" value="${c.quantita}"></td><td><button class="btn piccolo pericolo" type="button" data-del="${i}">✕</button></td></tr>`,
      legature: (c, i) => `<tr><td><input data-k="nome" data-i="${i}" value="${esc(c.nome)}"></td><td><input data-k="cordinoMm" data-i="${i}" type="number" value="${c.cordinoMm}"></td><td><input data-k="base" data-i="${i}" type="number" step="0.1" value="${c.base}"></td><td><input data-k="k" data-i="${i}" type="number" step="0.5" value="${c.k}"></td><td><textarea data-k="istruzioni" data-i="${i}">${esc(c.istruzioni || '')}</textarea></td><td><button class="btn piccolo pericolo" type="button" data-del="${i}">✕</button></td></tr>`,
      cordini: (c, i) => `<tr><td><input data-k="diametroMm" data-i="${i}" type="number" value="${c.diametroMm}"></td><td><input data-k="lunghezzaM" data-i="${i}" type="number" step="0.5" value="${c.lunghezzaM}"></td><td><input data-k="quantita" data-i="${i}" type="number" value="${c.quantita}"></td><td><button class="btn piccolo pericolo" type="button" data-del="${i}">✕</button></td></tr>`,
    };
    const intestazioni = {
      pali: '<tr><th>Nome</th><th>Lunghezza mm</th><th>Ø mm</th><th>In magazzino</th><th></th></tr>',
      legature: '<tr><th>Tipo</th><th>Cordino Ø mm</th><th>Base m</th><th>× (Ø1+Ø2)</th><th>Istruzioni del nodo</th><th></th></tr>',
      cordini: '<tr><th>Ø mm</th><th>Lunghezza m</th><th>In magazzino</th><th></th></tr>',
    };
    const nuovo = {
      pali: () => ({ id: Catalogo.idNuovo('p'), nome: 'Nuovo palo', lunghezzaMm: 3000, diametroMm: 100, quantita: 1 }),
      legature: () => ({ id: Catalogo.idNuovo('l'), nome: 'Nuova', cordinoMm: 6, base: 0.8, k: 13, istruzioni: '' }),
      cordini: () => ({ id: Catalogo.idNuovo('c'), diametroMm: 6, lunghezzaM: 4, quantita: 1 }),
    };
    const disegna = (f) => {
      f.querySelector('#cat-corpo').innerHTML = `<table class="tab">${intestazioni[scheda]}${copia[scheda].map(righe[scheda]).join('')}</table>
        <div class="pulsanti"><button class="btn" type="button" id="cat-agg">+ Aggiungi</button></div>
        ${scheda === 'legature' ? '<p class="nota">Cordino per legatura = Base + coefficiente × (somma dei diametri dei due pali in metri), arrotondato ai 50 cm. Es. Quadra su due pali da 12 cm: 0,8 + 13 × 0,24 = 3,9 → 4 m.</p>' : ''}
        ${scheda === 'cordini' ? '<p class="nota">Ogni legatura usa il cordino più corto, dello stesso diametro, che basta: così il programma ti dice se ne avete abbastanza.</p>' : ''}`;
      f.querySelectorAll('.schede-cat button').forEach((b) => b.classList.toggle('on', b.dataset.s === scheda));
      f.querySelectorAll('#cat-corpo [data-k]').forEach((inp) => inp.addEventListener('change', () => {
        const v = inp.type === 'number' ? parseFloat(inp.value) || 0 : inp.value;
        copia[scheda][+inp.dataset.i][inp.dataset.k] = v;
      }));
      f.querySelectorAll('#cat-corpo [data-del]').forEach((b) => b.addEventListener('click', () => { copia[scheda].splice(+b.dataset.del, 1); disegna(f); }));
      f.querySelector('#cat-agg').addEventListener('click', () => { copia[scheda].push(nuovo[scheda]()); disegna(f); });
    };
    const r = await dialogo(`<h2>Catalogo</h2>
      <div class="schede-cat"><button type="button" data-s="pali">Pali</button><button type="button" data-s="legature">Legature</button><button type="button" data-s="cordini">Cordini</button></div>
      <div id="cat-corpo"></div>
      <div class="piedi-dialogo"><button class="btn" value="ripristina" style="margin-right:auto">Ripristina predefinito</button><button class="btn" value="no">Annulla</button><button class="btn primario" value="ok">Salva catalogo</button></div>`, {
      largo: true,
      prepara: (f) => {
        f.querySelectorAll('.schede-cat button').forEach((b) => b.addEventListener('click', () => { scheda = b.dataset.s; disegna(f); }));
        disegna(f);
      },
    });
    if (r === 'ripristina') {
      if (await conferma('Ripristinare il catalogo?', 'Torna al catalogo di partenza: le tue modifiche al catalogo andranno perse.', 'Ripristina')) {
        await app.salvaCatalogo(JSON.parse(JSON.stringify(Catalogo.PREDEFINITO)));
      }
      return;
    }
    if (r === 'ok') await app.salvaCatalogo(copia);
  }

  window.UI = {
    $, esc, avviso, suggerimento, dialogo, chiudiDialogo, conferma, campo,
    disegnaElenco, disegnaProprieta, disegnaDistinta, disegnaPassi, disegnaProgetto,
    scegliPalo, scegliLegatura, dialogoCatalogo, modificaPasso,
  };
})();
