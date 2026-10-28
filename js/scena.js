// Vista 3D dello Studio: disegna il documento, gestisce selezione,
// frecce/anelli per spostare e ruotare, viste e anteprima dei passi.
(function () {
  'use strict';
  const T = window.THREE;
  const G = window.Geo;
  const V = (a) => new T.Vector3(a[0], a[1], a[2]);
  const UP = new T.Vector3(0, 1, 0);

  const LEGNI = [0xc9a468, 0xbf985a, 0xd1ae74, 0xc49d60, 0xcca66a];

  class Scena {
    constructor(contenitore, doc) {
      this.el = contenitore;
      this.doc = doc;
      this.oggetti = new Map();   // id → Object3D
      this.selezione = new Set();
      this.passoAnteprima = null;
      this.etichette = [];
      this.callbackGizmo = null;  // (fase, info) dall'interfaccia

      const r = this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      contenitore.appendChild(r.domElement);

      const s = this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(40, 1, 0.05, 500);
      this.camera.position.set(9, 6, 12);
      this.orbita = new T.OrbitControls(this.camera, r.domElement);
      this.orbita.enableDamping = true;
      this.orbita.dampingFactor = 0.12;
      this.orbita.maxPolarAngle = Math.PI * 0.499;
      this.orbita.target.set(0, 2, 0);
      // tasto destro = sposta la vista, rotella = zoom (come nei CAD)
      this.orbita.mouseButtons = { LEFT: T.MOUSE.ROTATE, MIDDLE: T.MOUSE.PAN, RIGHT: T.MOUSE.PAN };

      s.add(new T.HemisphereLight(0xe8f0ff, 0x5a6a35, 0.85));
      const sole = new T.DirectionalLight(0xfff2da, 0.9);
      sole.position.set(-10, 18, 12);
      sole.castShadow = true;
      sole.shadow.mapSize.set(2048, 2048);
      Object.assign(sole.shadow.camera, { left: -16, right: 16, top: 18, bottom: -10, near: 1, far: 80 });
      sole.shadow.bias = -0.0005;
      s.add(sole);

      this.terreno = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshLambertMaterial({ color: 0x86a44f }));
      this.terreno.rotation.x = -Math.PI / 2;
      this.terreno.receiveShadow = true;
      this.terreno.userData.terreno = true;
      s.add(this.terreno);
      const g1 = new T.GridHelper(40, 40, 0x56702c, 0x6d8a3c);   // 1 m
      g1.position.y = 0.003; g1.material.transparent = true; g1.material.opacity = 0.55;
      const g2 = new T.GridHelper(40, 400, 0x7b9748, 0x7b9748); // 10 cm
      g2.position.y = 0.002; g2.material.transparent = true; g2.material.opacity = 0.18;
      s.add(g1, g2);
      const assi = new T.AxesHelper(1.2); assi.position.y = 0.006; s.add(assi);

      this.gruppo = new T.Group();
      s.add(this.gruppo);

      // frecce e anelli di spostamento/rotazione
      this.pivot = new T.Object3D();
      s.add(this.pivot);
      const tc = this.gizmo = new T.TransformControls(this.camera, r.domElement);
      tc.setSize(0.9);
      tc.setTranslationSnap(0.01);
      tc.setRotationSnap(T.MathUtils.degToRad(1));
      tc.setSpace('world');
      tc.addEventListener('dragging-changed', (e) => {
        this.orbita.enabled = !e.value;
        if (e.value) this._inizioGizmo(); else this._fineGizmo();
      });
      tc.addEventListener('objectChange', () => this._durataGizmo());
      s.add(tc);
      this.modoGizmo = null;

      this.ray = new T.Raycaster();
      this.ray.params.Line.threshold = 0.05;

      new ResizeObserver(() => this.ridimensiona()).observe(contenitore);
      this.ridimensiona();
      const ciclo = () => {
        requestAnimationFrame(ciclo);
        this.orbita.update();
        r.render(s, this.camera);
        this._aggiornaEtichette();
      };
      ciclo();
    }

    ridimensiona() {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    // ------------------------------------------------------- costruzione
    _materialeLegno(o, i) {
      const col = o.colore ? new T.Color(o.colore) : new T.Color(LEGNI[i % LEGNI.length]);
      return new T.MeshStandardMaterial({ color: col, roughness: 0.85 });
    }

    _cilindro(a, b, r, mat) {
      const d = b.clone().sub(a), len = d.length() || 0.001;
      const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 18), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(UP, d.normalize());
      m.castShadow = true; m.receiveShadow = true;
      return m;
    }

    _persona(o) {
      const sc = (o.altezza || 1.75) / 1.75;
      const shirt = new T.MeshStandardMaterial({ color: 0x7fa6d8, roughness: 0.9 });
      const navy = new T.MeshStandardMaterial({ color: 0x1f2d4a, roughness: 0.9 });
      const skin = new T.MeshStandardMaterial({ color: 0xd9a882, roughness: 0.9 });
      const P = new T.Group(); P.position.copy(V(o.p)); P.scale.setScalar(sc);
      const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; P.add(m); };
      add(new T.CylinderGeometry(0.07, 0.06, 0.5, 10), skin, -0.1, 0.25, 0); add(new T.CylinderGeometry(0.07, 0.06, 0.5, 10), skin, 0.1, 0.25, 0);
      add(new T.CylinderGeometry(0.2, 0.19, 0.36, 14), navy, 0, 0.68, 0);
      add(new T.CylinderGeometry(0.21, 0.2, 0.56, 14), shirt, 0, 1.14, 0);
      add(new T.SphereGeometry(0.12, 16, 12), skin, 0, 1.63, 0);
      return P;
    }

    _texBandiera(kind) {
      const cv = document.createElement('canvas'); cv.width = 192; cv.height = 128; const c = cv.getContext('2d');
      if (kind === 'it') ['#009246', '#ffffff', '#ce2b37'].forEach((col, i) => { c.fillStyle = col; c.fillRect(i * 64, 0, 64, 128); });
      else if (kind === 'eu') { c.fillStyle = '#003399'; c.fillRect(0, 0, 192, 128); c.fillStyle = '#ffcc00'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.arc(96 + Math.cos(a) * 41, 64 + Math.sin(a) * 41, 6, 0, 7); c.fill(); } }
      else if (kind && kind.indexOf('tinta:') === 0) { c.fillStyle = kind.slice(6); c.fillRect(0, 0, 192, 128); }
      else { c.fillStyle = '#2f64b8'; c.fillRect(0, 0, 192, 128); c.fillStyle = '#f2c230'; c.font = 'bold 90px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⚜︎', 96, 70); }
      return new T.CanvasTexture(cv);
    }

    _oggettoPer(o, i) {
      switch (o.forma) {
        case 'palo': return this._cilindro(V(o.a), V(o.b), o.d / 2, this._materialeLegno(o, i));
        case 'corda': return this._cilindro(V(o.a), V(o.b), (o.d || 0.022) / 2, new T.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 1 }));
        case 'asse': {
          const a = V(o.a), b = V(o.b), d = b.clone().sub(a);
          const m = new T.Mesh(new T.BoxGeometry(d.length() || 0.01, o.spessore || 0.05, o.larghezza || 0.2),
            new T.MeshStandardMaterial({ color: o.colore ? new T.Color(o.colore) : 0xdcc58a, roughness: 0.9 }));
          m.position.copy(a).add(b).multiplyScalar(0.5);
          m.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), d.normalize());
          m.castShadow = true; m.receiveShadow = true;
          return m;
        }
        case 'picchetto': {
          const m = new T.Mesh(new T.CylinderGeometry(0.03, 0.02, 0.4, 8), new T.MeshStandardMaterial({ color: o.colore ? new T.Color(o.colore) : 0x8c6b3c }));
          m.position.copy(V(o.p)); m.castShadow = true; return m;
        }
        case 'sfera': { const m = new T.Mesh(new T.SphereGeometry(o.r || 0.05, 12, 8), this._materialeLegno(o, i)); m.position.copy(V(o.p)); return m; }
        case 'anello': {
          const m = new T.Mesh(new T.RingGeometry(0.1, 0.16, 20), new T.MeshBasicMaterial({ color: 0x5a3d1a, side: T.DoubleSide }));
          m.rotation.x = -Math.PI / 2; m.position.copy(V(o.p)); return m;
        }
        case 'linee': {
          const geo = new T.BufferGeometry().setFromPoints(o.punti.map(V));
          const mat = new T.LineBasicMaterial({ color: new T.Color(o.colore || '#ffffff'), transparent: !!o.opacita, opacity: o.opacita || 1 });
          return o.chiusa ? new T.LineLoop(geo, mat) : o.spezzata ? new T.Line(geo, mat) : new T.LineSegments(geo, mat);
        }
        case 'bandiera': {
          const geo = new T.PlaneGeometry(o.larghezza, o.altezza); geo.translate(o.larghezza / 2, -o.altezza / 2, 0);
          const m = new T.Mesh(geo, new T.MeshStandardMaterial({ map: this._texBandiera(o.disegno), side: T.DoubleSide }));
          const g = new T.Group(); g.position.copy(V(o.p)); g.rotation.y = o.rotY || 0; g.add(m); return g;
        }
        case 'persona': return this._persona(o);
        default: return null;
      }
    }

    _fasce(l) {
      const g = new T.Group();
      const staccata = this.doc.staccata(l);
      const mat = new T.MeshStandardMaterial({ color: staccata ? 0xd23a2a : 0xf2f1ea, roughness: 1, emissive: staccata ? 0x400000 : 0 });
      const fascia = (p, asse, r) => {
        const m = new T.Mesh(new T.CylinderGeometry(1, 1, l.lunghezza || 0.18, 16), mat);
        const y = V(asse).normalize();
        if (l.ellisse) {
          const x = V(l.verso || [1, 0, 0]); x.sub(y.clone().multiplyScalar(x.dot(y))).normalize();
          const z = new T.Vector3().crossVectors(x, y);
          m.matrixAutoUpdate = false;
          m.matrix.makeBasis(x.multiplyScalar(l.ellisse[0]), y, z.multiplyScalar(l.ellisse[1])).setPosition(V(p));
        } else {
          m.position.copy(V(p)); m.quaternion.setFromUnitVectors(UP, y); m.scale.set(r, 1, r);
        }
        m.castShadow = true;
        return m;
      };
      if (l.p && l.asse) g.add(fascia(l.p, l.asse, (l.d / 2) * 1.32));
      if (l.p2 && l.asse2) g.add(fascia(l.p2, l.asse2, ((l.d2 || l.d) / 2) * 1.32));
      return g;
    }

    ricostruisci() {
      this.gizmo.detach();
      while (this.gruppo.children.length) {
        const c = this.gruppo.children.pop();
        c.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }
      this.oggetti.clear();
      this.etichette.forEach((e) => e.el.remove());
      this.etichette = [];
      const d = this.doc.dati;
      d.pezzi.forEach((o, i) => {
        const obj = this._oggettoPer(o, i);
        if (!obj) return;
        obj.userData.id = o.id;
        obj.traverse((c) => { c.userData.id = o.id; });
        this.gruppo.add(obj);
        this.oggetti.set(o.id, obj);
      });
      d.legature.forEach((l) => {
        const obj = this._fasce(l);
        obj.traverse((c) => { c.userData.id = l.id; });
        this.gruppo.add(obj);
        this.oggetti.set(l.id, obj);
      });
      const matQ = new T.LineBasicMaterial({ color: 0x16253a });
      (d.quote || []).forEach((q) => {
        const a = V(q.a), b = V(q.b), t = q.tacca ? V(q.tacca) : new T.Vector3(0, 0.12, 0);
        const linee = new T.LineSegments(new T.BufferGeometry().setFromPoints([a, b, a.clone().sub(t), a.clone().add(t), b.clone().sub(t), b.clone().add(t)]), matQ);
        this.gruppo.add(linee);
        const el = document.createElement('div'); el.className = 'etichetta3d'; el.textContent = q.testo; this.el.appendChild(el);
        this.etichette.push({ el, pos: a.clone().lerp(b, 0.5) });
      });
      this.applicaVisibilita();
      this.applicaSelezione();
      this._riattaccaGizmo();
    }

    // ------------------------------------------------- selezione e passi
    seleziona(ids) {
      this.selezione = new Set(ids);
      this.applicaSelezione();
      this._riattaccaGizmo();
    }

    applicaSelezione() {
      const anteprima = this.passoAnteprima != null;
      this.oggetti.forEach((obj, id) => {
        const o = this.doc.oggetto(id);
        const sel = this.selezione.has(id);
        const evidPasso = anteprima && o && o.passo === this.passoAnteprima && this.passoAnteprima < this.doc.dati.passi.length + 1;
        obj.traverse((m) => {
          if (!m.material || !m.material.emissive) return;
          if (m.userData.emissiveOrig == null) m.userData.emissiveOrig = m.material.emissive.getHex();
          m.material.emissive.setHex(sel ? 0x6a3600 : evidPasso ? 0x8a4200 : m.userData.emissiveOrig);
        });
      });
    }

    /** Anteprima del montaggio: n = passo da mostrare, null = tutto. */
    anteprima(n) {
      this.passoAnteprima = n;
      this.applicaVisibilita();
      this.applicaSelezione();
      if (n != null) {
        const p = this.doc.dati.passi[n - 1];
        if (p && p.camera && p.target) this.vai(p.camera, p.target);
      }
    }

    applicaVisibilita() {
      const n = this.passoAnteprima;
      this.oggetti.forEach((obj, id) => {
        const o = this.doc.oggetto(id);
        if (!o) return;
        if (n == null) { obj.visible = o.livello !== 'traccia' && !o.fino; return; }
        const st = o.passo || 0, fino = o.fino || 1e9;
        obj.visible = st <= n && n < fino;
      });
    }

    /** Cosa c'è sotto il puntatore: { id, punto } oppure { terreno: punto } o null. */
    sotto(evento) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const ndc = { x: ((evento.clientX - r.left) / r.width) * 2 - 1, y: -((evento.clientY - r.top) / r.height) * 2 + 1 };
      this.ray.setFromCamera(ndc, this.camera);
      const visibile = (o) => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
      const colpi = this.ray.intersectObjects([this.gruppo, this.terreno], true).filter((h) => visibile(h.object));
      const h = colpi.find((c) => c.object.userData.id || c.object.userData.terreno);
      if (!h) return null;
      if (h.object.userData.terreno) return { terreno: [h.point.x, 0, h.point.z] };
      return { id: h.object.userData.id, punto: [h.point.x, h.point.y, h.point.z] };
    }

    // ----------------------------------------------------- frecce/anelli
    impostaGizmo(modo) {
      this.modoGizmo = modo; // 'translate' | 'rotate' | null
      this._riattaccaGizmo();
    }

    _pezziSelezionati() {
      return [...this.selezione].map((id) => this.doc.pezzo(id)).filter(Boolean);
    }

    _riattaccaGizmo() {
      const tc = this.gizmo;
      tc.detach();
      if (!this.modoGizmo || this.passoAnteprima != null) return;
      const pezzi = this._pezziSelezionati();
      if (!pezzi.length) return;
      if (this.modoGizmo === 'rotate' && (pezzi.length !== 1 || !['palo', 'asse', 'corda'].includes(pezzi[0].forma))) return;
      const p0 = pezzi[0];
      if (pezzi.length === 1 && p0.a) {
        this.pivot.position.copy(V(p0.a));
        this.pivot.quaternion.setFromUnitVectors(UP, V(G.sottrai(p0.b, p0.a)).normalize());
      } else {
        const punti = pezzi.map((p) => p.a || p.p || (p.punti && p.punti[0])).filter(Boolean);
        const c = punti.reduce((s, q) => G.somma(s, q), [0, 0, 0]).map((v) => v / punti.length);
        this.pivot.position.copy(V(c));
        this.pivot.quaternion.identity();
      }
      this.pivot.updateMatrixWorld();
      tc.setMode(this.modoGizmo);
      tc.attach(this.pivot);
    }

    _inizioGizmo() {
      this._partenza = { pos: this.pivot.position.clone(), quat: this.pivot.quaternion.clone() };
      this._oggettiGizmo = this._pezziSelezionati().map((p) => {
        const obj = this.oggetti.get(p.id);
        return { p, obj, pos: obj.position.clone(), quat: obj.quaternion.clone() };
      });
    }

    _durataGizmo() {
      if (!this._partenza) return;
      const dPos = this.pivot.position.clone().sub(this._partenza.pos);
      const dRot = this.pivot.quaternion.clone().multiply(this._partenza.quat.clone().invert());
      this._oggettiGizmo.forEach(({ obj, pos, quat }) => {
        if (this.modoGizmo === 'rotate') {
          const rel = pos.clone().sub(this._partenza.pos).applyQuaternion(dRot);
          obj.position.copy(this._partenza.pos).add(rel);
          obj.quaternion.copy(dRot.clone().multiply(quat));
        } else {
          obj.position.copy(pos).add(dPos);
        }
      });
      if (this.callbackGizmo) this.callbackGizmo('durante', this._infoGizmo(dPos, dRot));
    }

    _infoGizmo(dPos, dRot) {
      const pezzi = this._oggettiGizmo.map((x) => x.p);
      if (this.modoGizmo === 'rotate' && pezzi[0]) {
        const p = pezzi[0];
        const dir = V(G.sottrai(p.b, p.a)).applyQuaternion(dRot);
        const ang = G.angoliDaDir([dir.x, dir.y, dir.z]);
        return { tipo: 'ruota', ...ang };
      }
      return { tipo: 'sposta', delta: [dPos.x, dPos.y, dPos.z], pos: [this.pivot.position.x, this.pivot.position.y, this.pivot.position.z] };
    }

    _fineGizmo() {
      if (!this._partenza) return;
      const dPos = this.pivot.position.clone().sub(this._partenza.pos);
      const dRot = this.pivot.quaternion.clone().multiply(this._partenza.quat.clone().invert());
      const pezzi = this._oggettiGizmo.map((x) => x.p);
      const centro = this._partenza.pos.clone();
      this._partenza = null;
      if (this.callbackGizmo) this.callbackGizmo('fine', { pezzi, dPos, dRot, centro, modo: this.modoGizmo });
    }

    // ------------------------------------------------------------ viste
    vai(camera, target) {
      this.camera.position.copy(V(camera));
      this.orbita.target.copy(V(target));
      this.orbita.update();
    }

    limiti() {
      const box = new T.Box3();
      this.oggetti.forEach((o) => { if (o.visible) box.expandByObject(o); });
      if (box.isEmpty()) box.setFromCenterAndSize(new T.Vector3(0, 1, 0), new T.Vector3(4, 2, 4));
      return box;
    }

    vista(nome) {
      const box = this.limiti();
      const c = box.getCenter(new T.Vector3()), s = box.getSize(new T.Vector3());
      const r = Math.max(s.x, s.y, s.z, 2);
      const dist = r / (2 * Math.tan(T.MathUtils.degToRad(this.camera.fov / 2))) * 1.25;
      const t = [c.x, c.y, c.z];
      if (nome === 'alto') this.vai([c.x, c.y + dist * 1.1, c.z + 0.01], t);
      else if (nome === 'fronte') this.vai([c.x, c.y, c.z + dist], t);
      else if (nome === 'lato') this.vai([c.x + dist, c.y, c.z], t);
      else this.vai([c.x + dist * 0.55, c.y + dist * 0.35, c.z + dist * 0.8], t);
    }

    inquadraturaAttuale() {
      const p = this.camera.position, t = this.orbita.target;
      return { camera: G.arr3([p.x, p.y, p.z]), target: G.arr3([t.x, t.y, t.z]) };
    }

    _aggiornaEtichette() {
      if (!this.etichette.length) return;
      const w = this.el.clientWidth, h = this.el.clientHeight;
      this.etichette.forEach((L) => {
        const p = L.pos.clone().project(this.camera);
        if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1 || this.passoAnteprima != null) { L.el.style.display = 'none'; return; }
        L.el.style.display = 'block';
        L.el.style.transform = `translate(-50%,-50%) translate(${((p.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-p.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
      });
    }

    istantanea(larghezza = 640) {
      const c = this.renderer.domElement;
      const k = larghezza / c.width;
      const cv = document.createElement('canvas'); cv.width = larghezza; cv.height = Math.round(c.height * k);
      cv.getContext('2d').drawImage(c, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', 0.85);
    }
  }

  window.Scena = Scena;
})();
