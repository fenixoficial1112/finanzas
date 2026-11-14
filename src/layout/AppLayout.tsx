import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { Logo } from './Logo'

const SECCIONES = [
  { ruta: '/', nombre: 'Inicio' },
  { ruta: '/movimientos', nombre: 'Movimientos' },
  { ruta: '/cuentas', nombre: 'Cuentas' },
  { ruta: '/jornadas', nombre: 'Jornadas InDrive / Uber' },
  { ruta: '/vehiculo', nombre: 'Vehículo' },
  { ruta: '/presupuesto', nombre: 'Presupuesto' },
  { ruta: '/deudas', nombre: 'Deudas' },
  { ruta: '/metas', nombre: 'Metas' },
  { ruta: '/inversiones', nombre: 'Inversiones' },
  { ruta: '/reportes', nombre: 'Reportes' },
] as const

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2.5 rounded-lg text-sm ${
    isActive ? 'bg-white/10 text-white font-semibold' : 'text-gray-300 hover:bg-white/5 hover:text-white'
  }`

export default function AppLayout() {
  const { session } = useAuth()

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <nav aria-label="Menú principal" className="md:w-60 md:min-h-screen bg-tinta text-white p-4 flex flex-col gap-1 md:sticky md:top-0 md:h-screen">
        <div className="px-2 pb-5 pt-1">
          <Logo claro />
        </div>
        <div className="flex md:flex-col gap-1 overflow-x-auto">
          {SECCIONES.map((s) => (
            <NavLink key={s.ruta} to={s.ruta} end={s.ruta === '/'} className={linkCls}>
              {s.nombre}
            </NavLink>
          ))}
          <NavLink
            to="/asesor"
            className={({ isActive }) =>
              `block px-3 py-2.5 rounded-lg text-sm font-semibold mt-0 md:mt-3 ${
                isActive ? 'bg-indigo-500/40 text-white' : 'bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/30'
              }`
            }
          >
            Asesor IA
          </NavLink>
        </div>

        <div className="hidden md:block mt-auto border-t border-white/10 pt-3">
          <NavLink to="/ajustes" className={linkCls}>Ajustes</NavLink>
        </div>
        <div className="hidden md:flex flex-col gap-2 pt-2 px-3">
          <span className="text-xs text-gray-400 truncate" title={session?.user.email}>
            {session?.user.email}
          </span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-left text-sm text-gray-300 hover:text-white cursor-pointer"
          >
            Cerrar sesión
          </button>
        </div>
      </nav>

      <main className="flex-1 min-w-0 p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
