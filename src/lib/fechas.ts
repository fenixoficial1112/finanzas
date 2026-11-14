const dos = (n: number) => String(n).padStart(2, '0')

/** Fecha de hoy en hora local como "AAAA-MM-DD". */
export function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

/** Mes actual como "AAAA-MM". */
export function mesActual(): string {
  return hoyISO().slice(0, 7)
}

/** Primer y último día de un mes "AAAA-MM". */
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${dos(ultimo)}` }
}

/** "2026-11-14" → "sábado, 14 de noviembre" */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const t = new Date(a, m - 1, d).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** "2026-11" → "noviembre 2026" */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })
}
