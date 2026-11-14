import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'

export default function NuevaContrasena() {
  const { terminarRecuperacion } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password })
    setEnviando(false)
    if (error) setError(error.message)
    else terminarRecuperacion()
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={guardar} className="w-full max-w-sm flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Crea tu nueva contraseña</h1>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Nueva contraseña</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-xl border border-gray-300 bg-white px-3.5" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Repite la contraseña</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            className="h-12 rounded-xl border border-gray-300 bg-white px-3.5" />
        </label>
        {error && <p role="alert" className="text-sm text-peligro">{error}</p>}
        <button disabled={enviando} className="h-12 rounded-xl bg-marca text-white font-semibold cursor-pointer disabled:opacity-60">
          {enviando ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </main>
  )
}
