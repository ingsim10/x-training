// X Training: fa funzionare l'app anche senza internet in palestra.
// Prima prova a scaricare la versione nuova (max 3 secondi), altrimenti usa la copia salvata.
const CACHE = 'xtraining-v3';
const FILE = ['./', './index.html', './circuito.html', './manifest.json', './icon-192.png', './icon-512.png',
              './lib/jspdf.umd.min.js'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)));
  self.skipWaiting();
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(chiavi => Promise.all(chiavi.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function conLimite(promessa, ms) {
  return new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('rete lenta')), ms);
    promessa.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); ko(e); });
  });
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  ev.respondWith(
    conLimite(fetch(req), 3000)
      .then(risp => {
        if (risp.ok) {
          const copia = risp.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return risp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)))
  );
});
