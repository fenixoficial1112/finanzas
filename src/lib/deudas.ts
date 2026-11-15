import type { DeudaConEstado, FrecuenciaPago, SistemaPrestamo } from './datos'

// Simulador de pago de deudas mes a mes. Todos los montos en centavos.

export type Estrategia = 'avalancha' | 'bola_nieve' | 'minimos'

export interface DeudaSim {
  id: string
  nombre: string
  saldo: number
  tasaAnual: number
  /** Cuota al mes (en capital_fijo: el abono a capital al mes). */
  cuota: number
  sistema?: SistemaPrestamo
  /** Monto prestado (base del interés fijo). */
  base?: number
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

/** Interés de un mes en la simulación según cómo se calcula el préstamo. */
function interesMesSim(d: DeudaSim, saldo: number): number {
  return d.sistema === 'interes_fijo' ? interesMensual(d.base ?? d.saldo, d.tasaAnual) : interesMensual(saldo, d.tasaAnual)
}
/** Lo mínimo que se paga en un mes (ya con el interés sumado al saldo). */
function minimoMes(d: DeudaSim, interes: number): number {
  if (d.sistema === 'capital_fijo') return d.cuota + interes
  if (d.sistema === 'solo_interes') return interes
  return d.cuota
}

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
  // Lo que se destina a deudas cada mes: los mínimos del primer mes + el extra (lo que se libera va a la prioritaria).
  const presupuestoFijo = orden.reduce((s, d) => s + minimoMes(d, interesMesSim(d, d.saldo)), 0) + (estrategia === 'minimos' ? 0 : extra)
  let totalIntereses = 0
  let totalPagado = 0
  let planEsteMes: Record<string, number> = {}
  let meses: number | null = orden.length === 0 ? 0 : null

