// Cálculos de los reportes. Funciones puras (sin Supabase) para poder probarlas.
import type { CuentaConSaldo, DeudaConEstado, Movimiento, PagoDeuda } from './datos'
import { enPesos, type Moneda } from './dinero'

const dos = (n: number) => String(n).padStart(2, '0')

/** Los últimos `n` meses terminando en `mesFinal` ("AAAA-MM"), del más viejo al más nuevo. */
export function ultimosMeses(mesFinal: string, n: number): string[] {
  const [a, m] = mesFinal.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(a, m - 1 - (n - 1 - i), 1)
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}`
  })
}

/** Último día de un mes "AAAA-MM" como "AAAA-MM-DD". */
export function finDeMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${dos(new Date(a, m, 0).getDate())}`
}

/** "2026-11" → "nov 26" (para ejes) */
export function mesCorto(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const t = new Date(a, m - 1, 1).toLocaleDateString('es-DO', { month: 'short' }).replace('.', '')
  return `${t} ${String(a).slice(2)}`
}

/** Efecto de un movimiento en el saldo de una cuenta (centavos, en la moneda de la cuenta). */
function efecto(m: Movimiento, cuentaId: string): number {
  if (m.tipo === 'ingreso') return m.cuenta_id === cuentaId ? m.monto_centavos : 0
  if (m.tipo === 'gasto') return m.cuenta_id === cuentaId ? -m.monto_centavos : 0
  let e = 0
  if (m.cuenta_id === cuentaId) e -= m.monto_centavos
  if (m.cuenta_destino_id === cuentaId) e += m.monto_destino_centavos ?? m.monto_centavos
  return e
}

/**
 * Saldo de cada cuenta al cierre de `fecha` (incluida), partiendo del saldo actual y
 * deshaciendo los movimientos posteriores. `movs` debe incluir todos los posteriores a `fecha`.
 */
export function saldosAl(fecha: string, cuentas: CuentaConSaldo[], movs: Movimiento[]): Map<string, number> {
  const res = new Map(cuentas.map((c) => [c.id, c.saldo_centavos]))
  for (const m of movs) {
    if (m.fecha <= fecha) continue
    for (const id of [m.cuenta_id, m.cuenta_destino_id]) {
      if (id && res.has(id)) res.set(id, res.get(id)! - efecto(m, id))
    }
  }
  return res
}

/** Saldo de cada deuda al cierre de `fecha`, deshaciendo pagos (capital) y cargos posteriores. */
export function deudasAl(fecha: string, deudas: DeudaConEstado[], pagos: PagoDeuda[]): Map<string, number> {
  const res = new Map<string, number>()
  for (const d of deudas) {
    if (d.creado_en && d.creado_en.slice(0, 10) > fecha) continue
    let s = d.saldo_centavos
    for (const p of pagos) {
      if (p.deuda_id !== d.id || p.fecha <= fecha) continue
      s += p.tipo === 'pago' ? p.monto_centavos - p.interes_centavos : -p.monto_centavos
    }
    res.set(d.id, Math.max(0, s))
  }
  return res
}

export interface PuntoPatrimonio {
  mes: string
  activos: number
  deudas: number
  patrimonio: number
}

/** Patrimonio (lo que tienes − lo que debes) al cierre de cada mes, en pesos. */
export function patrimonioPorMes(
  meses: string[], hoy: string, cuentas: CuentaConSaldo[], movs: Movimiento[], tasaUSD: number | null,
  deudas: DeudaConEstado[], pagos: PagoDeuda[],
): PuntoPatrimonio[] {
  const moneda = new Map<string, Moneda>(cuentas.map((c) => [c.id, c.moneda]))
  return meses.map((mes) => {
    const corte = finDeMes(mes) < hoy ? finDeMes(mes) : hoy
    let activos = 0
    for (const [id, s] of saldosAl(corte, cuentas, movs)) {
      const mon = moneda.get(id) ?? 'DOP'
      if (mon === 'USD' && !tasaUSD) continue
      activos += enPesos(s, mon, tasaUSD ?? 0)
    }
    const debe = [...deudasAl(corte, deudas, pagos).values()].reduce((a, b) => a + b, 0)
    return { mes, activos, deudas: debe, patrimonio: activos - debe }
  })
}

/** Agrupa una lista en los N mayores + "Otros". */
export function topConOtros<T extends { valor: number }>(items: T[], n: number, otros: (resto: number) => T): T[] {
  const orden = [...items].sort((a, b) => b.valor - a.valor)
  if (orden.length <= n) return orden
  const resto = orden.slice(n - 1).reduce((s, x) => s + x.valor, 0)
  return [...orden.slice(0, n - 1), otros(resto)]
}
