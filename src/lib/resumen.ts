import type { CuentaConSaldo, Movimiento } from './datos'
import { enPesos } from './dinero'

export interface Resumen {
  ingresos: number
  gastos: number
  neto: number
  /** true si hubo montos en dólares que no se pudieron convertir por falta de tasa. */
  faltaTasa: boolean
}

/** Suma ingresos y gastos en pesos. Las transferencias no cuentan como ingreso ni gasto. */
export function resumir(movs: Movimiento[], cuentas: CuentaConSaldo[], tasaUSD: number | null): Resumen {
  const moneda = new Map(cuentas.map((c) => [c.id, c.moneda]))
  let ingresos = 0
  let gastos = 0
  let faltaTasa = false
  for (const m of movs) {
    if (m.tipo === 'transferencia') continue
    const mon = moneda.get(m.cuenta_id) ?? 'DOP'
    if (mon === 'USD' && !tasaUSD) {
      faltaTasa = true
      continue
    }
    const pesos = enPesos(m.monto_centavos, mon, tasaUSD ?? 0)
    if (m.tipo === 'ingreso') ingresos += pesos
    else gastos += pesos
  }
  return { ingresos, gastos, neto: ingresos - gastos, faltaTasa }
}
