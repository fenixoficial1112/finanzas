import { useState } from 'react'
import { Aviso, Encabezado, Modal, btnPrincipal, btnSecundario, tarjeta } from '../components/ui'
import {
  NOMBRES_COMBUSTIBLE, NOMBRES_DOCUMENTO, borrarCarga, borrarDocumento, borrarMantenimiento, borrarRecordatorio,
  listarCuentas, obtenerDatosVehiculo, type CargaCombustible, type Documento, type Mantenimiento, type Recordatorio,
} from '../lib/datos'
import { formatear } from '../lib/dinero'
import { fechaLarga, mesActual } from '../lib/fechas'
import { useDatos } from '../lib/useDatos'
import { COLORES_ESTADO, estadoDocumento, estadoRecordatorio, rendimiento } from '../lib/vehiculo'
import { FormCarga, FormDocumento, FormMantenimiento, FormRecordatorio, FormVehiculo } from './FormsVehiculo'

type Edicion =
  | { que: 'vehiculo' }
  | { que: 'carga'; item: CargaCombustible | null }
  | { que: 'mantenimiento'; item: Mantenimiento | null }
  | { que: 'recordatorio'; item: Recordatorio | null }
  | { que: 'documento'; item: Documento | null }

const TITULOS = {
  vehiculo: 'Datos del vehículo',
  carga: 'Carga de combustible',
  mantenimiento: 'Mantenimiento',
  recordatorio: 'Recordatorio de mantenimiento',
  documento: 'Documento',
}

