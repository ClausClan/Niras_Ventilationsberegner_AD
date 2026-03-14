const CACHE_NAME = 'ventcalc-adv-v5'; // Versionsnummer opdateret

// Basis-URL for GitHub Pages. 
const BASE_URL = '/Niras_Ventilationsberegner_AD';

// Liste over filer der skal gemmes lokalt på enheden
const ASSETS_TO_CACHE = [
    `${BASE_URL}/`,
    `${BASE_URL}/index.html`,
    `${BASE_URL}/manifest.json`,
    `${BASE_URL}/favicon.ico`,
    `${BASE_URL}/favicon.png`,
    `${BASE_URL}/favicon-192.png`,
    `${BASE_URL}/favicon-512.png`,
    // JavaScript filer
    `${BASE_URL}/src/main.js`,
    `${BASE_URL}/src/app_state.js`,
    `${BASE_URL}/src/physics.js`,
    `${BASE_URL}/src/ui.js`,
    `${BASE_URL}/src/diagram.js`,
    `${BASE_URL}/src/utils.js`,
    `${BASE_URL}/src/projects.js`,
    `${BASE_URL}/src/style.css`,
    `${BASE_URL}/public/icons/bend_circ.svg`,
    `${BASE_URL}/public/icons/bend_rect.svg`,
    `${BASE_URL}/public/icons/constraction_rect.svg`,
    `${BASE_URL}/public/icons/constraction.svg`,
    `${BASE_URL}/public/icons/expansion_rect.svg`,
    `${BASE_URL}/public/icons/expansion.svg`,
    `${BASE_URL}/public/icons/tee_bullhead_merging.svg`,
    `${BASE_URL}/public/icons/tee_bullhead_splitting.svg`,
    `${BASE_URL}/public/icons/tee_merging.svg`,
    `${BASE_URL}/public/icons/tee_splitting.svg`,
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

// Aktivering: Ryd op i gamle caches
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

// Fetch: Stale-while-revalidate strategi (Kræves ofte for PWA godkendelse)
self.addEventListener('fetch', (event) => {
    // Vi cacher kun GET requests (ikke POST/PUT etc.)
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Returner fra cache, men opdater cachen i baggrunden (stale-while-revalidate)
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                }).catch(() => {
                    // Ignorer netværksfejl her, vi har jo cachen
                });
                return cachedResponse;
            }
            
            // Hvis filen slet ikke er i cache, hent fra nettet
            return fetch(event.request).then((response) => {
                // Cache den nye fil til næste gang, hvis det lykkes
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            }).catch(() => {
                // Her kunne man evt. returnere en offline HTML side, hvis alt fejler
                console.error('[Service Worker] Netværksfejl og fil ikke i cache:', event.request.url);
            });
        })
    );
});