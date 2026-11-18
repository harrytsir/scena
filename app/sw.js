/* Scena — offline support on the tablet */
const CACHE = 'scena-1.1.0';
const ASSETS = [
  './', './index.html', './style.css', './store.js', './layout.js', './zip.js', './formats.js', './app.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  ...['Mono', 'Serif', 'Sans'].flatMap(f => ['Regular', 'Bold', 'Italic', 'BoldItalic'].map(s => `./fonts/Liberation${f}-${s}.ttf`)),
  './vendor/pdfjs/pdf.min.mjs', './vendor/pdfjs/pdf.worker.min.mjs'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first (picks up updates), cached copy when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
