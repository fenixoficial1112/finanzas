import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import AppLayout from './layout/AppLayout'
import { supabaseConfigurado } from './lib/supabase'
import Ajustes from './pages/Ajustes'
import ConfigFaltante from './pages/ConfigFaltante'
import Cuentas from './pages/Cuentas'
import Deudas from './pages/Deudas'
import Inicio from './pages/Inicio'
import Jornadas from './pages/Jornadas'
import Login from './pages/Login'
import MetaDiaria from './pages/MetaDiaria'
import Movimientos from './pages/Movimientos'
import NuevaContrasena from './pages/NuevaContrasena'
import Proximamente from './pages/Proximamente'
import Vehiculo from './pages/Vehiculo'

export default function App() {
  if (!supabaseConfigurado) return <ConfigFaltante />
  return <Rutas />
}

function Rutas() {
  const { session, cargando, recuperando } = useAuth()

  if (cargando) {
    return <div className="min-h-screen grid place-items-center text-suave">Cargando…</div>
  }
  if (recuperando) return <NuevaContrasena />
  if (!session) return <Login />

  return (
    <BrowserRouter>
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
          <Route path="asesor" element={<Proximamente titulo="Asesor IA" fase={6} />} />
          <Route path="presupuesto" element={<Proximamente titulo="Presupuesto" fase={7} />} />
          <Route path="metas" element={<Proximamente titulo="Metas" fase={8} />} />
          <Route path="inversiones" element={<Proximamente titulo="Inversiones" fase={9} />} />
          <Route path="reportes" element={<Proximamente titulo="Reportes" fase={10} />} />
          <Route path="*" element={<Proximamente titulo="Página no encontrada" fase={0} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
