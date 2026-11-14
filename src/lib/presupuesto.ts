import type { CuentaConSaldo, Movimiento } from './datos'
import { enPesos } from './dinero'

export type EstadoPresupuesto = 'ok' | 'alerta' | 'excedido'

/** Gasto en pesos por categoría (las transferencias e ingresos no cuentan). */
export function gastoPorCategoria(movs: Movimiento[], cuentas: CuentaConSaldo[], tasaUSD: number | null) {
  const moneda = new Map(cuentas.map((c) => [c.id, c.moneda]))
  const mapa = new Map<string, number>()
  let sinCategoria = 0
  for (const m of movs) {
    if (m.tipo !== 'gasto') continue
    const mon = moneda.get(m.cuenta_id) ?? 'DOP'
    if (mon === 'USD' && !tasaUSD) continue
    const pesos = enPesos(m.monto_centavos, mon, tasaUSD ?? 0)
    if (m.categoria_id) mapa.set(m.categoria_id, (mapa.get(m.categoria_id) ?? 0) + pesos)
    else sinCategoria += pesos
  }
  return { porCategoria: mapa, sinCategoria }
}

export interface Avance {
  gastado: number
  limite: number
  /** gastado / límite (puede pasar de 1). */
  fraccion: number
  restante: number
  estado: EstadoPresupuesto
  /** Lo que se gastaría al final del mes a este ritmo (solo para el mes en curso). */
  proyeccion: number | null
}

/**
 * @param diaActual día del mes de hoy si es el mes en curso; null para meses pasados o futuros.
 */
export function avance(gastado: number, limite: number, umbralPct: number, diaActual: number | null, diasMes: number): Avance {
  const fraccion = limite > 0 ? gastado / limite : 0
  const estado: EstadoPresupuesto = fraccion > 1 ? 'excedido' : fraccion >= umbralPct / 100 ? 'alerta' : 'ok'
  return {
    gastado,
    limite,
    fraccion,
    restante: limite - gastado,
    estado,
    proyeccion: diaActual ? Math.round((gastado / diaActual) * diasMes) : null,
  }
}

/** Promedio mensual de gasto por categoría, redondeado hacia arriba a múltiplos de RD$500. */
export function sugerirLimites(meses: Map<string, number>[]): Map<string, number> {
  const suma = new Map<string, number>()
  for (const m of meses) for (const [cat, v] of m) suma.set(cat, (suma.get(cat) ?? 0) + v)
  const paso = 50_000 // RD$500 en centavos
  const res = new Map<string, number>()
  for (const [cat, total] of suma) {
    const promedio = total / Math.max(1, meses.length)
    if (promedio > 0) res.set(cat, Math.ceil(promedio / paso) * paso)
  }
  return res
}

export const COLORES_PRESUPUESTO: Record<EstadoPresupuesto, { barra: string; texto: string; etiqueta: string }> = {
  ok: { barra: 'bg-marca', texto: 'text-suave', etiqueta: 'bg-marca-claro text-marca-oscuro' },
  alerta: { barra: 'bg-amber-500', texto: 'text-amber-800', etiqueta: 'bg-amber-50 text-amber-800' },
  excedido: { barra: 'bg-red-600', texto: 'text-peligro', etiqueta: 'bg-red-50 text-peligro' },
}
