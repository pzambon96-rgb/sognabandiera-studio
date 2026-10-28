// Copia locale dello Studio per usarlo anche senza internet.
// Cambia VERSIONE a ogni pubblicazione per aggiornare la copia.
const VERSIONE = 'studio-v1';
const FILE = [
  './', 'index.html', 'css/studio.css', 'manifest.webmanifest',
  'js/lib/three.min.js', 'js/lib/OrbitControls.js', 'js/lib/TransformControls.js',
  'js/calcoli.js', 'js/geometria.js', 'js/catalogo.js', 'js/modello.js', 'js/scena.js',
  'js/cloud.js', 'js/interfaccia.js', 'js/app.js',
  'icone/icona-192.png', 'icone/icona-512.png', 'esempi/tre-cavalletti.json',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== VERSIONE).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});
// Prima la rete (così gli aggiornamenti arrivano subito), poi la copia locale.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copia = r.clone();
      caches.open(VERSIONE).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
