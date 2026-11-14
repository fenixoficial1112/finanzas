export default function ConfigFaltante() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl space-y-4 bg-white border border-borde rounded-2xl p-8">
        <h1 className="text-2xl font-bold">Falta conectar FENIX APP con Supabase</h1>
        <ol className="list-decimal pl-5 space-y-2 text-[15px] leading-relaxed">
          <li>Crea un proyecto gratis en <b>supabase.com</b>.</li>
          <li>
            En el panel de Supabase abre <b>SQL Editor</b> y ejecuta en orden los archivos de{' '}
            <code className="bg-gray-100 px-1 rounded">supabase/migrations/</code>.
          </li>
          <li>
            Copia <code className="bg-gray-100 px-1 rounded">.env.example</code> como{' '}
            <code className="bg-gray-100 px-1 rounded">.env.local</code> y pega la URL y la clave
            <i> anon</i> (Project Settings → API).
          </li>
          <li>Reinicia con <code className="bg-gray-100 px-1 rounded">npm run dev</code>.</li>
        </ol>
      </div>
    </main>
  )
}
