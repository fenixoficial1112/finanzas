import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { escritorio } from '../lib/escritorio'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  cargando: boolean
  /** true cuando el usuario llegó desde el enlace de "olvidé mi contraseña". */
  recuperando: boolean
  terminarRecuperacion: () => void
  /** Error al volver del navegador (por ejemplo, si se canceló el inicio con Google). */
  errorRetorno: string | null
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)
  const [recuperando, setRecuperando] = useState(false)
  const [errorRetorno, setErrorRetorno] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((evento, nueva) => {
      setSession(nueva)
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // App de escritorio: el navegador devuelve fenixapp://auth?code=… después de entrar con Google
  // (o de abrir un enlace del correo); ese código se cambia por la sesión.
  useEffect(() => {
    if (!escritorio) return
    return escritorio.alVolverDelNavegador(async (enlace) => {
      let parametros: URLSearchParams
      try {
        const url = new URL(enlace)
        parametros = new URLSearchParams(url.search || url.hash.replace(/^#/, ''))
      } catch {
        return
      }
      const codigo = parametros.get('code')
      const error = parametros.get('error_description') ?? parametros.get('error')
      if (error) return setErrorRetorno(error.replace(/\+/g, ' '))
      if (!codigo) return
      const { error: errCambio } = await supabase.auth.exchangeCodeForSession(codigo)
      setErrorRetorno(errCambio ? 'No se pudo completar el inicio de sesión. Inténtalo de nuevo desde esta ventana.' : null)
    })
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, cargando, recuperando, terminarRecuperacion: () => setRecuperando(false), errorRetorno }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
