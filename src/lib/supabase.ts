import { createClient } from '@supabase/supabase-js'

const CLAVE_CONFIG = 'fenix-config-supabase'

interface ConfigSupabase {
  url: string
  anonKey: string
}

/**
 * La conexión a Supabase viene de .env.local (al compilar) o, si no está, de lo que el usuario
 * escribió la primera vez que abrió la app (se guarda en este equipo).
 */
function leerConfig(): ConfigSupabase | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url && anonKey) return { url, anonKey }
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_CONFIG) ?? 'null') as ConfigSupabase | null
    if (guardada?.url && guardada?.anonKey) return guardada
  } catch {
    /* sin acceso al almacenamiento: se pedirá la configuración */
  }
  return null
}

/** URL del proyecto conectado y si se puede cambiar desde la app (no viene de .env.local). */
export function infoConexion(): { url: string | null; cambiable: boolean } {
  return { url: config?.url ?? null, cambiable: !import.meta.env.VITE_SUPABASE_URL }
}

/** Olvida el proyecto conectado (cierra la sesión) y vuelve a la pantalla de conexión. */
export async function olvidarConfigSupabase() {
  await supabase.auth.signOut().catch(() => undefined)
  localStorage.removeItem(CLAVE_CONFIG)
  window.location.reload()
}

/** Guarda la conexión escrita por el usuario y recarga la app. */
export function guardarConfigSupabase(url: string, anonKey: string) {
  localStorage.setItem(CLAVE_CONFIG, JSON.stringify({ url: url.trim().replace(/\/+$/, ''), anonKey: anonKey.trim() }))
  window.location.reload()
}

const config = leerConfig()

/** true cuando la app ya sabe a qué proyecto de Supabase conectarse. */
export const supabaseConfigurado = config !== null

// PKCE: el flujo seguro que permite volver del navegador a la app de escritorio con un código.
export const supabase = createClient(config?.url ?? 'http://localhost', config?.anonKey ?? 'sin-configurar', {
  auth: { flowType: 'pkce' },
})
