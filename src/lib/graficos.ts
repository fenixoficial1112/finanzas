// Colores (paleta validada para daltonismo sobre fondo blanco) y formato de ejes.
export const COLORES = {
  serie1: '#2a78d6', // azul
  serie2: '#eb6834', // naranja
  serie3: '#1baf7a', // aqua
  superficie: '#ffffff',
  tinta: '#0b0b0b',
  tinta2: '#52514e',
  apagado: '#6b6a65',
  rejilla: '#e1e0d9',
  base: '#c3c2b7',
}

/** Montos de eje en forma compacta (centavos → "RD$5K"). */
export function compacto(centavos: number, prefijo = 'RD$'): string {
  const v = centavos / 100
  const abs = Math.abs(v)
  const signo = v < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${signo}${prefijo}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.0', '')}M`
  if (abs >= 10_000) return `${signo}${prefijo}${Math.round(abs / 1000)}K`
  return `${signo}${prefijo}${Math.round(abs).toLocaleString('es-DO')}`
}
