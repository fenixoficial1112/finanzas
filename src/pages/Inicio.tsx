import { Link } from 'react-router-dom'
import { Aviso, btnPrincipal, tarjeta } from '../components/ui'
import { NOMBRES_DOCUMENTO, listarCategorias, listarInversiones, listarMetas, listarCuentas, listarDeudas, listarPresupuestos, obtenerUmbralAlerta, listarMovimientos, obtenerDatosVehiculo, obtenerTasaUSD } from '../lib/datos'
import { enPesos, formatear } from '../lib/dinero'
import { fechaLarga, hoyISO, mesActual, nombreMes, rangoMes } from '../lib/fechas'
import { resumir } from '../lib/resumen'
import { useDatos } from '../lib/useDatos'
import { useMeta } from '../lib/useMeta'
import { proximoPago } from '../lib/deudas'
import { avance, gastoPorCategoria } from '../lib/presupuesto'
import { estadoMeta, TEXTO_RITMO } from '../lib/metas'
import { diasParaVencer } from '../lib/inversiones'
import { COLORES_ESTADO, estadoDocumento, estadoRecordatorio } from '../lib/vehiculo'

const PASOS = [
  { titulo: 'Crea tus cuentas', texto: 'Efectivo, banco y tu cuenta en dólares.', ruta: '/cuentas' },
  { titulo: 'Registra tu vehículo', texto: 'Combustible, mantenimientos y documentos.', ruta: '/vehiculo' },
  { titulo: 'Anota tus movimientos', texto: 'Lo que ganas y gastas cada día.', ruta: '/movimientos' },
  { titulo: 'Registra tu jornada', texto: 'Lo que ganaste hoy en InDrive y Uber.', ruta: '/jornadas' },
]

