/* sw.js — so the app opens at 06:00 whether or not there is a network.
 *
 * The whole thing is about 400 KB of text plus four icons, which is small
 * enough to precache in one go on install. three.js is the exception: it is
 * 670 KB, it comes from a CDN, and most mornings nobody opens a figure at all
 * — so it is cached the first time it IS fetched and served from there
 * afterwards. A hotel with bad wifi then costs you nothing.
 *
 * CACHE-FIRST, not network-first. This is a plan, not a feed: correctness
 * across a version boundary matters less than the page being on screen before
 * you have finished unlocking the phone. A new build changes the cache name,
 * which drops the old one wholesale, and the build stamp at the foot of the
 * plan tab is how you tell which one you are looking at.
 */
const VERSION = '202609152253';
const SHELL = `healthos-shell-${VERSION}`;
const VENDOR = 'healthos-vendor';

const FILES = [
  './', './index.html', './manifest.webmanifest',
  './day.js', './daydata.js', './math.js', './body.js', './pose.js',
  './anim.js', './props.js', './figure.js',
  './icon-180.png', './icon-192.png', './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // addAll fails the whole install if any one file 404s, which is the
    // behaviour we want: a half-cached app is worse than an uncached one
    await c.addAll(FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('healthos-shell-') && k !== SHELL) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // three.js from the CDN: cache on first use, serve from cache forever after
  if (url.origin !== self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(VENDOR);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      // opaque responses are fine here: we only ever hand it back verbatim
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
      return res;
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) {
      // refresh in the background so the next open is current
      e.waitUntil(fetch(req).then((r) => { if (r && r.ok) c.put(req, r); }).catch(() => {}));
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone());
      return res;
    } catch {
      // a navigation with nothing cached: hand back the shell rather than
      // the browser's offline page
      if (req.mode === 'navigate') return (await c.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
