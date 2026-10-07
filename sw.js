/* Service worker — offline support for the application shell.
 *
 * CACHE_NAME is DERIVED, not chosen. It is written here by
 * `npm run config:sync` from APP_CONFIG.id and the newest APP_UPDATES entry
 * in index.html, and `npm run config:verify` fails if the two ever drift.
 * Never hand-edit it: the cache name is what separates this app from every
 * other app deployed on the same origin, and a stale one serves old code.
 *
 * Publishing a new version means adding an APP_UPDATES entry and running
 * config:sync. That bumps the version, the cache name changes, and phones
 * pick up the new code.
 *
 * Bible book files under data/bible/ are cache-FIRST: within a release they
 * never change, so once a book has been read it is served from the cache and
 * works offline. They ride the same versioned cache as the shell, so a new
 * release cannot serve last release's corpus alongside this release's code.
 *
 * This only ever caches application CODE and publisher Scripture. Everything a person creates lives
 * in localStorage under the app's own namespace and is never touched here —
 * clearing these caches cannot lose a single record.
 */

/* APP-CACHE-BEGIN */
const CACHE_NAME = 'daily-verse-v1.13.4';
/* APP-CACHE-END */

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      /* A failed precache must not block activation — the app still works
         online, and the fetch handler will fill the cache as it goes. */
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        /* Only this app's own older caches. A cache belonging to another app
           on the same origin is left completely alone — deleting by anything
           looser than this prefix is how one deployment wipes another. */
        keys.filter(k => k !== CACHE_NAME && k.indexOf(cachePrefix()) === 0)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function cachePrefix(){
  const cut = CACHE_NAME.lastIndexOf('-v');
  return cut === -1 ? CACHE_NAME : CACHE_NAME.slice(0, cut + 2);
}

/* Network-first for the shell, so a freshly deployed update is picked up as
 * soon as there is a connection, with the cache as the offline fallback. */
function isBibleData(url){ return url.pathname.indexOf('/data/bible/') !== -1; }

/* What may be written to the cache.
 *
 * `fetch` resolving is not success. A 404, a 500, or a host's error page all
 * arrive as a Response, and the shell used to cache whichever one turned up:
 * one bad answer while online replaced the app with an error page for every
 * launch afterwards, until a good one happened to come back. The Bible branch
 * already checked; this is the same rule, applied once, for both.
 *
 * `type === 'basic'` keeps it to our own origin's real responses — an opaque
 * cross-origin reply cannot be inspected, so it is never stored. */
function worthCaching(res){
  return !!res && res.ok && res.status === 200 && res.type === 'basic';
}

/* How long a launch waits for the network before it uses what it already has.
 *
 * Not a tuned number and not pretending to be: it is the point past which a
 * reader on a phone has concluded the app is broken. A connection that is
 * merely slow still answers inside it on 3G; one that has accepted the
 * connection and gone quiet — hotel Wi-Fi, a captive portal, a train — never
 * answers at all, and before this the launch waited for the browser's own
 * timeout, which is tens of seconds of white screen.
 *
 * It only ever shortens the wait when there is already a cached answer to
 * fall back on. With nothing cached, waiting is all there is to do. */
const SHELL_NETWORK_TIMEOUT_MS = 4000;

function shellFromNetwork(req){
  return fetch(req).then(res => {
    if(worthCaching(res)){
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  if(new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);

  /* Scripture is immutable within a release, so the cache is the fast path
     and the network only fills gaps. Crucially this never falls back to
     index.html: answering a request for a book with a page of HTML would
     surface as a parse error rather than as "you do not have this offline",
     and the reader can only tell the truth if the failure is a real one. */
  if(isBibleData(url)){
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if(worthCaching(res)){
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }))
    );
    return;
  }

  /* Network first, but only for as long as it is worth waiting. If a cached
     copy exists, the timer hands it over and the request is left to finish in
     the background — so the next launch still gets the newer bytes. If
     nothing is cached, there is nothing to fall back to and the fetch is
     simply awaited. */
  event.respondWith(
    caches.match(req).then(cached => {
      const network = shellFromNetwork(req);
      if(!cached){
        return network.catch(() => caches.match('./index.html'));
      }
      return new Promise(resolve => {
        let settled = false;
        const done = res => { if(!settled){ settled = true; resolve(res); } };
        const timer = setTimeout(() => done(cached), SHELL_NETWORK_TIMEOUT_MS);
        network.then(res => {
          clearTimeout(timer);
          /* A network answer that is not worth caching is not worth showing
             either when a good cached copy is in hand. */
          done(worthCaching(res) ? res : cached);
        }, () => { clearTimeout(timer); done(cached); });
      });
    })
  );
});
