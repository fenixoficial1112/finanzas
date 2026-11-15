import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from './Logo'
import { escritorio } from '../lib/escritorio'
import { useActualizacion } from '../lib/useActualizacion'

const SECCIONES = [
  { ruta: '/', nombre: 'Inicio' },
  { ruta: '/meta', nombre: 'Mi meta diaria' },
  { ruta: '/movimientos', nombre: 'Movimientos' },
  { ruta: '/cuentas', nombre: 'Cuentas' },
  { ruta: '/recurrentes', nombre: 'Pagos recurrentes' },
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
  const actualizacion = useActualizacion()
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
        <p className="hidden md:block pt-2 px-3 text-xs text-gray-400">Tus datos se guardan en esta PC</p>
      </nav>

      <main className="flex-1 min-w-0 p-6 md:p-8">
        {actualizacion?.estado === 'lista' && (
          <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-marca text-white px-4 py-3">
            <span className="text-sm"><b>Hay una versión nueva de FENIX APP ({actualizacion.nueva}).</b> Se instala sola al cerrar el programa, o ahora mismo:</span>
            <button className="h-9 px-4 rounded-lg bg-white text-marca-oscuro text-sm font-semibold cursor-pointer" onClick={() => escritorio?.app.instalarActualizacion()}>
              Reiniciar y actualizar
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}
