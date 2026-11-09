// ParkShield service worker: Web Push only (no offline caching, nothing stored).
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'ParkShield', body: event.data ? event.data.text() : '' };
  }
  const url =
    typeof data.url === 'string' && data.url.startsWith(self.location.origin) ? data.url : '/konto';
  event.waitUntil(
    self.registration.showNotification(data.title || 'ParkShield', {
      body: data.body || '',
      tag: data.tag,
      renotify: Boolean(data.tag),
      requireInteraction: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      lang: data.lang,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/konto';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
