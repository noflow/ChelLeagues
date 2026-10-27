/* Only the generic offline screen and public icon are stored on the device.
   Account pages, API replies, player details, and availability are never cached. */
'use strict';
const CACHE = 'chel-offline-v1';
const offline = new URL('offline.html', self.registration.scope).href;
const icon = new URL('assets/chel-leagues-icon.png', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([offline, icon])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('chel-offline-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(offline)));
  } else if (url.href === icon) {
    event.respondWith(fetch(request).catch(() => caches.match(icon)));
  }
});
