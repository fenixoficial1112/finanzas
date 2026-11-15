import type { DeudaConEstado, InversionConValor } from './datos'

/** Interés mensual aproximado de una inversión con tasa fija (centavos). */
export function interesMensualEstimado(inv: InversionConValor): number | null {
  if (inv.tasa_anual == null || inv.estado !== 'activa') return null
  return Math.round((inv.valor_centavos * inv.tasa_anual) / 1200)
}

/** Días que faltan para el vencimiento (null si no tiene). */
export function diasParaVencer(inv: InversionConValor, hoy = new Date()): number | null {
  if (!inv.fecha_vencimiento) return null
  const [a, m, d] = inv.fecha_vencimiento.split('-').map(Number)
  const base = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((Date.UTC(a, m - 1, d) - base) / 86_400_000)
}

/** Ganancia en % sobre lo aportado. */
export function rendimientoPct(inv: InversionConValor): number | null {
  return inv.aportado_centavos > 0 ? (inv.ganancia_centavos / inv.aportado_centavos) * 100 : null
}

/**
 * Consejo simple (sin IA) que compara las deudas con lo que rinden las inversiones.
 * Devuelve null si no hay nada importante que decir.
 */
export function consejoBasico(deudas: DeudaConEstado[], inversiones: InversionConValor[]): string | null {
  const activas = deudas.filter((d) => !d.pagada && d.saldo_centavos > 0)
  const masCara = [...activas].sort((a, b) => b.tasa_anual - a.tasa_anual)[0]
  const tasas = inversiones.filter((i) => i.estado === 'activa' && i.tasa_anual != null).map((i) => i.tasa_anual!)
  const mejor = tasas.length ? Math.max(...tasas) : null
  if (masCara && masCara.tasa_anual >= 20) {
    return mejor != null && mejor < masCara.tasa_anual
      ? `Tu ${masCara.nombre} cobra ${masCara.tasa_anual}% al año y tu mejor inversión gana ${mejor}%. Cada peso que abonas a esa deuda te “rinde” ${masCara.tasa_anual}%: conviene pagarla antes de invertir más.`
      : `Tu ${masCara.nombre} cobra ${masCara.tasa_anual}% al año. Es difícil encontrar una inversión segura que rinda eso: lo normal es terminar de pagarla primero.`
  }
  if (activas.length === 0 && inversiones.length === 0) {
    return 'Sin deudas caras, es buen momento para empezar: primero un fondo de emergencia de unos 3 meses de gastos en algo que puedas sacar rápido, y después inversiones a más plazo.'
  }
  return null
}

export const GUIA_INVERSIONES = [
  {
    nombre: 'Certificado financiero',
    texto: 'En bancos y asociaciones de ahorros. Dejas el dinero un plazo fijo (3, 6, 12 meses…) a una tasa acordada. Bajo riesgo; si lo sacas antes puede haber penalidad.',
  },
  {
    nombre: 'Ahorro en dólares',
    texto: 'Cuenta de ahorro en US$. Rinde poco, pero puedes sacar el dinero cuando quieras y te protege si el peso pierde valor frente al dólar.',
  },
  {
    nombre: 'Fondos de inversión',
    texto: 'Los manejan administradoras (AFI) reguladas por la Superintendencia del Mercado de Valores. El rendimiento varía; los hay abiertos (retiras con pocos días de aviso) y cerrados.',
  },
  {
    nombre: 'Bonos',
    texto: 'Deuda del Gobierno (Hacienda, Banco Central) o de empresas, comprada a través de un puesto de bolsa. Plazo y tasa definidos; venderlos antes de tiempo puede darte más o menos de lo que pagaste.',
  },
  {
    nombre: 'Cooperativas',
    texto: 'Suelen pagar tasas más altas que los bancos, pero con más riesgo. Verifica que la cooperativa esté supervisada y no pongas ahí todos tus ahorros.',
  },
]
