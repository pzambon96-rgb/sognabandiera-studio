// Collegamento a Firebase: login amministratore, progetti dell'app, catalogo.
// L'SDK si scarica solo quando serve, così lo Studio funziona anche offline.
(function () {
  'use strict';
  const VERSIONE_SDK = '10.14.1';
  const CONFIG = {
    apiKey: 'AIzaSyDoye5jFOGlOdesLj-lh9y5Pj8vyON3vvw',
    authDomain: 'sognabandiera.firebaseapp.com',
    projectId: 'sognabandiera',
    storageBucket: 'sognabandiera.firebasestorage.app',
    messagingSenderId: '827598195490',
    appId: '1:827598195490:android:df407f1ca0f3dbba2c737b',
  };

  let pronto = null;
  let fb = null;

  function script(src) {
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Connessione a Firebase non riuscita: sei online?'));
      document.head.appendChild(s);
    });
  }

  function avvia() {
    if (!pronto) {
      pronto = (async () => {
        const base = `https://www.gstatic.com/firebasejs/${VERSIONE_SDK}/`;
        await script(base + 'firebase-app-compat.js');
        await Promise.all([script(base + 'firebase-auth-compat.js'), script(base + 'firebase-firestore-compat.js')]);
        fb = window.firebase;
        fb.initializeApp(CONFIG);
        await new Promise((ok) => { const stop = fb.auth().onAuthStateChanged(() => { stop(); ok(); }); });
        return fb;
      })();
      pronto.catch(() => { pronto = null; });
    }
    return pronto;
  }

  const messaggio = (e) => {
    const c = e && e.code;
    if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found') return 'Email o password errate.';
    if (c === 'auth/too-many-requests') return 'Troppi tentativi: riprova tra qualche minuto.';
    if (c === 'auth/network-request-failed') return 'Nessuna connessione a internet.';
    if (c === 'permission-denied') return 'Permesso negato: serve l\'account amministratore (e le regole aggiornate).';
    return (e && e.message) || String(e);
  };

  async function utente() {
    try { await avvia(); } catch (e) { return null; }
    return fb.auth().currentUser;
  }

  async function eAdmin() {
    const u = await utente();
    if (!u) return false;
    try { return (await fb.firestore().collection('admin').doc(u.uid).get()).exists; } catch (e) { return false; }
  }

  async function accedi(email, password) {
    await avvia();
    await fb.auth().signInWithEmailAndPassword(email.trim(), password);
    if (!(await eAdmin())) { await fb.auth().signOut(); throw new Error('Questo account non è amministratore.'); }
    return fb.auth().currentUser;
  }

  async function esci() { await avvia(); await fb.auth().signOut(); }

  async function richiediAdmin() {
    const u = await utente();
    if (!u) throw new Error('Accedi prima come amministratore (File → Accedi).');
  }

  async function elencoProgetti() {
    await richiediAdmin();
    const s = await fb.firestore().collection('progetti').get();
    return s.docs.map((d) => ({ id: d.id, titolo: d.get('titolo') || 'Senza titolo', pubblicato: !!d.get('pubblicato'), haModello: !!d.get('modelloJson') }))
      .sort((a, b) => a.titolo.localeCompare(b.titolo));
  }

  async function caricaModello(id) {
    await richiediAdmin();
    const d = await fb.firestore().collection('progetti').doc(id).get();
    if (!d.exists) throw new Error('Progetto non trovato.');
    const json = d.get('modelloJson');
    if (!json) throw new Error('Questo progetto non ha ancora un modello 3D: aprilo in un nuovo disegno e pubblicalo lì.');
    return JSON.parse(json);
  }

  /**
   * Pubblica il modello nel progetto dell'app (id null = nuovo progetto, in bozza).
   * Calcola pali, legature, misure e passi come fa l'app e conserva le foto già messe sui passi.
   */
  async function pubblica(id, modello) {
    await richiediAdmin();
    const c = Calcoli.crea(modello);
    const col = fb.firestore().collection('progetti');
    const ref = id ? col.doc(id) : col.doc();
    const prima = id ? await ref.get() : null;
    const vecchiePassi = (prima && prima.exists && prima.get('passi')) || [];
    const passi = c.passi().map((p, i) => ({ ...p, foto: (vecchiePassi[i] && vecchiePassi[i].foto) || null }));
    const dati = {
      modelloJson: JSON.stringify(modello),
      pali: c.pali(),
      legature: c.legature(),
      misure: c.misure(),
      passi,
      aggiornatoIl: fb.firestore.FieldValue.serverTimestamp(),
    };
    if (!prima || !prima.exists) {
      Object.assign(dati, {
        titolo: modello.titolo || 'Nuovo alzabandiera', descrizione: modello.descrizione || '',
        difficolta: 'media', persone: 0, tempoMinuti: 0, pubblicato: false, ordine: 0, foto: [], modello3d: null,
      });
    } else {
      if (!prima.get('titolo')) dati.titolo = modello.titolo;
      if (!prima.get('descrizione')) dati.descrizione = modello.descrizione || '';
    }
    await ref.set(dati, { merge: true });
    return ref.id;
  }

  async function leggiCatalogo() {
    await richiediAdmin();
    const d = await fb.firestore().collection('catalogo').doc('principale').get();
    return d.exists ? JSON.parse(d.get('json')) : null;
  }

  async function scriviCatalogo(catalogo) {
    await richiediAdmin();
    await fb.firestore().collection('catalogo').doc('principale').set({
      json: JSON.stringify(catalogo), aggiornatoIl: fb.firestore.FieldValue.serverTimestamp(),
    });
  }

  window.Cloud = { avvia, utente, eAdmin, accedi, esci, elencoProgetti, caricaModello, pubblica, leggiCatalogo, scriviCatalogo, messaggio };
})();