export default function VehiculoPagina() {
  const datos = useDatos(obtenerDatosVehiculo, [])
  const cuentas = useDatos(() => listarCuentas(), [])
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [historial, setHistorial] = useState<'combustible' | 'mantenimiento'>('combustible')
  const [error, setError] = useState<string | null>(null)

  const listo = () => {
    setEdicion(null)
    datos.recargar()
  }
  async function borrar(fn: () => Promise<void>, pregunta: string) {
    if (!confirm(pregunta)) return
    try {
      await fn()
      datos.recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (datos.cargando) return <p className="text-suave">Cargando…</p>
  if (datos.error) return <Aviso>{datos.error}</Aviso>

  const d = datos.datos
  if (!d) {
    return (
      <div className="max-w-2xl space-y-6">
        <Encabezado titulo="Vehículo" subtitulo="Registra tu carro para llevar combustible, mantenimientos y documentos." />
        <section className={`${tarjeta} p-6`}>
          <FormVehiculo vehiculo={null} onListo={datos.recargar} />
        </section>
      </div>
    )
  }

  const { vehiculo, kmActual } = d
  const rend = rendimiento(d.cargas)
  const mes = mesActual()
  const anio = mes.slice(0, 4)
  const combustibleMes = d.cargas.filter((c) => c.fecha.startsWith(mes)).reduce((s, c) => s + c.total_centavos, 0)
  const mantAnio = d.mantenimientos.filter((m) => m.fecha.startsWith(anio)).reduce((s, m) => s + m.costo_centavos, 0)
  const recs = d.recordatorios.map((r) => estadoRecordatorio(r, kmActual))
    .sort((a, b) => b.avance - a.avance)
  const tiposMant = [...new Set([...d.recordatorios.map((r) => r.tipo), ...d.mantenimientos.map((m) => m.tipo)])]
  const cs = cuentas.datos ?? []

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado
        titulo={`${vehiculo.marca} ${vehiculo.modelo}${vehiculo.anio ? ` ${vehiculo.anio}` : ''}`}
        subtitulo={[vehiculo.placa && `Placa ${vehiculo.placa}`, NOMBRES_COMBUSTIBLE[vehiculo.combustible], `${kmActual.toLocaleString('es-DO')} km`].filter(Boolean).join(' · ')}
      >
        <button className={btnSecundario} onClick={() => setEdicion({ que: 'vehiculo' })}>Editar vehículo</button>
        <button className={btnSecundario} onClick={() => setEdicion({ que: 'mantenimiento', item: null })}>+ Mantenimiento</button>
        <button className={btnPrincipal} onClick={() => setEdicion({ que: 'carga', item: null })}>+ Combustible</button>
      </Encabezado>

      {error && <Aviso>{error}</Aviso>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Dato t="Rendimiento" v={rend.kmPorGalon ? `${rend.kmPorGalon.toFixed(1)} km/gal` : '—'}
          nota={rend.kmPorGalon ? `Medido en ${rend.kmMedidos.toLocaleString('es-DO')} km` : 'Necesita 2 cargas con tanque lleno'} />
        <Dato t="Combustible por km" v={rend.costoPorKm ? formatear(Math.round(rend.costoPorKm)) : '—'} />
        <Dato t="Combustible este mes" v={formatear(combustibleMes)} />
        <Dato t={`Mantenimiento en ${anio}`} v={formatear(mantAnio)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${tarjeta} p-5 space-y-4`}>
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Próximos mantenimientos</h2>
            <button className="text-sm font-semibold text-marca cursor-pointer" onClick={() => setEdicion({ que: 'recordatorio', item: null })}>+ Recordatorio</button>
          </div>
          {recs.length === 0 && <p className="text-sm text-suave">Sin recordatorios.</p>}
          <ul className="space-y-4">
            {recs.map(({ recordatorio: r, estado, avance, texto }) => (
              <li key={r.id} className="space-y-1.5">
                <div className="flex justify-between items-baseline gap-2 text-sm">
                  <span className="font-semibold">{r.tipo}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COLORES_ESTADO[estado].etiqueta}`}>{texto}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200" role="progressbar" aria-label={r.tipo} aria-valuenow={Math.round(avance * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-2 rounded-full ${COLORES_ESTADO[estado].barra}`} style={{ width: `${Math.max(2, avance * 100)}%` }} />
                </div>
                <div className="flex gap-3 text-xs text-suave">
                  <span>{[r.cada_km && `cada ${r.cada_km.toLocaleString('es-DO')} km`, r.cada_meses && `cada ${r.cada_meses} meses`].filter(Boolean).join(' o ')}</span>
                  <button className="hover:text-tinta cursor-pointer" onClick={() => setEdicion({ que: 'recordatorio', item: r })}>Editar</button>
                  <button className="hover:text-peligro cursor-pointer" onClick={() => borrar(() => borrarRecordatorio(r.id), `¿Borrar el recordatorio "${r.tipo}"?`)}>Borrar</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-suave">Los intervalos iniciales son generales: ajústalos según el manual de tu vehículo o tu mecánico.</p>
        </section>

        <section className={`${tarjeta} p-5 space-y-4`}>
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Documentos</h2>
            <button className="text-sm font-semibold text-marca cursor-pointer" onClick={() => setEdicion({ que: 'documento', item: null })}>+ Documento</button>
          </div>
          {d.documentos.length === 0 ? (
            <p className="text-sm text-suave">Agrega el seguro, el marbete y tu licencia para que te avisemos antes de que venzan.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {d.documentos.map((doc) => {
                const e = estadoDocumento(doc)
                return (
                  <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <div className="flex-1 min-w-40">
                      <p className="font-semibold text-sm">{NOMBRES_DOCUMENTO[doc.tipo]}</p>
                      <p className="text-xs text-suave">{doc.nombre ? `${doc.nombre} · ` : ''}vence {fechaLarga(doc.vence).toLowerCase()}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COLORES_ESTADO[e.estado].etiqueta}`}>{e.texto}</span>
                    <button className="text-xs text-suave hover:text-tinta cursor-pointer" onClick={() => setEdicion({ que: 'documento', item: doc })}>Editar</button>
                    <button className="text-xs text-suave hover:text-peligro cursor-pointer" onClick={() => borrar(() => borrarDocumento(doc.id), '¿Borrar este documento?')}>Borrar</button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <section className={`${tarjeta} p-5 space-y-4`}>
        <div role="tablist" className="inline-flex rounded-lg bg-gray-100 p-1">
          {(['combustible', 'mantenimiento'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={historial === t} onClick={() => setHistorial(t)}
              className={`px-4 h-9 rounded-md text-sm font-semibold cursor-pointer ${historial === t ? 'bg-white shadow-sm' : 'text-suave'}`}>
              {t === 'combustible' ? 'Historial de combustible' : 'Historial de mantenimiento'}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          {historial === 'combustible' ? (
            d.cargas.length === 0 ? <p className="text-sm text-suave py-4">Aún no hay cargas de combustible.</p> : (
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-suave text-left"><tr><th className="py-2 font-medium">Fecha</th><th className="font-medium">Km</th><th className="font-medium">Galones</th><th className="font-medium">Precio/gal</th><th className="font-medium">Total</th><th className="font-medium">Lleno</th><th></th></tr></thead>
                <tbody>
                  {d.cargas.map((c) => (
                    <tr key={c.id} className="border-t border-borde">
                      <td className="py-2.5">{fechaLarga(c.fecha)}</td>
                      <td>{c.km?.toLocaleString('es-DO') ?? '—'}</td>
                      <td>{c.galones}</td>
                      <td>{formatear(Math.round(c.total_centavos / c.galones))}</td>
                      <td className="font-semibold">{formatear(c.total_centavos)}</td>
                      <td>{c.tanque_lleno ? 'Sí' : 'No'}</td>
                      <td className="text-right whitespace-nowrap">
                        <button className="text-suave hover:text-tinta cursor-pointer mr-3" onClick={() => setEdicion({ que: 'carga', item: c })}>Editar</button>
                        <button className="text-suave hover:text-peligro cursor-pointer" onClick={() => borrar(() => borrarCarga(c.id), '¿Borrar esta carga? También se borra su gasto.')}>Borrar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : d.mantenimientos.length === 0 ? <p className="text-sm text-suave py-4">Aún no hay mantenimientos.</p> : (
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-suave text-left"><tr><th className="py-2 font-medium">Fecha</th><th className="font-medium">Qué se hizo</th><th className="font-medium">Km</th><th className="font-medium">Taller</th><th className="font-medium">Costo</th><th></th></tr></thead>
              <tbody>
                {d.mantenimientos.map((m) => (
                  <tr key={m.id} className="border-t border-borde">
                    <td className="py-2.5">{fechaLarga(m.fecha)}</td>
                    <td className="font-semibold">{m.tipo}</td>
                    <td>{m.km?.toLocaleString('es-DO') ?? '—'}</td>
                    <td>{m.taller ?? '—'}</td>
                    <td>{formatear(m.costo_centavos)}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="text-suave hover:text-tinta cursor-pointer mr-3" onClick={() => setEdicion({ que: 'mantenimiento', item: m })}>Editar</button>
                      <button className="text-suave hover:text-peligro cursor-pointer" onClick={() => borrar(() => borrarMantenimiento(m.id), '¿Borrar este mantenimiento? También se borra su gasto.')}>Borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <Modal titulo={edicion ? TITULOS[edicion.que] : ''} abierto={edicion !== null} onCerrar={() => setEdicion(null)}>
        {edicion?.que === 'vehiculo' && <FormVehiculo vehiculo={vehiculo} onListo={listo} />}
        {edicion?.que === 'carga' && <FormCarga vehiculoId={vehiculo.id} carga={edicion.item} kmActual={kmActual} cuentas={cs} onListo={listo} />}
        {edicion?.que === 'mantenimiento' && (
          <FormMantenimiento vehiculoId={vehiculo.id} mantenimiento={edicion.item} kmActual={kmActual} cuentas={cs} tipos={tiposMant} onListo={listo} />
        )}
        {edicion?.que === 'recordatorio' && <FormRecordatorio vehiculoId={vehiculo.id} recordatorio={edicion.item} kmActual={kmActual} onListo={listo} />}
        {edicion?.que === 'documento' && <FormDocumento vehiculoId={vehiculo.id} documento={edicion.item} onListo={listo} />}
      </Modal>
    </div>
  )
}

function Dato({ t, v, nota }: { t: string; v: string; nota?: string }) {
  return (
    <div className={`${tarjeta} p-5`}>
      <p className="text-sm text-suave">{t}</p>
      <p className="text-2xl font-bold">{v}</p>
      {nota && <p className="text-xs text-suave mt-1">{nota}</p>}
    </div>
  )
}
