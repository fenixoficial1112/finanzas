import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import AppLayout from './layout/AppLayout'
import { iniciarBD } from './lib/bd'
import Ajustes from './pages/Ajustes'
import Asesor from './pages/Asesor'
import Cuentas from './pages/Cuentas'
import Deudas from './pages/Deudas'
import Inicio from './pages/Inicio'
import Inversiones from './pages/Inversiones'
import Jornadas from './pages/Jornadas'
import MetaDiaria from './pages/MetaDiaria'
import Metas from './pages/Metas'
import Movimientos from './pages/Movimientos'
import Presupuesto from './pages/Presupuesto'
import Proximamente from './pages/Proximamente'
import Reportes from './pages/Reportes'
import Vehiculo from './pages/Vehiculo'

// En el programa de escritorio la app se abre desde un archivo local: las rutas van después de "#".
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

export default function App() {
  const [estado, setEstado] = useState<'abriendo' | 'lista' | string>('abriendo')

  useEffect(() => {
    iniciarBD()
      .then(() => setEstado('lista'))
      .catch((e: unknown) => setEstado(e instanceof Error ? e.message : String(e)))
  }, [])

  if (estado === 'abriendo') {
    return <div className="min-h-screen grid place-items-center text-suave">Abriendo tus datos…</div>
  }
  if (estado !== 'lista') {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div role="alert" className="max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 space-y-2">
          <h1 className="text-lg font-bold text-peligro">No se pudieron abrir tus datos</h1>
          <p className="text-sm">{estado}</p>
          <p className="text-sm text-suave">Tus copias de seguridad automáticas están en la carpeta de datos de FENIX APP.</p>
        </div>
      </main>
    )
  }
  return <Rutas />
}

function Rutas() {
  return (
    <Router>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Inicio />} />
          <Route path="meta" element={<MetaDiaria />} />
          <Route path="movimientos" element={<Movimientos />} />
          <Route path="cuentas" element={<Cuentas />} />
          <Route path="ajustes" element={<Ajustes />} />
          <Route path="jornadas" element={<Jornadas />} />
          <Route path="vehiculo" element={<Vehiculo />} />
          <Route path="deudas" element={<Deudas />} />
          <Route path="asesor" element={<Asesor />} />
          <Route path="presupuesto" element={<Presupuesto />} />
          <Route path="metas" element={<Metas />} />
          <Route path="inversiones" element={<Inversiones />} />
          <Route path="reportes" element={<Reportes />} />
          <Route path="*" element={<Proximamente titulo="Página no encontrada" fase={0} />} />
        </Route>
      </Routes>
    </Router>
  )
}
