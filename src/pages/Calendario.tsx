import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Encabezado, tarjeta } from '../components/ui'
import { listarDeudas, listarInversiones, listarMetas, listarMovimientos, listarRecurrentes, obtenerDatosVehiculo } from '../lib/datos'
import { eventosEntre, type Evento, type TipoEvento } from '../lib/calendario'
import { formatear } from '../lib/dinero'
import { fechaLarga, hoyISO, mesActual, moverMes, nombreMes, rangoMes } from '../lib/fechas'
import { useDatos } from '../lib/useDatos'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const ESTILO: Record<TipoEvento, { punto: string; texto: string; nombre: string }> = {
  ingreso: { punto: 'bg-marca', texto: 'text-marca', nombre: 'Ingreso' },
  gasto: { punto: 'bg-peligro', texto: 'text-peligro', nombre: 'Gasto' },
  deuda: { punto: 'bg-amber-500', texto: 'text-amber-700', nombre: 'Cuota de deuda' },
  vence: { punto: 'bg-ia', texto: 'text-ia', nombre: 'Vencimiento' },
  meta: { punto: 'bg-sky-600', texto: 'text-sky-700', nombre: 'Meta' },
}

export default function Calendario() {
  const [mes, setMes] = useState(mesActual())
  const hoy = hoyISO()
  const [dia, setDia] = useState<string | null>(null)
  const datos = useDatos(async () => {
    const r = rangoMes(mes)
    const [recurrentes, movimientos, deudas, vehiculo, metas, inversiones] = await Promise.all([
      listarRecurrentes(), listarMovimientos(r), listarDeudas(), obtenerDatosVehiculo(), listarMetas(), listarInversiones(),
    ])
    return eventosEntre(r.desde, r.hasta, { recurrentes, movimientos, deudas, vehiculo, metas, inversiones })
  }, [mes])

  if (datos.error) return <Aviso>{datos.error}</Aviso>
  const eventos = datos.datos ?? new Map<string, Evento[]>()
  const { desde, hasta } = rangoMes(mes)
  const ultimo = Number(hasta.slice(8))
  // Lunes = 0
  const primerDia = (new Date(`${desde}T12:00:00`).getDay() + 6) % 7
  const celdas: (string | null)[] = [...Array(primerDia).fill(null), ...Array.from({ length: ultimo }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)]
  while (celdas.length % 7) celdas.push(null)

  const lista = dia ? [[dia, eventos.get(dia) ?? []] as const] : [...eventos.entries()].filter(([f]) => f >= (mes === mesActual() ? hoy : desde))
  const pesos = [...eventos.values()].flat().filter((e) => !e.hecho && (e.moneda ?? 'DOP') === 'DOP' && e.fecha >= hoy)
  const salen = pesos.filter((e) => e.tipo === 'gasto' || e.tipo === 'deuda').reduce((s, e) => s + (e.monto ?? 0), 0)
  const entran = pesos.filter((e) => e.tipo === 'ingreso').reduce((s, e) => s + (e.monto ?? 0), 0)

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado titulo="Calendario" subtitulo="Lo que te toca pagar y cobrar en el mes.">
        <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white">
          <button aria-label="Mes anterior" className="h-11 w-11 cursor-pointer hover:bg-gray-50 rounded-l-lg" onClick={() => { setMes(moverMes(mes, -1)); setDia(null) }}>‹</button>
          <span className="inline-block px-2 font-semibold min-w-40 text-center first-letter:uppercase">{nombreMes(mes)}</span>
          <button aria-label="Mes siguiente" className="h-11 w-11 cursor-pointer hover:bg-gray-50 rounded-r-lg" onClick={() => { setMes(moverMes(mes, 1)); setDia(null) }}>›</button>
        </div>
      </Encabezado>

      {mes >= mesActual() && (salen > 0 || entran > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={`${tarjeta} p-5`}><p className="text-sm text-suave">Por pagar {mes === mesActual() ? 'de aquí a fin de mes' : 'este mes'}</p><p className="text-2xl font-bold text-peligro">{formatear(salen)}</p></div>
          <div className={`${tarjeta} p-5`}><p className="text-sm text-suave">Por cobrar (ingresos fijos)</p><p className="text-2xl font-bold text-marca">{formatear(entran)}</p></div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className={`${tarjeta} p-4`}>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-suave mb-1">
            {DIAS.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celdas.map((f, i) => {
              if (!f) return <div key={`v${i}`} />
              const evs = eventos.get(f) ?? []
              const elegido = dia === f
              return (
                <button key={f} onClick={() => setDia(elegido ? null : f)} aria-pressed={elegido}
                  aria-label={`${fechaLarga(f)}${evs.length ? `, ${evs.length} ${evs.length === 1 ? 'evento' : 'eventos'}` : ''}`}
                  className={`min-h-20 rounded-lg border p-1.5 text-left align-top cursor-pointer transition-colors
                    ${elegido ? 'border-marca bg-emerald-50' : 'border-borde hover:bg-gray-50'} ${f < hoy ? 'opacity-60' : ''}`}>
                  <span className={`text-xs font-semibold ${f === hoy ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-marca text-white' : ''}`}>{Number(f.slice(8))}</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {evs.slice(0, 3).map((e, k) => (
                      <li key={k} className="flex items-center gap-1 text-[11px] leading-tight truncate">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ESTILO[e.tipo].punto}`} />
                        <span className={`truncate ${e.hecho ? 'line-through text-suave' : ''}`}>{e.titulo}</span>
                      </li>
                    ))}
                    {evs.length > 3 && <li className="text-[11px] text-suave">+{evs.length - 3} más</li>}
                  </ul>
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-suave">
            {Object.values(ESTILO).map((e) => <span key={e.nombre} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${e.punto}`} />{e.nombre}</span>)}
            <span className="line-through">Ya anotado</span>
          </div>
        </section>

        <section className={`${tarjeta} p-5 space-y-4 self-start`}>
          <h2 className="font-semibold">{dia ? fechaLarga(dia) : mes === mesActual() ? 'Lo que viene' : 'Todo el mes'}</h2>
          {lista.every(([, evs]) => evs.length === 0) ? (
            <p className="text-sm text-suave">
              {dia ? 'Nada para este día.' : <>Nada por ahora. Agrega tus <Link to="/recurrentes" className="text-marca font-semibold">pagos recurrentes</Link> y los días de pago de tus <Link to="/deudas" className="text-marca font-semibold">deudas</Link>.</>}
            </p>
          ) : (
            <ul className="space-y-4">
              {lista.map(([f, evs]) => evs.length > 0 && (
                <li key={f}>
                  {!dia && <p className="text-xs font-semibold text-suave mb-1 first-letter:uppercase">{fechaLarga(f)}</p>}
                  <ul className="space-y-1.5">
                    {evs.map((e, k) => (
                      <li key={k}>
                        <Link to={e.ruta} className="flex items-center gap-2 text-sm hover:underline">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${ESTILO[e.tipo].punto}`} />
                          <span className={`flex-1 ${e.hecho ? 'line-through text-suave' : ''}`}>{e.titulo}</span>
                          {e.monto != null && <span className={`font-semibold ${ESTILO[e.tipo].texto}`}>{formatear(e.monto, e.moneda)}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
