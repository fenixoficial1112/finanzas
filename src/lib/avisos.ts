// Avisos de Windows: cuotas que tocan hoy o mañana, pagos recurrentes, pendientes por confirmar
// y documentos del vehículo por vencer. Cada cosa se avisa una sola vez.
import { NOMBRES_DOCUMENTO, listarDeudas, listarRecurrentes, obtenerDatosVehiculo } from './datos'
import { eventosEntre } from './calendario'
import { formatear } from './dinero'
import { hoyISO } from './fechas'
import { escritorio } from './escritorio'
import { sumarDias } from './recurrentes'

const CLAVE_ACTIVOS = 'fenix.avisos'
const CLAVE_AVISADOS = 'fenix.avisados'

export function avisosActivos(): boolean {
  try { return localStorage.getItem(CLAVE_ACTIVOS) !== 'no' } catch { return true }
}
export function ponerAvisosActivos(activo: boolean) {
  try { localStorage.setItem(CLAVE_ACTIVOS, activo ? 'si' : 'no') } catch { /* sin almacenamiento */ }
}

function leerAvisados(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CLAVE_AVISADOS) ?? '{}') } catch { return {} }
}
function guardarAvisados(a: Record<string, string>) {
  // Se olvidan los de hace más de 60 días para que no crezca sin fin.
  const limite = sumarDias(hoyISO(), -60)
  const limpio = Object.fromEntries(Object.entries(a).filter(([, f]) => f >= limite))
  try { localStorage.setItem(CLAVE_AVISADOS, JSON.stringify(limpio)) } catch { /* sin almacenamiento */ }
}

interface Pendiente { clave: string; texto: string }

/** Lo que hay que avisar ahora (sin filtrar lo ya avisado). */
export async function calcularAvisos(hoy = hoyISO()): Promise<Pendiente[]> {
  const manana = sumarDias(hoy, 1)
  const [recurrentes, deudas, vehiculo] = await Promise.all([listarRecurrentes(), listarDeudas(), obtenerDatosVehiculo()])
  const res: Pendiente[] = []

  const vencidos = recurrentes.filter((r) => r.activa && !r.automatico && r.proxima_fecha <= hoy)
  if (vencidos.length) {
    res.push({
      clave: `pend:${hoy}:${vencidos.map((r) => r.id).join(',')}`,
      texto: `Por confirmar: ${vencidos.map((r) => r.nombre).join(', ')}`,
    })
  }

  const eventos = eventosEntre(hoy, manana, { recurrentes, movimientos: [], deudas, vehiculo: null, metas: [], inversiones: [] })
  for (const [fecha, evs] of eventos) {
    for (const e of evs) {
      if (e.tipo === 'ingreso' || e.tipo === 'meta') continue
      // Los recurrentes de hoy que no son automáticos ya salen arriba como "por confirmar".
      if (e.ruta === '/recurrentes' && fecha === hoy) continue
      const cuando = fecha === hoy ? 'Hoy' : 'Mañana'
      res.push({ clave: `ev:${fecha}:${e.titulo}`, texto: `${cuando}: ${e.titulo}${e.monto ? ` (${formatear(e.monto, e.moneda)})` : ''}` })
    }
  }

  for (const d of vehiculo?.documentos ?? []) {
    const nombre = d.nombre || NOMBRES_DOCUMENTO[d.tipo]
    if (d.vence < hoy) res.push({ clave: `doc:${d.id}:${d.vence}:vencido`, texto: `${nombre} está vencido` })
    else if (d.vence <= sumarDias(hoy, 7)) res.push({ clave: `doc:${d.id}:${d.vence}:pronto`, texto: `${nombre} vence ${d.vence === hoy ? 'hoy' : `el ${Number(d.vence.slice(8))}`}` })
  }
  return res
}

/** Revisa y manda un aviso de Windows con lo nuevo. */
export async function revisarAvisos(): Promise<void> {
  if (!escritorio || !avisosActivos()) return
  const avisados = leerAvisados()
  const nuevos = (await calcularAvisos()).filter((p) => !avisados[p.clave])
  if (!nuevos.length) return
  const hoy = hoyISO()
  const mandado = await escritorio.app.avisar({
    titulo: nuevos.length === 1 ? 'FENIX APP' : `FENIX APP · ${nuevos.length} avisos`,
    cuerpo: nuevos.slice(0, 4).map((p) => p.texto).join('\n') + (nuevos.length > 4 ? `\ny ${nuevos.length - 4} más…` : ''),
    ruta: '/calendario',
  })
  if (!mandado) return
  for (const p of nuevos) avisados[p.clave] = hoy
  guardarAvisados(avisados)
}