  for (let mes = 1; mes <= MAX_MESES && meses === null; mes++) {
    const pagos: Record<string, number> = {}
    const minimos: Record<string, number> = {}
    for (const d of orden) {
      const s = saldos.get(d.id)!
      if (s <= 0) continue
      const i = interesMesSim(d, s)
      totalIntereses += i
      saldos.set(d.id, s + i)
      minimos[d.id] = minimoMes(d, i)
    }
    let disponible = presupuestoFijo
    // 1) Cuotas
    for (const d of orden) {
      const s = saldos.get(d.id)!
      if (s <= 0) continue
      const pago = Math.min(minimos[d.id], s, estrategia === 'minimos' ? minimos[d.id] : disponible)
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

// ---------- Frecuencias de pago ----------

/** Pagos por mes según la frecuencia (diaria: 30 días). */
export const PAGOS_POR_MES: Record<FrecuenciaPago, number> = { mensual: 1, quincenal: 2, semanal: 52 / 12, diaria: 30 }

/** Cuota mensual equivalente (centavos) de una deuda que se paga con cierta frecuencia. */
export function cuotaMensual(cuota: number, frecuencia: FrecuenciaPago | undefined): number {
  return Math.round(cuota * PAGOS_POR_MES[frecuencia ?? 'mensual'])
}

export type PeriodoTasa = 'anual' | 'mensual' | 'quincenal' | 'semanal' | 'diaria'
const VECES_AL_ANIO: Record<PeriodoTasa, number> = { anual: 1, mensual: 12, quincenal: 24, semanal: 52, diaria: 365 }

/** Convierte una tasa de cualquier periodo a tasa anual simple (%). */
export const tasaAnual = (tasa: number, periodo: PeriodoTasa) => tasa * VECES_AL_ANIO[periodo]

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** Próxima fecha de pago según la frecuencia (null si no hay datos suficientes). */
export function proximoPagoDeuda(
  d: { frecuencia?: FrecuenciaPago; dia_pago: number | null; dia_pago_2?: number | null; dia_semana?: number | null },
  hoy = new Date(),
): Date | null {
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  switch (d.frecuencia ?? 'mensual') {
    case 'diaria':
      return base
    case 'semanal': {
      if (d.dia_semana == null) return null
      const f = new Date(base)
      f.setDate(f.getDate() + ((d.dia_semana - f.getDay() + 7) % 7))
      return f
    }
    case 'quincenal': {
      const fechas = [d.dia_pago, d.dia_pago_2].filter((x): x is number => x != null).map((dia) => proximoPago(dia, hoy))
      return fechas.length ? new Date(Math.min(...fechas.map((f) => f.getTime()))) : null
    }
    default:
      return d.dia_pago ? proximoPago(d.dia_pago, hoy) : null
  }
}

/** "Cuota RD$1,800 quincenal (días 15 y 30)" → solo la parte de cuándo. */
export function textoFrecuencia(d: { frecuencia?: FrecuenciaPago; dia_pago: number | null; dia_pago_2?: number | null; dia_semana?: number | null }): string {
  switch (d.frecuencia ?? 'mensual') {
    case 'diaria': return 'cada día'
    case 'semanal': return d.dia_semana != null ? `cada ${DIAS_SEMANA[d.dia_semana]}` : 'cada semana'
    case 'quincenal': return d.dia_pago && d.dia_pago_2 ? `los días ${d.dia_pago} y ${d.dia_pago_2}` : 'cada quincena'
    default: return d.dia_pago ? `el día ${d.dia_pago}` : 'cada mes'
  }
}

// ---------- Interés y capital de cada pago ----------

/** Pagos al año según la frecuencia. */
export const PAGOS_POR_ANIO: Record<FrecuenciaPago, number> = { mensual: 12, quincenal: 24, semanal: 52, diaria: 365 }

export interface DatosPrestamo {
  saldo: number
  tasa_anual: number
  /** Cuota por pago (en capital_fijo: el abono a capital por pago). */
  cuota: number
  frecuencia: FrecuenciaPago
  sistema: SistemaPrestamo
  monto_prestado: number | null
}

export const datosPrestamo = (d: DeudaConEstado): DatosPrestamo => ({
  saldo: Math.max(0, d.saldo_centavos),
  tasa_anual: d.tasa_anual,
  cuota: d.cuota_centavos,
  frecuencia: d.frecuencia ?? 'mensual',
  sistema: d.cuenta_tarjeta_id || d.tipo === 'tarjeta' ? 'cuota_fija' : d.sistema ?? 'cuota_fija',
  monto_prestado: d.monto_prestado_centavos ?? d.saldo_inicial_centavos ?? null,
})

/** Interés que lleva el próximo pago, con la tasa repartida entre los pagos del año. */
export function interesDelPago(p: DatosPrestamo, saldo = p.saldo): number {
  if (saldo <= 0 || p.tasa_anual <= 0) return 0
  const base = p.sistema === 'interes_fijo' ? p.monto_prestado || saldo : saldo
  return Math.round((base * p.tasa_anual) / 100 / PAGOS_POR_ANIO[p.frecuencia])
}

/** Cuánto toca pagar en el próximo pago, y cuánto de eso es interés y cuánto capital. */
export function desglosePago(p: DatosPrestamo, saldo = p.saldo): { cuota: number; interes: number; capital: number } {
  const interes = interesDelPago(p, saldo)
  let cuota: number
  if (p.sistema === 'capital_fijo') cuota = Math.min(p.cuota, saldo) + interes
  else if (p.sistema === 'solo_interes') cuota = interes
  else cuota = Math.min(p.cuota, saldo + interes)
  return { cuota, interes: Math.min(interes, cuota), capital: Math.max(0, cuota - interes) }
}

export interface FilaAmortizacion { n: number; cuota: number; interes: number; capital: number; saldo: number }

/**
 * Tabla de pagos desde el saldo de hoy: cuota, interés, capital y saldo después de cada pago.
 * `nuncaTermina` es true si con esa cuota el capital no baja.
 */
export function amortizacion(p: DatosPrestamo, maxPagos = 1000): { filas: FilaAmortizacion[]; nuncaTermina: boolean; totalIntereses: number; totalPagado: number } {
  const filas: FilaAmortizacion[] = []
  let saldo = p.saldo
  let totalIntereses = 0
  let totalPagado = 0
  for (let n = 1; saldo > 0 && n <= maxPagos; n++) {
    const { cuota, interes, capital } = desglosePago(p, saldo)
    if (capital <= 0) {
      // Solo se cubren réditos (o ni eso): se muestran unos pagos para que se vea que el saldo no baja.
      for (let k = 0; k < 3; k++) filas.push({ n: n + k, cuota, interes, capital: 0, saldo })
      return { filas, nuncaTermina: true, totalIntereses, totalPagado }
    }
    saldo -= capital
    totalIntereses += interes
    totalPagado += cuota
    filas.push({ n, cuota, interes, capital, saldo })
  }
  return { filas, nuncaTermina: saldo > 0, totalIntereses, totalPagado }
}

/** Deuda lista para el simulador (todo llevado a meses). */
export function aSimulacion(d: DeudaConEstado): DeudaSim {
  const p = datosPrestamo(d)
  return {
    id: d.id, nombre: d.nombre, saldo: d.saldo_centavos, tasaAnual: d.tasa_anual,
    cuota: cuotaMensual(d.cuota_centavos, d.frecuencia), sistema: p.sistema, base: p.monto_prestado ?? undefined,
  }
}

/** Interés y pago mínimo de este mes (lo que cuesta mantener la deuda), según el tipo de préstamo. */
export function mesDeDeuda(d: DeudaConEstado): { interes: number; cuota: number } {
  const p = datosPrestamo(d)
  const veces = PAGOS_POR_MES[p.frecuencia]
  const { cuota, interes } = desglosePago(p)
  return { interes: Math.round(interes * veces), cuota: Math.round(cuota * veces) }
}
