import { listarDeudas, listarJornadas, listarMetas, listarObligaciones, obtenerTasaUSD, listarPlataformas, obtenerPreferenciasMeta, totalesPorPlataforma } from './datos'
import { haceDias, hoyISO, mesActual, rangoMes } from './fechas'
import { calcularMeta, progresoMes } from './meta'
import { estadoMeta } from './metas'
import { enPesos } from './dinero'
import { useDatos } from './useDatos'

export const DIAS_HISTORIAL = 30

/** Carga todo lo necesario y calcula la meta diaria y el avance del mes. */
export async function cargarMeta() {
  const desde = haceDias(DIAS_HISTORIAL - 1)
  const hoy = hoyISO()
  const mes = rangoMes(mesActual())
  const [obligaciones, prefs, plataformas, jornadas, porPlataforma, jornadasMes, deudas, metas, tasa] = await Promise.all([
    listarObligaciones(), obtenerPreferenciasMeta(), listarPlataformas(),
    listarJornadas(desde, hoy), totalesPorPlataforma(desde, hoy), listarJornadas(mes.desde, mes.hasta), listarDeudas(),
    listarMetas(), obtenerTasaUSD(),
  ])
  // Las cuotas de las deudas activas se suman solas a las obligaciones.
  const cuotas = deudas.filter((d) => d.incluir_en_meta && !d.pagada && d.saldo_centavos > 0 && d.cuota_centavos > 0)
  // Y también el aporte mensual de las metas activas que el usuario quiso incluir.
  const aportesMetas = metas
    .filter((m) => m.estado === 'activa' && m.incluir_en_meta)
    .map((m) => {
      const e = estadoMeta(m.monto_objetivo_centavos, m.ahorrado_centavos, m.fecha_objetivo, m.creado_en)
      const mensual = m.moneda === 'USD' ? (tasa ? enPesos(e.aporteMensual, 'USD', tasa) : 0) : e.aporteMensual
      return { id: m.id, nombre: m.nombre, mensual }
    })
    .filter((x) => x.mensual > 0)
  const totalMes =
    obligaciones.filter((o) => o.activa).reduce((s, o) => s + o.monto_centavos, 0) +
    cuotas.reduce((s, d) => s + d.cuota_centavos, 0) +
    aportesMetas.reduce((s, m) => s + m.mensual, 0)
  const meta = calcularMeta(totalMes, prefs.dias_trabajo_semana, prefs.margen_pct, plataformas, { jornadas, porPlataforma })
  const netoMes = jornadasMes.reduce((s, j) => s + j.neto_centavos, 0)
  const netoHoy = jornadasMes.filter((j) => j.fecha === hoy).reduce((s, j) => s + j.neto_centavos, 0)
  return {
    obligaciones, cuotas, aportesMetas, prefs, totalMes, meta, netoMes, netoHoy,
    progreso: progresoMes(meta, netoMes, prefs.dias_trabajo_semana, new Date()),
  }
}

export function useMeta() {
  return useDatos(cargarMeta, [])
}
