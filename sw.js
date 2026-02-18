const CACHE_NAME = 'ftm-cache-v2';
const ASSETS = [
    './index.html',
    './flight_test_master.html',
    './manifest.json',
    'https://cdn-icons-png.flaticon.com/512/753/753235.png'
];

// Install: cache critical files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate: delete old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch: cache-first for local files, network-first for external
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const isLocal = url.origin === self.location.origin;

    if (isLocal) {
        // Cache-first: serve from cache, fallback to network
        event.respondWith(
            caches.match(event.request).then((cached) => {
                return cached || fetch(event.request).then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
    } else {
        // Network-first for external (fonts, icons): fallback to cache
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
    }
});
