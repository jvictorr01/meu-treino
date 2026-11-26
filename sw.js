const C = 'treino-v3';
const CORE = ['/', '/index.html', '/app.js', '/config.js', '/data.js', '/manifest.json', '/icon-192.png'];
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(async c => {
    await c.addAll(CORE);
    try { await c.add(new Request(CDN, { mode: 'cors' })); } catch (err) { }
  }));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => clients.claim())
));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // nunca cachear chamadas ao Supabase (dados/auth)
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;
  // imagens e CDN: cache primeiro
  if (url.pathname.startsWith('/img/') || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(req, cp)); }
      return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // app: rede primeiro, cache como fallback (offline)
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(req, cp)); }
    return r;
  }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('/index.html') : undefined))));
});
