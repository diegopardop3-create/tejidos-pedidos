import { createClient } from '@supabase/supabase-js'

// Estos valores son seguros para estar en el código del lado del cliente:
// la "publishable key" está diseñada para ser pública.
// La seguridad real la dan las políticas RLS configuradas en Supabase,
// que exigen sesión iniciada (authenticated) para leer o escribir datos.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// keepalive:true le dice al navegador que termine de enviar la petición
// aunque cierres la pestaña, cambies de app o bloquees el celular justo
// después de tocar algo. Sin esto, un guardado que todavía va viajando por
// la red se puede cortar a la mitad si sales muy rápido.
//
// PERO el navegador solo permite keepalive en peticiones de hasta ~64KB.
// Un pedido con fotos adjuntas pesa mucho más que eso, y pedirle keepalive
// a una petición grande hace que el navegador la rechace de una con
// "Failed to fetch" — sin ni siquiera intentar enviarla. Por eso aquí se
// revisa el tamaño primero: los guardados chicos (marcar una celda, cambiar
// un estado, un abono) sí llevan keepalive; los grandes (fotos) van por la
// vía normal, sin ese límite, igual que funcionaban antes.
const LIMITE_KEEPALIVE = 60000 // bytes; el límite real del navegador ronda 64KB, se deja margen

const fetchConKeepalive = (url, options = {}) => {
  const cuerpo = options.body
  const esLiviana = !cuerpo || (typeof cuerpo === 'string' && cuerpo.length < LIMITE_KEEPALIVE)
  return fetch(url, esLiviana ? { ...options, keepalive: true } : options)
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: fetchConKeepalive },
})
