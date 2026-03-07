const CACHE_NAME = 'ventcalc-adv-v2'; // Versionsnummer opdateret for at tvinge ny cache

// Basis-URL for GitHub Pages. 
// VIGTIGT: Hvis du tester lokalt (f.eks. http://127.0.0.1:5500/), skal du evt. fjerne "/Niras_Ventilationsberegner_AD"
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