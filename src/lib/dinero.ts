export type Moneda = 'DOP' | 'USD'

const formatos: Record<Moneda, Intl.NumberFormat> = {
  DOP: new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }),
  USD: new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'USD' }),
}

/** 123450 centavos → "RD$1,234.50" */
export function formatear(centavos: number, moneda: Moneda = 'DOP'): string {
  return formatos[moneda].format(centavos / 100)
}

/**
 * Convierte lo que escribe el usuario en centavos.
 * Acepta "1,234.50", "1234.5", "RD$ 1,234" o "1234". Devuelve null si no es válido.
 */
export function aCentavos(texto: string): number | null {
  const limpio = texto.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(limpio)) return null
  const centavos = Math.round(Number(limpio) * 100)
  return Number.isSafeInteger(centavos) ? centavos : null
}

/** Centavos → texto para un input ("1234.50"). */
export function aTexto(centavos: number): string {
  return (centavos / 100).toFixed(2)
}

/** Convierte un monto a pesos usando la tasa (pesos por 1 US$). */
export function enPesos(centavos: number, moneda: Moneda, tasaUSD: number): number {
  return moneda === 'USD' ? Math.round(centavos * tasaUSD) : centavos
}
