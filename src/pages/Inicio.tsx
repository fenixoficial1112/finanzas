import { Link } from 'react-router-dom'
import { Aviso, btnPrincipal, tarjeta } from '../components/ui'
import { listarCuentas, listarMovimientos, obtenerTasaUSD } from '../lib/datos'
import { enPesos, formatear } from '../lib/dinero'
import { fechaLarga, hoyISO, mesActual, nombreMes, rangoMes } from '../lib/fechas'
import { resumir } from '../lib/resumen'
import { useDatos } from '../lib/useDatos'

const PASOS = [
  { titulo: 'Crea tus cuentas', texto: 'Efectivo, banco y tu cuenta en dólares.', ruta: '/cuentas' },
  { titulo: 'Pon la tasa del dólar', texto: 'Para sumar tus US$ al total en pesos.', ruta: '/ajustes' },
  { titulo: 'Anota tus movimientos', texto: 'Lo que ganas y gastas cada día.', ruta: '/movimientos' },
  { titulo: 'Registra tu vehículo', texto: 'Llega en la fase 4.', ruta: '/vehiculo' },
]

export default function Inicio() {
  const mes = mesActual()
  const cuentas = useDatos(() => listarCuentas(), [])
  const tasa = useDatos(obtenerTasaUSD, [])
  const movs = useDatos(() => listarMovimientos(rangoMes(mes)), [mes])

  const lista = cuentas.datos ?? []
  const tasaUSD = tasa.datos ?? null
  const pesos = lista.filter((c) => c.moneda === 'DOP').reduce((s, c) => s + c.saldo_centavos, 0)
  const dolares = lista.filter((c) => c.moneda === 'USD').reduce((s, c) => s + c.saldo_centavos, 0)
  const total = pesos + (tasaUSD ? enPesos(dolares, 'USD', tasaUSD) : 0)
  const resumen = resumir(movs.datos ?? [], lista, tasaUSD)
  const sinCuentas = !cuentas.cargando && lista.length === 0

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <p className="text-sm text-suave">{fechaLarga(hoyISO())}</p>
          <h1 className="text-2xl md:text-3xl font-bold">Resumen de {nombreMes(mes)}</h1>
          {tasaUSD && <p className="text-sm text-suave mt-1">Tasa: {formatear(tasaUSD * 100)} por US$1</p>}
        </div>
        <Link to="/movimientos" className={`${btnPrincipal} inline-flex items-center`}>Ver movimientos</Link>
      </header>

      {(cuentas.error || movs.error) && <Aviso>{cuentas.error ?? movs.error}</Aviso>}

      {!sinCuentas && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Dato titulo="Total en pesos" valor={formatear(total)} nota={dolares && !tasaUSD ? 'Sin contar dólares (falta la tasa)' : undefined} />
          <Dato titulo="En dólares" valor={formatear(dolares, 'USD')} />
          <Dato titulo="Ingresos del mes" valor={formatear(resumen.ingresos)} color="text-marca" />
          <Dato titulo="Gastos del mes" valor={formatear(resumen.gastos)} color="text-peligro" />
        </div>
      )}

      <section className={`${tarjeta} p-6 space-y-4`}>
        <h2 className="text-lg font-semibold">{sinCuentas ? 'Para empezar' : 'Siguientes pasos'}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PASOS.map((p, i) => (
            <Link key={p.ruta} to={p.ruta} className="rounded-xl border border-borde p-4 hover:border-marca hover:bg-marca-claro/40">
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

function Dato({ titulo, valor, color = '', nota }: { titulo: string; valor: string; color?: string; nota?: string }) {
  return (
    <div className={`${tarjeta} p-5`}>
      <p className="text-sm text-suave">{titulo}</p>
      <p className={`text-2xl font-bold ${color}`}>{valor}</p>
      {nota && <p className="text-xs text-suave mt-1">{nota}</p>}
    </div>
  )
}
