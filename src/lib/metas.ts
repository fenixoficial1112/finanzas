// Cálculos de metas: plazo, aporte sugerido y si va en camino. Montos en centavos.

export type Plazo = 'corto' | 'mediano' | 'largo'

export const NOMBRES_PLAZO: Record<Plazo, string> = {
  corto: 'Corto plazo',
  mediano: 'Mediano plazo',
  largo: 'Largo plazo',
}
export const DESCRIPCION_PLAZO: Record<Plazo, string> = {
  corto: 'menos de 1 año',
  mediano: 'de 1 a 5 años',
  largo: 'más de 5 años',
}

const fecha = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d)
}

/** Meses (con decimales) entre dos fechas. */
function mesesEntre(desde: Date, hasta: Date): number {
  return (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth()) + (hasta.getDate() - desde.getDate()) / 30
}

/** Plazo según cuánto falta desde hoy hasta la fecha objetivo. */
export function plazo(fechaObjetivo: string, hoy = new Date()): Plazo {
  const meses = mesesEntre(hoy, fecha(fechaObjetivo))
  return meses < 12 ? 'corto' : meses <= 60 ? 'mediano' : 'largo'
}

export interface EstadoMeta {
  plazo: Plazo
  falta: number
  fraccion: number
  /** Meses que quedan (mínimo 1 si la fecha aún no pasó; 0 si ya pasó). */
  mesesRestantes: number
  /** Cuánto apartar cada mes para llegar a tiempo (0 si ya se logró). */
  aporteMensual: number
  /** Cuánto apartar por semana. */
  aporteSemanal: number
  ritmo: 'lograda' | 'en_camino' | 'atrasada' | 'vencida'
}

export function estadoMeta(objetivo: number, ahorrado: number, fechaObjetivo: string, creadoEn: string, hoy = new Date()): EstadoMeta {
  const fin = fecha(fechaObjetivo)
  const inicio = fecha(creadoEn)
  const falta = Math.max(0, objetivo - ahorrado)
  const fraccion = objetivo > 0 ? Math.min(1, Math.max(0, ahorrado / objetivo)) : 0
  const restantesExactos = mesesEntre(hoy, fin)
  const vencida = restantesExactos < 0 && falta > 0
  const mesesRestantes = restantesExactos < 0 ? 0 : Math.max(1, Math.ceil(restantesExactos))
  const aporteMensual = falta === 0 ? 0 : Math.ceil(falta / Math.max(1, mesesRestantes))
  const semanas = Math.max(1, Math.ceil((fin.getTime() - hoy.getTime()) / (7 * 86_400_000)))
  // Avance esperado si se ahorrara parejo desde que se creó la meta.
  const total = Math.max(1, fin.getTime() - inicio.getTime())
  const esperado = Math.min(1, Math.max(0, (hoy.getTime() - inicio.getTime()) / total))
  const ritmo = falta === 0 ? 'lograda' : vencida ? 'vencida' : fraccion + 0.05 >= esperado ? 'en_camino' : 'atrasada'
  return {
    plazo: plazo(fechaObjetivo, hoy),
    falta,
    fraccion,
    mesesRestantes,
    aporteMensual,
    aporteSemanal: falta === 0 ? 0 : Math.ceil(falta / semanas),
    ritmo,
  }
}

export const TEXTO_RITMO: Record<EstadoMeta['ritmo'], { texto: string; clase: string }> = {
  lograda: { texto: '¡Lograda!', clase: 'bg-marca-claro text-marca-oscuro' },
  en_camino: { texto: 'En camino', clase: 'bg-marca-claro text-marca-oscuro' },
  atrasada: { texto: 'Atrasada', clase: 'bg-amber-50 text-amber-800' },
  vencida: { texto: 'Fecha vencida', clase: 'bg-red-50 text-peligro' },
}
