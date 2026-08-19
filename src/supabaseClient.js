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
// la red se puede cortar a la mitad si sales muy rápido — que es
// exactamente lo que se sentía como "hay que esperar para poder salir".
// El límite de tamaño para peticiones con keepalive es generoso (~64KB),
// muy por encima de lo que pesa cualquier guardado de este sistema.
const fetchConKeepalive = (url, options = {}) => fetch(url, { ...options, keepalive: true })

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: fetchConKeepalive },
})
