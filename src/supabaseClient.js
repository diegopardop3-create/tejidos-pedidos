import { createClient } from '@supabase/supabase-js'

// Estos valores son seguros para estar en el código del lado del cliente:
// la "publishable key" está diseñada para ser pública.
// La seguridad real la dan las políticas RLS configuradas en Supabase,
// que exigen sesión iniciada (authenticated) para leer o escribir datos.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)
