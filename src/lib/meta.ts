import type { JornadaResumen, Plataforma } from './datos'

/** Semanas promedio en un mes (52 / 12). */
const SEMANAS_POR_MES = 52 / 12

export interface Historial {
  /** Jornadas de los últimos días, para sacar promedios reales. */
  jornadas: JornadaResumen[]
  /** Totales por plataforma en ese mismo periodo. */
  porPlataforma: Map<string, { viajes: number; bruto: number; comision: number }>
}

export interface PlanPlataforma {
  plataforma: Plataforma
  /** Lo que hay que facturar (bruto) en un día solo con esta app. */
  brutoDiario: number
  /** Viajes aproximados por día, según el promedio por viaje real. */
  viajesDiarios: number | null
  /** % de lo bruto que se va en comisión en esta app (real o configurado). */
  comisionPct: number
}

export interface MetaDiaria {
  obligacionesMes: number
  conMargen: number
  diasTrabajoMes: number
  /** Ganancia neta necesaria por día de trabajo (ya restados comisión y gastos). */
  netoDiario: number
  /** % de lo bruto que se fue en gastos de jornada (combustible, lavado…) según el historial. */
  gastosPct: number | null
  /** Horas aproximadas por día, según el neto por hora real. */
  horasDiarias: number | null
  netoPorHora: number | null
  plataformas: PlanPlataforma[]
  jornadasEnHistorial: number
}

export function calcularMeta(
  obligacionesMes: number,
  diasSemana: number,
  margenPct: number,
  plataformas: Plataforma[],
  h: Historial,
): MetaDiaria {
  const conMargen = Math.round(obligacionesMes * (1 + margenPct / 100))
  const diasTrabajoMes = diasSemana * SEMANAS_POR_MES
  const netoDiario = Math.round(conMargen / diasTrabajoMes)

  const bruto = h.jornadas.reduce((s, j) => s + j.bruto_centavos, 0)
  const gastos = h.jornadas.reduce((s, j) => s + j.gastos_centavos, 0)
  const neto = h.jornadas.reduce((s, j) => s + j.neto_centavos, 0)
  const minutos = h.jornadas.reduce((s, j) => s + j.minutos, 0)
  const gastosPct = bruto > 0 ? gastos / bruto : null
  const netoPorHora = minutos > 0 && neto > 0 ? neto / (minutos / 60) : null

  const planes = plataformas
    .filter((p) => p.activa)
    .map((p) => {
      const t = h.porPlataforma.get(p.id)
      const comisionPct = t && t.bruto > 0 ? t.comision / t.bruto : p.comision_pct / 100
      // De cada peso bruto queda: 1 − comisión − gastos de operación.
      const queda = 1 - comisionPct - (gastosPct ?? 0)
      const brutoDiario = queda > 0.05 ? Math.round(netoDiario / queda) : 0
      const promedioViaje = t && t.viajes > 0 ? t.bruto / t.viajes : null
      return {
        plataforma: p,
        brutoDiario,
        viajesDiarios: promedioViaje ? Math.ceil(brutoDiario / promedioViaje) : null,
        comisionPct,
      }
    })

  return {
    obligacionesMes,
    conMargen,
    diasTrabajoMes,
    netoDiario,
    gastosPct,
    horasDiarias: netoPorHora ? netoDiario / netoPorHora : null,
    netoPorHora,
    plataformas: planes,
    jornadasEnHistorial: h.jornadas.length,
  }
}

/** Cuánto falta por día en lo que queda del mes. */
export function progresoMes(meta: MetaDiaria, netoMes: number, diasSemana: number, hoy: Date) {
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const diasRestantes = ultimoDia - hoy.getDate() + 1
  const diasTrabajoRestantes = Math.max(1, Math.round((diasRestantes * diasSemana) / 7))
  const falta = Math.max(0, meta.conMargen - netoMes)
  return {
    avance: meta.conMargen > 0 ? Math.min(1, netoMes / meta.conMargen) : 0,
    falta,
    diasTrabajoRestantes,
    netoDiarioRestante: Math.round(falta / diasTrabajoRestantes),
  }
}
