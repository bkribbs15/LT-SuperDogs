// Minimal service worker: no caching (the app is small and the data is live),
// but its presence makes the site installable to the home screen.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
