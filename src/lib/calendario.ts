// Qué toca cada día del mes: pagos recurrentes, cuotas de deudas, vencimientos de documentos,
// metas e inversiones. Funciones puras: reciben los datos y devuelven los eventos por fecha.
import type { DatosVehiculo, DeudaConEstado, InversionConValor, MetaConAhorro, Movimiento, Recurrente } from './datos'
import { NOMBRES_DOCUMENTO } from './datos'
import { datosPrestamo, desglosePago } from './deudas'
import { fechasEntre, primeraFecha, type Programacion } from './recurrentes'

export type TipoEvento = 'ingreso' | 'gasto' | 'deuda' | 'vence' | 'meta'

export interface Evento {
  fecha: string
  tipo: TipoEvento
  titulo: string
  monto?: number
  moneda?: 'DOP' | 'USD'
  /** Ya se anotó (movimiento de un recurrente). */
  hecho?: boolean
  ruta: string
}

export interface Fuentes {
  recurrentes: Recurrente[]
  movimientos: Movimiento[]
  deudas: DeudaConEstado[]
  vehiculo: DatosVehiculo | null
  metas: MetaConAhorro[]
  inversiones: InversionConValor[]
}

export function eventosEntre(desde: string, hasta: string, f: Fuentes): Map<string, Evento[]> {
  const ev: Evento[] = []
  const nombreRec = new Map(f.recurrentes.map((r) => [r.id, r]))

  // Recurrentes ya anotados este mes…
  for (const m of f.movimientos) {
    if (!m.recurrente_id) continue
    const r = nombreRec.get(m.recurrente_id)
    ev.push({
      fecha: m.fecha, tipo: m.tipo === 'ingreso' ? 'ingreso' : 'gasto', titulo: r?.nombre ?? m.nota ?? 'Recurrente',
      monto: m.monto_centavos, hecho: true, ruta: '/movimientos',
    })
  }
  // …y los que vienen.
  for (const r of f.recurrentes) {
    if (!r.activa) continue
    for (const fecha of fechasEntre(r, r.proxima_fecha, desde, hasta, r.hasta)) {
      ev.push({ fecha, tipo: r.tipo === 'ingreso' ? 'ingreso' : 'gasto', titulo: r.nombre, monto: r.monto_centavos, ruta: '/recurrentes' })
    }
  }

  // Cuotas de deudas (las diarias no se ponen: llenarían todo el mes).
  for (const d of f.deudas) {
    if (d.pagada || d.saldo_centavos <= 0 || d.frecuencia === 'diaria') continue
    const p: Programacion = { frecuencia: d.frecuencia, dia_mes: d.dia_pago, dia_mes_2: d.dia_pago_2, dia_semana: d.dia_semana, mes: null }
    if ((d.frecuencia === 'mensual' && !d.dia_pago) || (d.frecuencia === 'quincenal' && (!d.dia_pago || !d.dia_pago_2)) || (d.frecuencia === 'semanal' && d.dia_semana == null)) continue
    const cuota = desglosePago(datosPrestamo(d)).cuota || d.cuota_centavos
    for (const fecha of fechasEntre(p, primeraFecha(p, desde), desde, hasta)) {
      ev.push({ fecha, tipo: 'deuda', titulo: d.tipo === 'tarjeta' ? `Pagar ${d.nombre}` : `Cuota ${d.nombre}`, monto: cuota || undefined, ruta: '/deudas' })
    }
    if (d.dia_corte) {
      for (const fecha of fechasEntre({ ...p, frecuencia: 'mensual', dia_mes: d.dia_corte }, primeraFecha({ ...p, frecuencia: 'mensual', dia_mes: d.dia_corte }, desde), desde, hasta)) {
        ev.push({ fecha, tipo: 'vence', titulo: `Corte de ${d.nombre}`, ruta: '/deudas' })
      }
    }
  }

  for (const doc of f.vehiculo?.documentos ?? []) {
    if (doc.vence >= desde && doc.vence <= hasta) {
      ev.push({ fecha: doc.vence, tipo: 'vence', titulo: `Vence ${doc.nombre || NOMBRES_DOCUMENTO[doc.tipo].toLowerCase()}`, ruta: '/vehiculo' })
    }
  }
  for (const m of f.metas) {
    if (m.estado === 'activa' && m.fecha_objetivo >= desde && m.fecha_objetivo <= hasta) {
      ev.push({ fecha: m.fecha_objetivo, tipo: 'meta', titulo: `Meta: ${m.nombre}`, monto: m.monto_objetivo_centavos, moneda: m.moneda, ruta: '/metas' })
    }
  }
  for (const i of f.inversiones) {
    if (i.estado === 'activa' && i.fecha_vencimiento && i.fecha_vencimiento >= desde && i.fecha_vencimiento <= hasta) {
      ev.push({ fecha: i.fecha_vencimiento, tipo: 'vence', titulo: `Vence ${i.nombre}`, monto: i.valor_centavos, moneda: i.moneda, ruta: '/inversiones' })
    }
  }

  const porDia = new Map<string, Evento[]>()
  for (const e of ev.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e])
  }
  return porDia
}
