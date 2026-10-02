// Guarda la "cáscara" de la página (pantallas, estilos, logo) en el
// dispositivo para que abra rápido y muestre algo aun sin internet.
// NUNCA guarda datos de pedidos: lo que viene de Supabase siempre se pide
// en vivo, así no se ve información vieja ni se pisan cambios.
const CACHE = 'll-pedidos-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/logo.png', '/manifest.json'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return
  // Siempre intenta primero la red (versión más nueva); si no hay internet, usa lo guardado.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)) }
        return res
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : Response.error())))
  )
})
