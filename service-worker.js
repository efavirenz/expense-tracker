// App release and cache revision are independent; increment the cache revision when app-shell assets or SW behavior change.
const CACHE_PREFIX = 'expense-tracker-';
const CACHE_NAME = 'expense-tracker-v26';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/app.js',
  './js/sw-register.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(APP_SHELL.map(url =>
        cache.add(url).catch(error => {
          console.warn('Service worker failed to pre-cache:', url, error);
        })
      ))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
  );
});

// Stale-While-Revalidate with exact URL matching and a tracked update lifetime.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const cachePromise = caches.open(CACHE_NAME).catch(error => {
    console.warn('Service worker cache open failed:', error);
    return null;
  });
  const cachedResponsePromise = cachePromise
    .then(cache => cache ? cache.match(event.request) : null)
    .catch(error => {
      console.warn('Service worker cache read failed:', error);
      return null;
    });
  const updatePromise = fetch(event.request)
    .then(networkResponse => {
      if (!(networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque')) {
        return networkResponse;
      }
      return cachePromise.then(cache => {
        if (!cache) return networkResponse;
        return cache.put(event.request, networkResponse.clone()).then(
          () => networkResponse,
          cacheError => {
            console.warn('Service worker cache write failed:', cacheError);
            return networkResponse;
          }
        );
      });
    })
    .catch(error => {
      console.warn('Service worker revalidation failed:', error);
      return null;
    });

  event.waitUntil(updatePromise.then(() => undefined));
  event.respondWith(cachedResponsePromise.then(cached => {
    if (cached) return cached;
    return updatePromise.then(response => response || new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    }));
  }).catch(error => {
    console.warn('Service worker response failed:', error);
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }));
});
