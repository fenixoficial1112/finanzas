import { listarJornadas, listarObligaciones, listarPlataformas, obtenerPreferenciasMeta, totalesPorPlataforma } from './datos'
import { haceDias, hoyISO, mesActual, rangoMes } from './fechas'
import { calcularMeta, progresoMes } from './meta'
import { useDatos } from './useDatos'

export const DIAS_HISTORIAL = 30

/** Carga todo lo necesario y calcula la meta diaria y el avance del mes. */
export function useMeta() {
  const r = useDatos(async () => {
    const desde = haceDias(DIAS_HISTORIAL - 1)
    const hoy = hoyISO()
    const mes = rangoMes(mesActual())
    const [obligaciones, prefs, plataformas, jornadas, porPlataforma, jornadasMes] = await Promise.all([
      listarObligaciones(), obtenerPreferenciasMeta(), listarPlataformas(),
      listarJornadas(desde, hoy), totalesPorPlataforma(desde, hoy), listarJornadas(mes.desde, mes.hasta),
    ])
    const totalMes = obligaciones.filter((o) => o.activa).reduce((s, o) => s + o.monto_centavos, 0)
    const meta = calcularMeta(totalMes, prefs.dias_trabajo_semana, prefs.margen_pct, plataformas, { jornadas, porPlataforma })
    const netoMes = jornadasMes.reduce((s, j) => s + j.neto_centavos, 0)
    const netoHoy = jornadasMes.filter((j) => j.fecha === hoy).reduce((s, j) => s + j.neto_centavos, 0)
    return {
      obligaciones, prefs, totalMes, meta, netoMes, netoHoy,
      progreso: progresoMes(meta, netoMes, prefs.dias_trabajo_semana, new Date()),
    }
  }, [])
  return r
}
