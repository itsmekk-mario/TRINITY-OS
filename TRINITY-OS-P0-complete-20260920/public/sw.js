const CACHE = 'trinity-os-support-v1';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('trinity-os-') && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never store authentication, PDF, comments, or learning-state API responses.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || request.headers.has('Authorization')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const key = new URL('index.html', self.registration.scope).href;
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) await cache.put(key, response.clone());
        return response;
      } catch { return await cache.match(key) || new Response('오프라인입니다. 연결 후 다시 열어주세요.', { status: 503 }); }
    })());
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request); if (cached) return cached;
      const response = await fetch(request); if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
