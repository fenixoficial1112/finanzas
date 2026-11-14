import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true cuando .env.local tiene los datos de Supabase. */
export const supabaseConfigurado = Boolean(url && anonKey)

// Si falta la configuración usamos valores de relleno para no romper la carga;
// la app muestra la pantalla de configuración en su lugar.
export const supabase = createClient(
  url ?? 'http://localhost',
  anonKey ?? 'sin-configurar',
)
