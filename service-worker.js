const CACHE_NAME = 'ventcalc-adv-v1';

// Liste over filer der skal gemmes lokalt på enheden
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.ico',
    '/favicon.png',
    '/favicon-192.png',
    '/favicon-512.png',
    // JavaScript filer
    '/src/main.js',
    '/src/app_state.js',
    '/src/physics.js',
    '/src/ui.js',
    '/src/diagram.js',
    '/src/utils.js',
    '/src/projects.js',
    '/src/style.css',
    '/public/icons/bend_circ.svg',
    '/public/icons/bend_rect.svg',
    '/public/icons/constraction_rect.svg',
    '/public/icons/constraction.svg',
    '/public/icons/expansion_rect.svg',
    '/public/icons/expansion.svg',
    '/public/icons/tee_bullhead_merging.svg',
    '/public/icons/tee_bullhead_splitting.svg',
    '/public/icons/tee_merging.svg',
    '/public/icons/tee_splitting.svg',
];

// Installation: Cache alle vitale filer
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching app shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Tvinger den nye service worker til at overtage med det samme
    self.skipWaiting();
});

// Aktivering: Ryd op i gamle caches, hvis vi ændrer CACHE_NAME (f.eks. til v2)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Sletter gammel cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch: Forsøg at hente fra cache først. Findes filen ikke, hent den fra nettet.
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Returner den cachede version, hvis vi har den
            if (response) {
                return response;
            }
            // Ellers send anmodningen videre til netværket (serveren)
            return fetch(event.request);
        })
    );
});
