import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Logo } from '../layout/Logo'

type Modo = 'entrar' | 'registro' | 'olvide' | 'enlace'

const TITULOS: Record<Modo, string> = {
  entrar: 'Iniciar sesión',
  registro: 'Crear cuenta',
  olvide: 'Recuperar contraseña',
  enlace: 'Entrar con enlace al correo',
}

const inputCls =
  'h-12 rounded-xl border border-gray-300 bg-white px-3.5 text-[15px] outline-none focus:border-marca focus:ring-2 focus:ring-marca/20'
const botonCls =
  'h-12 rounded-xl bg-marca text-white font-semibold hover:bg-marca-oscuro disabled:opacity-60 cursor-pointer'

export default function Login() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cambiarModo = (m: Modo) => {
    setModo(m)
    setError(null)
    setAviso(null)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    setAviso(null)
    const volverA = window.location.origin

    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (modo === 'registro') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: volverA },
        })
        if (error) throw error
        if (!data.session) {
          setAviso('Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.')
        }
      } else if (modo === 'olvide') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: volverA })
        if (error) throw error
        setAviso('Si el correo está registrado, te llegará un enlace para crear una nueva contraseña.')
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: volverA, shouldCreateUser: false },
        })
        if (error) throw error
        setAviso('Revisa tu correo: te enviamos un enlace para entrar.')
      }
    } catch (err) {
      setError(traducirError(err instanceof Error ? err.message : String(err)))
    } finally {
      setEnviando(false)
    }
  }

  const pidePassword = modo === 'entrar' || modo === 'registro'

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <aside className="hidden lg:flex flex-col justify-between bg-tinta text-white p-12">
        <Logo claro />
        <div className="max-w-md space-y-4">
          <h2 className="text-4xl font-bold leading-tight">Toma el control de tu dinero.</h2>
          <p className="text-gray-300 text-lg leading-relaxed">
            Tus ganancias de InDrive y Uber, tu vehículo, tus deudas, tus metas y tus inversiones en
            pesos y dólares, con un asesor de IA que te ayuda a avanzar.
          </p>
        </div>
        <span className="text-sm text-gray-400">Hecho para conductores en República Dominicana</span>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-7">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{TITULOS[modo]}</h1>
            {modo === 'olvide' && (
              <p className="text-suave text-sm">Te enviaremos un enlace para crear una nueva.</p>
            )}
          </div>

          <form onSubmit={enviar} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Correo electrónico</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                className={inputCls}
              />
            </label>

            {pidePassword && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Contraseña</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                />
                {modo === 'registro' && (
                  <span className="text-xs text-suave">Mínimo 8 caracteres.</span>
                )}
              </label>
            )}

            {modo === 'entrar' && (
              <button
                type="button"
                onClick={() => cambiarModo('olvide')}
                className="self-end text-sm font-semibold text-marca hover:underline cursor-pointer"
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-peligro">
                {error}
              </p>
            )}
            {aviso && (
              <p role="status" className="rounded-lg bg-marca-claro px-3 py-2 text-sm text-marca-oscuro">
                {aviso}
              </p>
            )}

            <button type="submit" disabled={enviando} className={botonCls}>
              {enviando ? 'Un momento…' : modo === 'registro' ? 'Crear cuenta' : modo === 'entrar' ? 'Entrar' : 'Enviar enlace'}
            </button>

            {modo === 'entrar' && (
              <button
                type="button"
                onClick={() => cambiarModo('enlace')}
                className="h-12 rounded-xl border border-gray-300 bg-white font-semibold hover:bg-gray-50 cursor-pointer"
              >
                Entrar sin contraseña (enlace al correo)
              </button>
            )}
          </form>

          <p className="text-center text-sm text-suave">
            {modo === 'entrar' ? (
              <>
                ¿No tienes cuenta?{' '}
                <button onClick={() => cambiarModo('registro')} className="font-semibold text-marca hover:underline cursor-pointer">
                  Regístrate
                </button>
              </>
            ) : (
              <button onClick={() => cambiarModo('entrar')} className="font-semibold text-marca hover:underline cursor-pointer">
                Volver a iniciar sesión
              </button>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}

function traducirError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('email not confirmed')) return 'Primero confirma tu correo con el enlace que te enviamos.'
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese correo. Inicia sesión.'
  if (m.includes('signups not allowed') || m.includes('user not found'))
    return 'No encontramos una cuenta con ese correo.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
  if (m.includes('password')) return 'La contraseña no es válida (mínimo 8 caracteres).'
  if (m.includes('fetch')) return 'No hay conexión con el servidor. Revisa tu internet.'
  return msg
}
