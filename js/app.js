// Avvio dello Studio e collegamento tra documento, vista 3D e pannelli.
(function () {
  'use strict';
  const { $, avviso, suggerimento, dialogo, conferma, esc } = window.UI;
  const G = window.Geo;
  const BOZZA = 'sognabandiera-bozza';

  const doc = new Documento();
  const app = {
    doc,
    selezione: new Set(),
    scena: null,
    scheda: 'proprieta',
    modo: null,           // null | 'aggancia' | 'lega'
    fileHandle: null,     // file aperto sul PC (Chrome/Edge)
    nomeFile: null,
    idApp: null,          // progetto dell'app a cui è collegato
  };
  window.SognabandieraStudio = app; // comodo per le prove

  // -------------------------------------------------------- disegno UI
  function aggiornaTutto(motivo) {
    // toglie dalla selezione ciò che non esiste più
    app.selezione = new Set([...app.selezione].filter((id) => doc.oggetto(id)));
    app.scena.ricostruisci();
    app.scena.seleziona([...app.selezione]);
    UI.disegnaElenco(app);
    disegnaScheda();
    aggiornaStato();
    if (motivo !== 'carica') salvaBozza();
  }

  function disegnaScheda() {
    if (app.scheda === 'proprieta') UI.disegnaProprieta(app);
    if (app.scheda === 'distinta') UI.disegnaDistinta(app);
    if (app.scheda === 'passi') UI.disegnaPassi(app);
    if (app.scheda === 'progetto') UI.disegnaProgetto(app);
  }

  function aggiornaStato() {
    const t = doc.dati.titolo || 'Senza titolo';
    $('#stato').textContent = `${doc.modificato ? '● ' : ''}${t}${app.nomeFile ? ' — ' + app.nomeFile : ''}${app.idApp ? ' — collegato all\'app' : ''}`;
    document.title = `${doc.modificato ? '● ' : ''}${t} · Sognabandiera Studio`;
    document.querySelector('[data-az=annulla]').disabled = !doc.annullabili.length;
    document.querySelector('[data-az=ripeti]').disabled = !doc.ripetibili.length;
    document.querySelector('[data-az=annulla]').title = doc.annullabili.length ? `Annulla: ${doc.annullabili[doc.annullabili.length - 1].etichetta} (Ctrl+Z)` : 'Annulla (Ctrl+Z)';
  }

  function seleziona(ids, { aggiungi = false } = {}) {
    if (aggiungi) ids.forEach((id) => (app.selezione.has(id) ? app.selezione.delete(id) : app.selezione.add(id)));
    else app.selezione = new Set(ids);
    app.scena.seleziona([...app.selezione]);
    UI.disegnaElenco(app);
    if (app.scheda !== 'proprieta' && app.selezione.size) mostraScheda('proprieta');
    else disegnaScheda();
  }

  function mostraScheda(nome) {
    app.scheda = nome;
    document.querySelectorAll('.schede button').forEach((b) => b.classList.toggle('on', b.dataset.scheda === nome));
    document.querySelectorAll('.scheda').forEach((s) => s.classList.toggle('on', s.id === 'scheda-' + nome));
    disegnaScheda();
  }

  // ---------------------------------------------------------- bozza
  let timerBozza = null;
  function salvaBozza() {
    clearTimeout(timerBozza);
    timerBozza = setTimeout(() => {
      try { localStorage.setItem(BOZZA, JSON.stringify({ dati: doc.dati, nomeFile: app.nomeFile, idApp: app.idApp, quando: Date.now() })); } catch (e) { /* ignora */ }
    }, 400);
  }

  // ------------------------------------------------------------ azioni
  const selezionati = () => [...app.selezione].map((id) => doc.oggetto(id)).filter(Boolean);
  const paliSelezionati = () => selezionati().filter((o) => o.forma === 'palo');

  function impostaModo(modo, testo) {
    app.modo = modo;
    suggerimento(testo || null);
    $('#b-aggancia').classList.toggle('attivo', modo === 'aggancia');
    app.scena.renderer.domElement.style.cursor = modo ? 'crosshair' : '';
  }

  function impostaGizmo(modo) {
    const nuovo = app.scena.modoGizmo === modo ? null : modo;
    app.scena.impostaGizmo(nuovo);
    $('#b-sposta').classList.toggle('attivo', nuovo === 'translate');
    $('#b-ruota').classList.toggle('attivo', nuovo === 'rotate');
    if (nuovo && !app.selezione.size) avviso('Seleziona prima un pezzo.');
    if (nuovo === 'rotate' && app.selezione.size > 1) avviso('Per ruotare seleziona un solo palo.');
  }

  const azioni = {
    async nuovo() {
      if (doc.modificato && !(await conferma('Nuovo progetto?', 'Le modifiche non salvate andranno perse.', 'Nuovo'))) return;
      app.fileHandle = null; app.nomeFile = null; app.idApp = null;
      doc.nuovo();
      app.scena.vista('3d');
    },
    async apri() {
      if (doc.modificato && !(await conferma('Aprire un altro file?', 'Le modifiche non salvate andranno perse.', 'Apri'))) return;
      if (window.showOpenFilePicker) {
        try {
          const [h] = await window.showOpenFilePicker({ types: [{ description: 'Modello Sognabandiera', accept: { 'application/json': ['.json'] } }] });
          const testo = await (await h.getFile()).text();
          apriTesto(testo, h.name, h);
        } catch (e) { if (e.name !== 'AbortError') avviso('Impossibile aprire il file: ' + e.message, 5000); }
      } else {
        $('#file-apri').click();
      }
    },
    async salva() { await salvaFile(false); },
    async salvaCome() { await salvaFile(true); },
    async apriApp() { await apriDallApp(); },
    async pubblica() { await pubblicaNellApp(); },
    async catalogo() { await UI.dialogoCatalogo(app); },
    async accedi() { await dialogoAccedi(); },

    async nuovoPalo() {
      const voce = await UI.scegliPalo();
      if (voce === 'catalogo') { await UI.dialogoCatalogo(app); return; }
      if (!voce) return;
      const p = doc.aggiungiPalo(voce);
      seleziona([p.id]);
      avviso(`${voce.nome} aggiunto. Posizionalo dalle proprietà o con Sposta/Ruota.`);
    },
    async lega() {
      const pali = paliSelezionati();
      if (pali.length === 2) {
        const tipo = await UI.scegliLegatura();
        if (!tipo) return;
        try {
          const l = doc.lega(pali[0].id, pali[1].id, tipo);
          seleziona([l.id]);
          if (doc.staccata(l)) avviso('Legatura creata, ma i due pali non si toccano: è segnata in rosso.', 4500);
          else if (l._accostato) avviso('Legato. Il secondo palo è stato accostato al primo, così si toccano in superficie.', 4500);
          delete l._accostato;
        } catch (e) { avviso(e.message); }
      } else if (pali.length === 1) {
        app._daLegare = pali[0].id;
        impostaModo('lega', 'Clicca il palo da legare (Esc per annullare)');
      } else {
        avviso('Seleziona due pali (Ctrl+clic) oppure uno e poi clicca l\'altro.');
      }
    },
    tirante() {
      const pali = paliSelezionati();
      if (pali.length !== 1) return avviso('Seleziona un palo: il tirante parte dalla sua punta più alta.');
      const c = doc.tirante(pali[0].id);
      seleziona([c.id]);
    },
    asse() { const a = doc.aggiungiAsse(); seleziona([a.id]); },
    modoSposta() { impostaGizmo('translate'); },
    modoRuota() { impostaGizmo('rotate'); },
    aggancia() {
      const s = selezionati().filter((o) => o.a || o.p);
      if (s.length !== 1) return avviso('Seleziona un solo pezzo da agganciare.');
      if (app.modo === 'aggancia') return impostaModo(null);
      impostaModo('aggancia', 'Clicca dove mettere la base: su un palo (si aggancia alle estremità vicine) o a terra. Esc per annullare');
    },
    duplica() {
      if (!app.selezione.size) return avviso('Seleziona cosa duplicare.');
      const nuovi = doc.duplica([...app.selezione]);
      seleziona(nuovi);
      avviso('Duplicato 50 cm più a destra.');
    },
    async elimina() {
      if (!app.selezione.size) return;
      const n = app.selezione.size;
      doc.elimina([...app.selezione]);
      app.selezione.clear();
      aggiornaTutto();
      avviso(`${n === 1 ? 'Eliminato' : `Eliminati ${n} pezzi`}. Ctrl+Z per annullare.`);
    },
    annulla() { const e = doc.annulla(); if (e) avviso('Annullato: ' + e); },
    ripeti() { const e = doc.ripeti(); if (e) avviso('Ripetuto: ' + e); },
  };
  app.anteprima = anteprima;

  // --------------------------------------------------- clic nel 3D
  function clicNelloSpazio(e) {
    const h = app.scena.sotto(e);
    if (app.modo === 'aggancia') return eseguiAggancio(h);
    if (app.modo === 'lega') {
      const p2 = h && h.id && doc.pezzo(h.id);
      if (!p2 || p2.forma !== 'palo' || p2.id === app._daLegare) return avviso('Clicca un altro palo.');
      impostaModo(null);
      app.selezione = new Set([app._daLegare, p2.id]);
      return azioni.lega();
    }
    if (!h || h.terreno) { if (!e.ctrlKey && !e.shiftKey) seleziona([]); return; }
    seleziona([h.id], { aggiungi: e.ctrlKey || e.shiftKey || e.metaKey });
  }

  function eseguiAggancio(h) {
    const o = selezionati()[0];
    if (!o || !h) return;
    let punto = h.terreno || h.punto;
    let dove = h.terreno ? 'a terra' : 'sul palo';
    if (h.id) {
      // aggancio alle estremità dei pali vicine (entro 25 cm)
      let migliore = null;
      doc.dati.pezzi.filter((p) => p.forma === 'palo' && p.id !== o.id).forEach((p) => [p.a, p.b].forEach((q) => {
        const d = G.distanza(q, punto);
        if (d < 0.25 && (!migliore || d < migliore.d)) migliore = { d, q };
      }));
      if (migliore) { punto = migliore.q; dove = "all'estremità del palo"; }
    }
    impostaModo(null);
    doc.modifica('Aggancia', () => {
      if (o.forma === 'palo' || o.forma === 'asse') Documento.applicaAssetto(o, { a: punto });
      else if (o.forma === 'corda') o.a = G.arr3(punto);
      else if (o.p) o.p = G.arr3(punto);
    });
    avviso(`Base agganciata ${dove}.`);
  }

  // ------------------------------------------------- frecce e anelli
  function fineGizmo(fase, info) {
    if (fase === 'durante') {
      if (info.tipo === 'sposta') suggerimento(`X ${Math.round(info.pos[0] * 1000)}  Y ${Math.round(info.pos[1] * 1000)}  Z ${Math.round(info.pos[2] * 1000)} mm   (Δ ${Math.round(info.delta[0] * 1000)}, ${Math.round(info.delta[1] * 1000)}, ${Math.round(info.delta[2] * 1000)})`);
      else suggerimento(`Inclinazione ${info.inclinazione.toFixed(1)}°   Direzione ${info.direzione.toFixed(1)}°`);
      return;
    }
    suggerimento(null);
    const { pezzi, dPos, dRot, modo } = info;
    if (modo === 'rotate') {
      const p = pezzi[0];
      const T = window.THREE;
      const dir = new T.Vector3(...G.sottrai(p.b, p.a)).applyQuaternion(dRot);
      const ang = G.angoliDaDir([dir.x, dir.y, dir.z]);
      doc.modifica('Ruota', () => Documento.applicaAssetto(p, { inclinazione: Math.round(ang.inclinazione * 10) / 10, direzione: Math.round(ang.direzione * 10) / 10 }));
    } else if (dPos.lengthSq() > 1e-10) {
      doc.sposta(pezzi.map((p) => p.id), [dPos.x, dPos.y, dPos.z].map((v) => Math.round(v * 1000) / 1000));
    } else {
      aggiornaTutto();
    }
  }

  // --------------------------------------------------------- anteprima
  function anteprima(n) {
    const tot = doc.dati.passi.length;
    if (!tot) return avviso('Aggiungi prima dei passi.');
    app.scena.impostaGizmo(null);
    const box = $('#anteprima-passo');
    box.hidden = false;
    const cur = $('#ap-cursore');
    cur.max = tot; cur.value = n;
    const mostra = (k) => {
      const p = doc.dati.passi[k - 1];
      $('#ap-testo').textContent = `Passo ${k} di ${tot}: ${p.titolo}`;
      app.scena.anteprima(k);
    };
    cur.oninput = () => mostra(+cur.value);
    mostra(n);
  }
  function chiudiAnteprima() {
    $('#anteprima-passo').hidden = true;
    app.scena.anteprima(null);
  }

  // ------------------------------------------------------------- file
  function apriTesto(testo, nome, handle) {
    try {
      doc.carica(JSON.parse(testo));
      app.fileHandle = handle || null;
      app.nomeFile = nome || null;
      app.idApp = null;
      app.selezione.clear();
      aggiornaTutto('carica');
      vistaIniziale();
      avviso(`Aperto: ${doc.dati.titolo}`);
    } catch (e) {
      avviso('Il file non è un modello Sognabandiera valido.', 5000);
    }
  }

  function vistaIniziale() {
    const v = doc.dati.viste[0];
    if (v) app.scena.vai(v.camera, v.target); else app.scena.vista('3d');
  }

  async function salvaFile(chiedi) {
    const testo = JSON.stringify(doc.esporta(), null, 1);
    const nomeSuggerito = (Documento.slug(doc.dati.titolo) || 'alzabandiera') + '.json';
    if (window.showSaveFilePicker) {
      try {
        if (!app.fileHandle || chiedi) {
          app.fileHandle = await window.showSaveFilePicker({ suggestedName: app.nomeFile || nomeSuggerito, types: [{ description: 'Modello Sognabandiera', accept: { 'application/json': ['.json'] } }] });
          app.nomeFile = app.fileHandle.name;
        }
        const w = await app.fileHandle.createWritable();
        await w.write(testo); await w.close();
        doc.modificato = false; aggiornaStato(); salvaBozza();
        avviso(`Salvato: ${app.nomeFile}`);
      } catch (e) { if (e.name !== 'AbortError') avviso('Salvataggio non riuscito: ' + e.message, 5000); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
    a.download = app.nomeFile || nomeSuggerito;
    a.click();
    URL.revokeObjectURL(a.href);
    doc.modificato = false; aggiornaStato();
    avviso('File scaricato nella cartella Download.');
  }

  // ------------------------------------------------------- Firebase
  async function dialogoAccedi() {
    const u = await Cloud.utente().catch(() => null);
    if (u) {
      const r = await dialogo(`<h2>Account</h2><p>Hai fatto l'accesso come <b>${esc(u.email)}</b>.</p>
        <div class="piedi-dialogo"><button class="btn" value="esci">Esci</button><button class="btn primario" value="ok">Ok</button></div>`);
      if (r === 'esci') { await Cloud.esci(); aggiornaVoceAccedi(); avviso('Uscito.'); }
      return true;
    }
    const r = await dialogo(`<h2>Accesso amministratore</h2>
      <p class="nota">Lo stesso account che usi in Sognabandiera Admin.</p>
      ${UI.campo('Email', '<input name="email" type="email" autocomplete="username">')}
      ${UI.campo('Password', '<input name="password" type="password" autocomplete="current-password">')}
      <div class="piedi-dialogo"><button class="btn" value="no">Annulla</button><button class="btn primario" value="ok">Accedi</button></div>`, {
      prepara: (f) => f.querySelector('[name=password]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); UI.chiudiDialogo('ok'); } }),
    });
    if (r !== 'ok') return false;
    const f = $('#dialogo-form');
    try {
      avviso('Accesso in corso…');
      await Cloud.accedi(f.querySelector('[name=email]').value, f.querySelector('[name=password]').value);
      aggiornaVoceAccedi();
      avviso('Accesso eseguito.');
      sincronizzaCatalogo();
      return true;
    } catch (e) {
      avviso(Cloud.messaggio(e), 5000);
      return false;
    }
  }

  async function aggiornaVoceAccedi() {
    const u = await Cloud.utente().catch(() => null);
    $('#voce-accedi').textContent = u ? `Account: ${u.email}…` : 'Accedi come amministratore…';
  }

  async function assicuraAccesso() {
    const u = await Cloud.utente().catch(() => null);
    return u ? true : dialogoAccedi();
  }

  async function apriDallApp() {
    if (!(await assicuraAccesso())) return;
    let lista;
    try { lista = await Cloud.elencoProgetti(); } catch (e) { return avviso(Cloud.messaggio(e), 5000); }
    let scelto = null;
    const r = await dialogo(`<h2>Apri dall'app</h2>
      <div class="griglia-cat">${lista.map((p) => `<button class="carta-cat" type="button" data-id="${esc(p.id)}"${p.haModello ? '' : ' disabled style="opacity:.5"'}><b>${esc(p.titolo)}</b><span>${p.pubblicato ? 'Pubblicato' : 'Bozza'} · ${p.haModello ? 'con modello 3D' : 'senza modello'}</span></button>`).join('') || '<p>Nessun progetto.</p>'}</div>
      <div class="piedi-dialogo"><button class="btn" value="no">Annulla</button></div>`, {
      largo: true,
      prepara: (f) => f.querySelectorAll('.carta-cat:not([disabled])').forEach((b) => b.addEventListener('click', () => { scelto = b.dataset.id; UI.chiudiDialogo('ok'); })),
    });
    if (r !== 'ok' || !scelto) return;
    if (doc.modificato && !(await conferma('Aprire il progetto?', 'Le modifiche non salvate andranno perse.', 'Apri'))) return;
    try {
      doc.carica(await Cloud.caricaModello(scelto));
      app.idApp = scelto; app.fileHandle = null; app.nomeFile = null;
      app.selezione.clear();
      aggiornaTutto('carica');
      vistaIniziale();
      avviso('Aperto dall\'app.');
    } catch (e) { avviso(Cloud.messaggio(e), 6000); }
  }

  async function pubblicaNellApp() {
    if (!(await assicuraAccesso())) return;
    const staccate = doc.dati.legature.filter((l) => doc.staccata(l)).length;
    let destinazione = app.idApp;
    let lista = [];
    try { lista = await Cloud.elencoProgetti(); } catch (e) { return avviso(Cloud.messaggio(e), 5000); }
    const opz = `<option value="">Nuovo progetto (in bozza)</option>${lista.map((p) => `<option value="${esc(p.id)}"${p.id === destinazione ? ' selected' : ''}>${esc(p.titolo)}${p.pubblicato ? '' : ' (bozza)'}</option>`).join('')}`;
    const r = await dialogo(`<h2>Pubblica nell'app</h2>
      ${staccate ? `<div class="box-avviso">Attenzione: ${staccate} legature uniscono pali che non si toccano.</div>` : ''}
      ${UI.campo('Progetto', `<select name="dest">${opz}</select>`)}
      <p class="nota">Il modello 3D, i pali, le legature, le misure e i passi del progetto vengono sostituiti con quelli calcolati qui. Titolo, foto, difficoltà e foto dei passi restano come sono. Un progetto nuovo resta in bozza finché non lo pubblichi dall'app Admin.</p>
      <div class="piedi-dialogo"><button class="btn" value="no">Annulla</button><button class="btn primario" value="ok">Pubblica</button></div>`);
    if (r !== 'ok') return;
    destinazione = $('#dialogo-form [name=dest]').value || null;
    try {
      avviso('Pubblicazione in corso…');
      app.idApp = await Cloud.pubblica(destinazione, doc.esporta());
      aggiornaStato();
      avviso('Pubblicato: l\'app è aggiornata.', 4000);
    } catch (e) { avviso(Cloud.messaggio(e), 6000); }
  }

  /** Catalogo: dopo il login, quello su Firebase vince; se non c'è, si carica il locale. */
  async function sincronizzaCatalogo() {
    try {
      const remoto = await Cloud.leggiCatalogo();
      if (remoto) { Catalogo.imposta(remoto); doc.ricalcolaLegature(); aggiornaTutto(); }
      else await Cloud.scriviCatalogo(Catalogo.dati);
    } catch (e) { /* senza permessi sul catalogo resta quello locale */ }
  }

  app.salvaCatalogo = async (nuovo) => {
    Catalogo.imposta(nuovo);
    doc.ricalcolaLegature();
    aggiornaTutto();
    const u = await Cloud.utente().catch(() => null);
    if (u) {
      try { await Cloud.scriviCatalogo(nuovo); avviso('Catalogo salvato anche online.'); }
      catch (e) { avviso('Catalogo salvato su questo PC (online: ' + Cloud.messaggio(e) + ')', 6000); }
    } else avviso('Catalogo salvato su questo PC.');
  };

  // ----------------------------------------------------------- avvio
  function avvio() {
    app.scena = new Scena($('#vista'), doc);
    app.scena.callbackGizmo = fineGizmo;
    doc.quandoCambia(aggiornaTutto);
    Catalogo.quandoCambia(() => { if (app.scheda === 'distinta') disegnaScheda(); });

    // pulsanti con data-az ovunque (barra, menu, pannelli)
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-az]');
      if (b && azioni[b.dataset.az]) { chiudiMenu(); azioni[b.dataset.az](); return; }
      const v = e.target.closest('#elenco [data-id], #scheda-proprieta [data-id]');
      if (v) seleziona([v.dataset.id], { aggiungi: e.ctrlKey || e.shiftKey });
      if (!e.target.closest('.gruppo-menu')) chiudiMenu();
    });
    document.querySelectorAll('.menu').forEach((m) => m.addEventListener('click', () => {
      const t = $('#menu-' + m.dataset.menu); const on = !t.classList.contains('aperta');
      chiudiMenu(); t.classList.toggle('aperta', on); m.classList.toggle('aperto', on);
    }));
    document.querySelectorAll('.schede button').forEach((b) => b.addEventListener('click', () => mostraScheda(b.dataset.scheda)));
    document.querySelectorAll('#viste-rapide button').forEach((b) => b.addEventListener('click', () => app.scena.vista(b.dataset.vista === 'centra' ? '3d' : b.dataset.vista)));
    $('#cerca').addEventListener('input', () => UI.disegnaElenco(app));
    $('#ap-chiudi').addEventListener('click', chiudiAnteprima);
    $('#file-apri').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      apriTesto(await f.text(), f.name, null); e.target.value = '';
    });

    // clic nel 3D (distinto dal trascinamento della vista)
    const canvas = app.scena.renderer.domElement;
    let giu = null;
    canvas.addEventListener('pointerdown', (e) => { giu = { x: e.clientX, y: e.clientY, b: e.button }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!giu || giu.b !== 0 || Math.hypot(e.clientX - giu.x, e.clientY - giu.y) > 5) return;
      if (app.scena.gizmo.dragging || app.scena.gizmo.axis) return;
      if (app.scena.passoAnteprima != null) return;
      clicNelloSpazio(e);
    });

    document.addEventListener('keydown', tastiera);
    window.addEventListener('beforeunload', (e) => { if (doc.modificato) { e.preventDefault(); e.returnValue = ''; } });

    // bozza dell'ultima sessione
    let bozza = null;
    try { bozza = JSON.parse(localStorage.getItem(BOZZA) || 'null'); } catch (e) { /* ignora */ }
    const params = new URLSearchParams(location.search);
    if (params.get('esempio')) {
      fetch(params.get('esempio')).then((r) => r.text()).then((t) => apriTesto(t, params.get('esempio').split('/').pop()));
    } else if (bozza && bozza.dati) {
      try {
        doc.carica(bozza.dati);
        app.nomeFile = bozza.nomeFile; app.idApp = bozza.idApp;
        doc.modificato = true;
        aggiornaTutto('carica');
        vistaIniziale();
        avviso('Ho riaperto il lavoro dell\'ultima volta.');
      } catch (e) { doc.nuovo(); }
    } else {
      aggiornaTutto('carica');
      app.scena.vista('3d');
    }
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  function chiudiMenu() {
    document.querySelectorAll('.tendina').forEach((t) => t.classList.remove('aperta'));
    document.querySelectorAll('.menu').forEach((m) => m.classList.remove('aperto'));
  }

  function tastiera(e) {
    const inCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || $('#dialogo').open;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 's') { e.preventDefault(); return e.shiftKey ? azioni.salvaCome() : azioni.salva(); }
    if (ctrl && k === 'o') { e.preventDefault(); return azioni.apri(); }
    if (inCampo) return;
    if (ctrl && k === 'n') { e.preventDefault(); return azioni.nuovo(); }
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); return azioni.annulla(); }
    if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); return azioni.ripeti(); }
    if (ctrl && k === 'd') { e.preventDefault(); return azioni.duplica(); }
    if (ctrl && k === 'a') { e.preventDefault(); return seleziona([...doc.dati.pezzi.map((p) => p.id)]); }
    if (ctrl) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); return azioni.elimina(); }
    if (k === 'escape') { if (app.modo) return impostaModo(null); if (!$('#anteprima-passo').hidden) return chiudiAnteprima(); if (app.scena.modoGizmo) return impostaGizmo(app.scena.modoGizmo); return seleziona([]); }
    const tasti = { p: 'nuovoPalo', l: 'lega', t: 'tirante', a: 'asse', g: 'modoSposta', r: 'modoRuota', k: 'aggancia' };
    if (tasti[k]) { e.preventDefault(); return azioni[tasti[k]](); }
    if (k === 'f') return app.scena.vista('3d');
    if (k === '1') return app.scena.vista('fronte');
    if (k === '3') return app.scena.vista('lato');
    if (k === '7') return app.scena.vista('alto');
  }

  window.addEventListener('DOMContentLoaded', avvio);
})();
