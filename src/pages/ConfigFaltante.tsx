import { useState, type FormEvent } from 'react'
import { Aviso, Campo, btnPrincipal, inputCls } from '../components/ui'
import { Logo } from '../layout/Logo'
import { guardarConfigSupabase } from '../lib/supabase'

/** Primera vez: el usuario conecta la app con su proyecto gratuito de Supabase. */
export default function ConfigFaltante() {
  const [url, setUrl] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)

  function guardar(e: FormEvent) {
    e.preventDefault()
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url.trim())) {
      return setError('La URL debe verse así: https://abcdefgh.supabase.co')
    }
    if (clave.trim().split('.').length !== 3 && !clave.trim().startsWith('sb_publishable_')) {
      return setError('Esa no parece la clave pública (anon / publishable) de Supabase.')
    }
    guardarConfigSupabase(url, clave)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-6 bg-white border border-borde rounded-2xl p-8">
        <Logo />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Conecta FENIX APP con tu nube</h1>
          <p className="text-suave text-sm">Solo se hace una vez. Tus datos se guardan en tu propio proyecto gratuito de Supabase.</p>
        </div>
        <ol className="list-decimal pl-5 space-y-2 text-[15px] leading-relaxed">
          <li>Crea un proyecto gratis en <b>supabase.com</b>.</li>
          <li>En <b>SQL Editor</b>, ejecuta en orden los archivos de <code className="bg-gray-100 px-1 rounded">supabase/migrations/</code> del proyecto.</li>
          <li>En <b>Project Settings → API</b>, copia la <b>Project URL</b> y la clave pública <b>anon</b> (o <i>publishable</i>) y pégalas aquí.</li>
        </ol>
        <form onSubmit={guardar} className="space-y-4">
          <Campo etiqueta="Project URL">
            <input required value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://abcdefgh.supabase.co" />
          </Campo>
          <Campo etiqueta="Clave pública (anon / publishable)" ayuda="Es la clave pública; está protegida por la seguridad por usuario de la base de datos. Nunca pegues aquí la clave secreta (service_role).">
            <input required value={clave} onChange={(e) => setClave(e.target.value)} className={inputCls} placeholder="eyJhbGciOi…" />
          </Campo>
          {error && <Aviso>{error}</Aviso>}
          <button className={btnPrincipal}>Conectar</button>
        </form>
      </div>
    </main>
  )
}