export default function Inicio() {
  const mes = mesActual()
  const cuentas = useDatos(() => listarCuentas(), [])
  const tasa = useDatos(obtenerTasaUSD, [])
  const movs = useDatos(() => listarMovimientos(rangoMes(mes)), [mes])
  const vehiculo = useDatos(obtenerDatosVehiculo, [])
  const meta = useMeta().datos
  // Meta de hoy: lo que falta repartido en los días que quedan (o la meta normal si ya se cubrió el mes).
  const metaHoy = meta ? (meta.progreso.falta > 0 ? meta.progreso.netoDiarioRestante : meta.meta.netoDiario) : 0
  const escala = meta && meta.meta.netoDiario > 0 ? metaHoy / meta.meta.netoDiario : 1

  const deudas = useDatos(listarDeudas, [])
  const metas = useDatos(listarMetas, [])
  const inversiones = useDatos(listarInversiones, [])
  const presupuesto = useDatos(async () => {
    const [ps, cats, umbral] = await Promise.all([listarPresupuestos(mes), listarCategorias(), obtenerUmbralAlerta()])
    return { ps, cats, umbral }
  }, [mes])
  const hoy = new Date()
  const alertasDeudas = (deudas.datos ?? [])
    .filter((d) => !d.pagada && d.saldo_centavos > 0 && d.dia_pago)
    .map((d) => {
      const prox = proximoPago(d.dia_pago!, hoy)
      const dias = Math.round((prox.getTime() - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) / 86_400_000)
      // ¿Ya pagó en los últimos 20 días? Entonces no avisamos.
      const pagoReciente = d.ultimo_pago && (hoy.getTime() - new Date(d.ultimo_pago + 'T12:00:00').getTime()) / 86_400_000 < 20
      return { d, dias, pagoReciente }
    })
    .filter(({ dias, pagoReciente }) => dias <= 5 && !pagoReciente)
    .map(({ d, dias }) => ({
      clave: d.id,
      estado: (dias <= 1 ? 'vencido' : 'pronto') as 'vencido' | 'pronto',
      texto: `Pago ${d.nombre}: ${dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`}${d.cuota_centavos ? ` (${formatear(d.cuota_centavos)})` : ''}`,
    }))

  const v = vehiculo.datos
  const alertas = v
    ? [
        ...v.recordatorios.map((r) => estadoRecordatorio(r, v.kmActual)).filter((e) => e.estado !== 'ok')
          .map((e) => ({ clave: e.recordatorio.id, estado: e.estado, texto: `${e.recordatorio.tipo}: ${e.texto}` })),
        ...v.documentos.map((d) => ({ d, e: estadoDocumento(d) })).filter(({ e }) => e.estado !== 'ok')
          .map(({ d, e }) => ({ clave: d.id, estado: e.estado, texto: `${NOMBRES_DOCUMENTO[d.tipo]}: ${e.texto.toLowerCase()}` })),
      ]
    : []
  const alertasPresupuesto = (() => {
    const p = presupuesto.datos
    if (!p || !movs.datos || !cuentas.datos) return []
    const { porCategoria } = gastoPorCategoria(movs.datos, cuentas.datos, tasa.datos ?? null)
    const nombres = new Map(p.cats.map((c) => [c.id, c.nombre]))
    return p.ps
      .map((x) => ({ x, a: avance(porCategoria.get(x.categoria_id) ?? 0, x.limite_centavos, p.umbral, null, 30) }))
      .filter(({ a }) => a.estado !== 'ok')
      .map(({ x, a }) => ({
        clave: x.id,
        estado: (a.estado === 'excedido' ? 'vencido' : 'pronto') as 'vencido' | 'pronto',
        texto: a.estado === 'excedido'
          ? `${nombres.get(x.categoria_id)}: te pasaste del presupuesto por ${formatear(-a.restante)}`
          : `${nombres.get(x.categoria_id)}: llevas el ${Math.round(a.fraccion * 100)}% del presupuesto`,
      }))
  })()
  const alertasInversiones = (inversiones.datos ?? [])
    .filter((i) => i.estado === 'activa')
    .map((i) => ({ i, dias: diasParaVencer(i) }))
    .filter(({ dias }) => dias != null && dias <= 15)
    .map(({ i, dias }) => ({
      clave: i.id,
      estado: (dias! < 0 ? 'vencido' : 'pronto') as 'vencido' | 'pronto',
      texto: dias! < 0 ? `${i.nombre}: venció, decide si renovar o retirar` : `${i.nombre}: vence en ${dias} días`,
    }))
  const todasAlertas = [...alertasDeudas, ...alertasPresupuesto, ...alertasInversiones, ...alertas]

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

      {meta && (
        <Link to="/meta" className="block rounded-2xl bg-tinta text-white p-5 hover:bg-tinta/95">
          {meta.totalMes > 0 ? (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-gray-300">Meta de hoy para ir al día con tus obligaciones</p>
                <p className="text-3xl font-bold">{formatear(meta.netoHoy)} <span className="text-lg text-gray-300 font-semibold">de {formatear(metaHoy)} neto</span></p>
              </div>
              {meta.meta.plataformas[0]?.brutoDiario > 0 && (
                <p className="text-sm text-gray-300">
                  {meta.meta.plataformas.map((p) => `${p.plataforma.nombre}: facturar ${formatear(Math.round(p.brutoDiario * escala))}`).join(' · ')}
                </p>
              )}
              <p className="text-sm text-gray-300">Mes: {Math.round(meta.progreso.avance * 100)}% cubierto →</p>
            </div>
          ) : (
            <p className="font-semibold">¿Cuánto necesitas hacer por día? Anota tus obligaciones del mes y te lo calculo →</p>
          )}
        </Link>
      )}

      {todasAlertas.length > 0 && (
        <section className={`${tarjeta} p-5 space-y-3`}>
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Alertas</h2>
          </div>
          <ul className="flex flex-wrap gap-2">
            {todasAlertas.map((a) => (
              <li key={a.clave} className={`text-sm font-semibold px-3 py-1.5 rounded-full ${COLORES_ESTADO[a.estado].etiqueta}`}>{a.texto}</li>
            ))}
          </ul>
        </section>
      )}

      {(metas.datos ?? []).some((m) => m.estado === 'activa') && (
        <section className={`${tarjeta} p-5 space-y-4`}>
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Mis metas</h2>
            <Link to="/metas" className="text-sm font-semibold text-marca">Ver todas</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(metas.datos ?? []).filter((m) => m.estado === 'activa').slice(0, 3).map((m) => {
              const e = estadoMeta(m.monto_objetivo_centavos, m.ahorrado_centavos, m.fecha_objetivo, m.creado_en)
              return (
                <div key={m.id} className="space-y-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-semibold truncate">{m.nombre}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TEXTO_RITMO[e.ritmo].clase}`}>{TEXTO_RITMO[e.ritmo].texto}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200"><div className="h-2 rounded-full bg-marca" style={{ width: `${Math.max(1, e.fraccion * 100)}%` }} /></div>
                  <p className="text-xs text-suave">{formatear(m.ahorrado_centavos, m.moneda)} de {formatear(m.monto_objetivo_centavos, m.moneda)} · {Math.round(e.fraccion * 100)}%</p>
                </div>
              )
            })}
          </div>
        </section>
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
