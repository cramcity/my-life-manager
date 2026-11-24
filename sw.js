// Service worker : fonctionnement hors connexion (cache de l'application) et notifications.
const VERSION = 'mlm-v1.5.0';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/auth.js', 'js/config.js', 'js/push.js', 'js/store.js', 'js/utils.js', 'js/icons.js', 'js/recur.js', 'js/alarm-engine.js', 'js/ics.js', 'js/sync.js',
  'js/components.js', 'js/editors.js', 'js/theme.js',
  'js/views/dashboard.js', 'js/views/calendar.js', 'js/views/tasks.js', 'js/views/notes.js', 'js/views/alarms.js',
  'js/views/projects.js', 'js/views/progress.js', 'js/views/settings.js', 'js/views/guide.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // API de synchronisation : jamais en cache
  // Images : cache d'abord. Code et pages : réseau d'abord (mises à jour immédiates), cache si hors connexion.
  if (url.pathname.includes('/icons/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; })));
    return;
  }
  const key = req.mode === 'navigate' ? 'index.html' : req;
  e.respondWith(networkFirst(req, key));
});
function networkFirst(req, key) {
  return new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(key, { ignoreSearch: true }).then(hit => { if (hit && !done) { done = true; resolve(hit); } return hit; });
    const timer = setTimeout(fallback, 3500); // réseau trop lent : on sert la version en cache
    fetch(req).then(r => {
      clearTimeout(timer);
      if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(key, c)); }
      if (!done) { done = true; resolve(r); }
    }).catch(async () => {
      clearTimeout(timer);
      const hit = await fallback();
      if (!done) { done = true; resolve(hit || new Response('Hors connexion', { status: 503 })); }
    });
  });
}
// Notification « push » reçue (app fermée ou iPhone verrouillé) : le contenu a été chiffré pour cet appareil.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'My Life Manager', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || './' },
    silent: false, vibrate: d.vibrate === false ? [] : [600, 250, 600, 250, 900], requireInteraction: true,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate?.(url).catch?.(() => { }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
