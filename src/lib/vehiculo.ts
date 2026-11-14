import type { CargaCombustible, Documento, Recordatorio } from './datos'
import { hoyISO } from './fechas'

export type Estado = 'ok' | 'pronto' | 'vencido'

/**
 * Rendimiento por el método de tanque lleno: entre dos cargas con tanque lleno,
 * km recorridos ÷ galones echados después del primer lleno (incluido el segundo).
 */
export function rendimiento(cargas: CargaCombustible[]) {
  const conKm = cargas.filter((c) => c.km != null).sort((a, b) => a.km! - b.km! || a.fecha.localeCompare(b.fecha))
  let km = 0
  let galones = 0
  let pesos = 0
  let anteriorLleno: CargaCombustible | null = null
  let galAcum = 0
  let pesosAcum = 0
  for (const c of conKm) {
    if (anteriorLleno) {
      galAcum += c.galones
      pesosAcum += c.total_centavos
    }
    if (c.tanque_lleno) {
      if (anteriorLleno && c.km! > anteriorLleno.km!) {
        km += c.km! - anteriorLleno.km!
        galones += galAcum
        pesos += pesosAcum
      }
      anteriorLleno = c
      galAcum = 0
      pesosAcum = 0
    }
  }
  return {
    kmPorGalon: galones ? km / galones : null,
    /** Centavos de combustible por km. */
    costoPorKm: km ? pesos / km : null,
    kmMedidos: km,
  }
}

function diasHasta(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  const [ha, hm, hd] = hoyISO().split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / 86_400_000)
}

function sumarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1 + meses, d))
  return f.toISOString().slice(0, 10)
}

export interface EstadoRecordatorio {
  recordatorio: Recordatorio
  estado: Estado
  /** 0–1: cuánto del intervalo ya se usó. */
  avance: number
  faltaKm: number | null
  diasFaltan: number | null
  texto: string
}

export function estadoRecordatorio(r: Recordatorio, kmActual: number): EstadoRecordatorio {
  let avance = 0
  let faltaKm: number | null = null
  let diasFaltan: number | null = null
  if (r.cada_km && r.ultimo_km != null) {
    const usado = Math.max(0, kmActual - r.ultimo_km)
    faltaKm = r.cada_km - usado
    avance = Math.max(avance, usado / r.cada_km)
  }
  if (r.cada_meses && r.ultima_fecha) {
    const proxima = sumarMeses(r.ultima_fecha, r.cada_meses)
    diasFaltan = diasHasta(proxima)
    const total = diasHasta(proxima) - diasHasta(r.ultima_fecha)
    avance = Math.max(avance, total > 0 ? 1 - diasFaltan / total : 1)
  }
  const vencido = (faltaKm != null && faltaKm <= 0) || (diasFaltan != null && diasFaltan <= 0)
  const pronto =
    (faltaKm != null && r.cada_km != null && faltaKm <= Math.max(500, r.cada_km * 0.1)) ||
    (diasFaltan != null && diasFaltan <= 30)

  const partes: string[] = []
  if (faltaKm != null) partes.push(faltaKm > 0 ? `faltan ${faltaKm.toLocaleString('es-DO')} km` : `pasado por ${(-faltaKm).toLocaleString('es-DO')} km`)
  if (diasFaltan != null) partes.push(diasFaltan > 0 ? `${diasFaltan} días` : 'fecha vencida')
  return {
    recordatorio: r,
    estado: vencido ? 'vencido' : pronto ? 'pronto' : 'ok',
    avance: Math.min(1, avance),
    faltaKm,
    diasFaltan,
    texto: partes.length ? partes.join(' · ') : 'Sin datos todavía',
  }
}

export function estadoDocumento(d: Documento): { estado: Estado; dias: number; texto: string } {
  const dias = diasHasta(d.vence)
  return {
    estado: dias < 0 ? 'vencido' : dias <= 30 ? 'pronto' : 'ok',
    dias,
    texto: dias < 0 ? `Vencido hace ${-dias} días` : dias === 0 ? 'Vence hoy' : dias <= 30 ? `Vence en ${dias} días` : 'Al día',
  }
}

export const COLORES_ESTADO: Record<Estado, { barra: string; etiqueta: string }> = {
  ok: { barra: 'bg-marca', etiqueta: 'bg-marca-claro text-marca-oscuro' },
  pronto: { barra: 'bg-amber-500', etiqueta: 'bg-amber-50 text-amber-800' },
  vencido: { barra: 'bg-red-600', etiqueta: 'bg-red-50 text-peligro' },
}
