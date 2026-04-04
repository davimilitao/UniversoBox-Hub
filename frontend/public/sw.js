// UniversoBox Hub — Service Worker v1.0
// Cache-first para assets estáticos, network-first para API

const CACHE  = 'ubhub-v1';
const STATIC = ['/spa/', '/spa/index.html'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API e Firebase: sempre network
  if (url.pathname.startsWith('/orders') ||
      url.pathname.startsWith('/bling')  ||
      url.pathname.startsWith('/api')    ||
      url.hostname.includes('firebase')  ||
      url.hostname.includes('googleapis')) {
    return;
  }
  // Assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match('/spa/')))
  );
});

// Push notification handler (futuro)
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  self.registration.showNotification(data.title || 'UniversoBox', {
    body: data.body || '',
    icon: '/spa/icon-192.png',
    badge: '/spa/icon-192.png',
    tag: data.tag || 'ubhub',
    renotify: true,
  });
});
