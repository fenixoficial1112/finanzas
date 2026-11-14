import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import AppLayout from './layout/AppLayout'
import { supabaseConfigurado } from './lib/supabase'
import ConfigFaltante from './pages/ConfigFaltante'
import Inicio from './pages/Inicio'
import Login from './pages/Login'
import NuevaContrasena from './pages/NuevaContrasena'
import Proximamente from './pages/Proximamente'

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
          <Route path="movimientos" element={<Proximamente titulo="Movimientos" fase={2} />} />
          <Route path="jornadas" element={<Proximamente titulo="Jornadas InDrive / Uber" fase={3} />} />
          <Route path="vehiculo" element={<Proximamente titulo="Vehículo" fase={4} />} />
          <Route path="deudas" element={<Proximamente titulo="Deudas" fase={5} />} />
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
