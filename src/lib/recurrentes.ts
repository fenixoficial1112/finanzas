// Fechas de los movimientos recurrentes. Funciones puras (fechas como "AAAA-MM-DD").

export type FrecuenciaRecurrente = 'mensual' | 'quincenal' | 'semanal' | 'diaria' | 'anual'

export interface Programacion {
  frecuencia: FrecuenciaRecurrente
  dia_mes: number | null
  dia_mes_2: number | null
  dia_semana: number | null
  mes: number | null
}

const dos = (n: number) => String(n).padStart(2, '0')
const aISO = (d: Date) => `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`
const deISO = (s: string) => {
  const [a, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}
const diasDelMes = (a: number, m0: number) => new Date(Date.UTC(a, m0 + 1, 0)).getUTCDate()
/** Día del mes ajustado a meses cortos (el 31 en febrero → 28/29). */
const enMes = (a: number, m0: number, dia: number) => new Date(Date.UTC(a, m0, Math.min(dia, diasDelMes(a, m0))))

export const sumarDias = (iso: string, n: number) => {
  const d = deISO(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return aISO(d)
}

/** Próxima fecha estrictamente DESPUÉS de `fecha`. */
export function siguienteFecha(p: Programacion, fecha: string): string {
  const f = deISO(fecha)
  const a = f.getUTCFullYear()
  const m = f.getUTCMonth()
  switch (p.frecuencia) {
    case 'diaria':
      return sumarDias(fecha, 1)
    case 'semanal': {
      const dia = p.dia_semana ?? f.getUTCDay()
      return sumarDias(fecha, ((dia - f.getUTCDay() + 7) % 7) || 7)
    }
    case 'anual': {
      const mes0 = (p.mes ?? m + 1) - 1
      const dia = p.dia_mes ?? f.getUTCDate()
      const esteAnio = enMes(a, mes0, dia)
      return aISO(esteAnio > f ? esteAnio : enMes(a + 1, mes0, dia))
    }
    case 'quincenal': {
      const dias = [p.dia_mes ?? 15, p.dia_mes_2 ?? 30]
      const candidatos = [m, m + 1].flatMap((mm) => dias.map((d) => enMes(a, mm, d))).filter((c) => c > f)
      return aISO(new Date(Math.min(...candidatos.map((c) => c.getTime()))))
    }
    default: {
      const dia = p.dia_mes ?? f.getUTCDate()
      const esteMes = enMes(a, m, dia)
      return aISO(esteMes > f ? esteMes : enMes(a, m + 1, dia))
    }
  }
}

/** Primera fecha que toca a partir de `desde` (incluida). */
export const primeraFecha = (p: Programacion, desde: string) => siguienteFecha(p, sumarDias(desde, -1))

/** Fechas entre `desde` y `hasta` (incluidas), empezando en `inicio`. Máximo 400 por seguridad. */
export function fechasEntre(p: Programacion, inicio: string, desde: string, hasta: string, fin?: string | null): string[] {
  const res: string[] = []
  let f = inicio
  for (let i = 0; i < 400 && f <= hasta && (!fin || f <= fin); i++) {
    if (f >= desde) res.push(f)
    f = siguienteFecha(p, f)
  }
  return res
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "cada mes, el día 1" · "los días 15 y 30" · "cada lunes" · "cada año, el 5 de marzo" */
export function describir(p: Programacion): string {
  switch (p.frecuencia) {
    case 'diaria': return 'cada día'
    case 'semanal': return `cada ${DIAS[p.dia_semana ?? 1]}`
    case 'quincenal': return `los días ${p.dia_mes ?? 15} y ${p.dia_mes_2 ?? 30} de cada mes`
    case 'anual': return `cada año, el ${p.dia_mes ?? 1} de ${MESES[(p.mes ?? 1) - 1]}`
    default: return `cada mes, el día ${p.dia_mes ?? 1}`
  }
}
