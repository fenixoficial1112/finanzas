// Simulador de pago de deudas mes a mes. Todos los montos en centavos.

export type Estrategia = 'avalancha' | 'bola_nieve' | 'minimos'

export interface DeudaSim {
  id: string
  nombre: string
  saldo: number
  tasaAnual: number
  cuota: number
}

export interface ResultadoSim {
  estrategia: Estrategia
  /** Meses hasta quedar libre de deudas (null si con estos pagos nunca se termina). */
  meses: number | null
  totalIntereses: number
  totalPagado: number
  /** Mes (1 = este mes) en que se liquida cada deuda. */
  mesLiquidada: Record<string, number | null>
  /** Orden en que se atacan las deudas. */
  orden: string[]
  /** Cuánto pagar a cada deuda este mes. */
  planEsteMes: Record<string, number>
}

const MAX_MESES = 600

export const interesMensual = (saldo: number, tasaAnual: number) => Math.round((saldo * tasaAnual) / 1200)

export function ordenar(deudas: DeudaSim[], estrategia: Estrategia): DeudaSim[] {
  const copia = [...deudas]
  if (estrategia === 'bola_nieve') copia.sort((a, b) => a.saldo - b.saldo || b.tasaAnual - a.tasaAnual)
  else copia.sort((a, b) => b.tasaAnual - a.tasaAnual || a.saldo - b.saldo)
  return copia
}

/**
 * Cada mes: se suman los intereses, se paga la cuota de cada deuda y todo lo demás
 * (el pago extra + las cuotas de las deudas ya liquidadas) va a la deuda prioritaria.
 * Con 'minimos' solo se paga la cuota de cada una, sin extra ni efecto bola de nieve.
 */
export function simular(deudas: DeudaSim[], estrategia: Estrategia, extra: number): ResultadoSim {
  const orden = ordenar(deudas.filter((d) => d.saldo > 0), estrategia)
  const saldos = new Map(orden.map((d) => [d.id, d.saldo]))
  const mesLiquidada: Record<string, number | null> = Object.fromEntries(deudas.map((d) => [d.id, d.saldo > 0 ? null : 0]))
  const presupuestoFijo = orden.reduce((s, d) => s + d.cuota, 0) + (estrategia === 'minimos' ? 0 : extra)
  let totalIntereses = 0
  let totalPagado = 0
  let planEsteMes: Record<string, number> = {}
  let meses: number | null = orden.length === 0 ? 0 : null

  for (let mes = 1; mes <= MAX_MESES && meses === null; mes++) {
    const pagos: Record<string, number> = {}
    for (const d of orden) {
      const s = saldos.get(d.id)!
      if (s <= 0) continue
      const i = interesMensual(s, d.tasaAnual)
      totalIntereses += i
      saldos.set(d.id, s + i)
    }
    let disponible = presupuestoFijo
    // 1) Cuotas
    for (const d of orden) {
      const s = saldos.get(d.id)!
      if (s <= 0) continue
      const pago = Math.min(d.cuota, s, estrategia === 'minimos' ? d.cuota : disponible)
      saldos.set(d.id, s - pago)
      pagos[d.id] = pago
      disponible -= pago
    }
    // 2) El resto a la deuda prioritaria (si no es "solo mínimos")
    if (estrategia !== 'minimos') {
      for (const d of orden) {
        if (disponible <= 0) break
        const s = saldos.get(d.id)!
        if (s <= 0) continue
        const pago = Math.min(disponible, s)
        saldos.set(d.id, s - pago)
        pagos[d.id] = (pagos[d.id] ?? 0) + pago
        disponible -= pago
      }
    }
    for (const d of orden) {
      totalPagado += pagos[d.id] ?? 0
      if (mesLiquidada[d.id] === null && saldos.get(d.id)! <= 0) mesLiquidada[d.id] = mes
    }
    if (mes === 1) planEsteMes = pagos
    if (orden.every((d) => saldos.get(d.id)! <= 0)) meses = mes
  }

  return { estrategia, meses, totalIntereses, totalPagado, mesLiquidada, orden: orden.map((d) => d.id), planEsteMes }
}

/** "2026-11" + n meses → "abril de 2028" */
export function mesFuturo(meses: number, desde = new Date()): string {
  const f = new Date(desde.getFullYear(), desde.getMonth() + meses - 1, 1)
  return f.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })
}

/** Próxima fecha de pago a partir de hoy para un día del mes (ajusta meses cortos). */
export function proximoPago(diaPago: number, hoy = new Date()): Date {
  const enMes = (a: number, m: number) => new Date(a, m, Math.min(diaPago, new Date(a, m + 1, 0).getDate()))
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const esteMes = enMes(hoy.getFullYear(), hoy.getMonth())
  return esteMes >= base ? esteMes : enMes(hoy.getFullYear(), hoy.getMonth() + 1)
}
