import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const PASOS = [
  { titulo: 'Crea tus cuentas', texto: 'Efectivo, banco y tu cuenta en dólares.', ruta: '/movimientos' },
  { titulo: 'Registra tu vehículo', texto: 'Para calcular combustible, km y mantenimientos.', ruta: '/vehiculo' },
  { titulo: 'Anota tus deudas', texto: 'Para armar tu plan y saber cuándo quedas libre.', ruta: '/deudas' },
  { titulo: 'Registra tu primera jornada', texto: 'Lo que ganaste hoy en InDrive y Uber.', ruta: '/jornadas' },
]

export default function Inicio() {
  const { session } = useAuth()
  const hoy = new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-suave capitalize">{hoy}</p>
        <h1 className="text-2xl md:text-3xl font-bold">Bienvenido a FENIX APP</h1>
        <p className="text-suave text-sm">Sesión iniciada como {session?.user.email}</p>
      </header>

      <section className="bg-white border border-borde rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Para empezar</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PASOS.map((p, i) => (
            <Link key={p.ruta} to={p.ruta}
              className="group rounded-xl border border-borde p-4 hover:border-marca hover:bg-marca-claro/40">
              <span className="text-xs font-semibold text-marca">Paso {i + 1}</span>
              <p className="font-semibold mt-1">{p.titulo}</p>
              <p className="text-sm text-suave mt-1">{p.texto}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
