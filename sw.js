const CACHE = 'gosignal-air-v4'
const SHELL = [
  './',
  './index.html',
  './styles.css?v=4',
  './app.js?v=4',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request)
          .then((response) => {
            const clone = response.clone()
            caches.open(CACHE).then((cache) => cache.put(event.request, clone))
            return response
          })
          .catch(() => caches.match('./index.html'))
      })
    )
    return
  }

  if (/open-meteo|overpass-api/.test(url.hostname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE).then((cache) => cache.put(event.request, clone))
          return response
        })
        .catch(() => caches.match(event.request))
    )
  }
})
