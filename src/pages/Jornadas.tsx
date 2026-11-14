import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Aviso, Encabezado, Modal, btnPrincipal, inputCls, tarjeta } from '../components/ui'
import {
  borrarJornada, listarCategorias, listarCuentas, listarJornadas, listarPlataformas, obtenerJornada,
  totalesPorPlataforma, ultimaJornada, type Jornada,
} from '../lib/datos'
import { formatear } from '../lib/dinero'
import { fechaLarga, mesActual, nombreMes, rangoMes } from '../lib/fechas'
import { useDatos } from '../lib/useDatos'
import FormJornada from './FormJornada'

const horasTxt = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`

type Edicion = { jornada: Jornada | null; prellenado: Awaited<ReturnType<typeof ultimaJornada>> }

export default function Jornadas() {
  const [params, setParams] = useSearchParams()
  const mes = params.get('mes') ?? mesActual()
  const rango = rangoMes(mes)

  const jornadas = useDatos(() => listarJornadas(rango.desde, rango.hasta), [mes])
  const porPlataforma = useDatos(() => totalesPorPlataforma(rango.desde, rango.hasta), [mes])
  const plataformas = useDatos(listarPlataformas, [])
  const cuentas = useDatos(() => listarCuentas(true), [])
  const categorias = useDatos(listarCategorias, [])
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  const lista = jornadas.datos ?? []
  const tot = lista.reduce(
    (t, j) => ({
      neto: t.neto + j.neto_centavos, bruto: t.bruto + j.bruto_centavos, gastos: t.gastos + j.gastos_centavos,
      comision: t.comision + j.comision_centavos, minutos: t.minutos + j.minutos, km: t.km + (j.km ?? 0), viajes: t.viajes + j.viajes,
    }),
    { neto: 0, bruto: 0, gastos: 0, comision: 0, minutos: 0, km: 0, viajes: 0 },
  )

  async function abrir(id?: string) {
    setAbriendo(true)
    setErrorAccion(null)
    try {
      setEdicion(id ? { jornada: await obtenerJornada(id), prellenado: null } : { jornada: null, prellenado: await ultimaJornada() })
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : String(e))
    } finally {
      setAbriendo(false)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar esta jornada? También se borran sus ingresos, comisiones y gastos.')) return
    try {
      await borrarJornada(id)
      jornadas.recargar()
      porPlataforma.recargar()
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : String(e))
    }
  }

  const error = errorAccion ?? jornadas.error ?? plataformas.error ?? porPlataforma.error

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado titulo="Jornadas InDrive / Uber" subtitulo={`Tu trabajo como conductor en ${nombreMes(mes)}`}>
        <div className="w-44">
          <input type="month" aria-label="Mes" value={mes} onChange={(e) => setParams(e.target.value ? { mes: e.target.value } : {}, { replace: true })} className={inputCls} />
        </div>
        <button className={btnPrincipal} disabled={abriendo} onClick={() => abrir()}>+ Registrar jornada</button>
      </Encabezado>

      {error && <Aviso>{error}</Aviso>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Dato t="Ganancia neta del mes" v={formatear(tot.neto)} color="text-marca" nota={`${lista.length} jornadas · ${tot.viajes} viajes`} />
        <Dato t="Neto por hora" v={tot.minutos ? formatear(Math.round(tot.neto / (tot.minutos / 60))) : '—'} nota={horasTxt(tot.minutos)} />
        <Dato t="Neto por km" v={tot.km ? formatear(Math.round(tot.neto / tot.km)) : '—'} nota={`${tot.km.toLocaleString('es-DO')} km`} />
        <Dato t="Comisiones + gastos" v={formatear(tot.comision + tot.gastos)} color="text-peligro"
          nota={tot.bruto ? `${Math.round(((tot.comision + tot.gastos) / tot.bruto) * 100)}% de lo bruto` : undefined} />
      </div>

      {(plataformas.datos ?? []).length > 0 && (
        <section className={`${tarjeta} p-5 space-y-3`}>
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Comparación por app</h2>
            <Link to="/ajustes" className="text-sm text-marca font-semibold">Configurar comisiones</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="text-suave text-left">
                <tr><th className="py-2 font-medium">App</th><th className="font-medium">Días</th><th className="font-medium">Viajes</th><th className="font-medium">Bruto</th><th className="font-medium">Comisión</th><th className="font-medium">Promedio por viaje</th></tr>
              </thead>
              <tbody>
                {(plataformas.datos ?? []).map((p) => {
                  const t = porPlataforma.datos?.get(p.id)
                  return (
                    <tr key={p.id} className="border-t border-borde">
                      <td className="py-2.5 font-semibold">{p.nombre}</td>
                      <td>{t?.dias ?? 0}</td>
                      <td>{t?.viajes ?? 0}</td>
                      <td>{formatear(t?.bruto ?? 0)}</td>
                      <td>{formatear(t?.comision ?? 0)}</td>
                      <td>{t?.viajes ? formatear(Math.round((t.bruto - t.comision) / t.viajes)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={`${tarjeta} p-5 space-y-3`}>
        <h2 className="font-semibold">Jornadas del mes</h2>
        {jornadas.cargando ? (
          <p className="text-suave">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-suave py-6 text-center">Todavía no hay jornadas este mes. Al terminar de manejar, dale a "Registrar jornada".</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-suave text-left">
                <tr>
                  <th className="py-2 font-medium">Día</th><th className="font-medium">Horas</th><th className="font-medium">Km</th>
                  <th className="font-medium">Viajes</th><th className="font-medium">Bruto</th><th className="font-medium">Comisión + gastos</th>
                  <th className="font-medium">Neto</th><th className="font-medium">Por hora</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((j) => (
                  <tr key={j.id} className="border-t border-borde">
                    <td className="py-2.5">{fechaLarga(j.fecha)}</td>
                    <td>{horasTxt(j.minutos)}</td>
                    <td>{j.km ?? '—'}</td>
                    <td>{j.viajes}</td>
                    <td>{formatear(j.bruto_centavos)}</td>
                    <td className="text-peligro">{formatear(j.comision_centavos + j.gastos_centavos)}</td>
                    <td className="font-semibold text-marca">{formatear(j.neto_centavos)}</td>
                    <td>{j.minutos ? formatear(Math.round(j.neto_centavos / (j.minutos / 60))) : '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="text-suave hover:text-tinta cursor-pointer mr-3" onClick={() => abrir(j.id)}>Editar</button>
                      <button className="text-suave hover:text-peligro cursor-pointer" onClick={() => borrar(j.id)}>Borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal titulo={edicion?.jornada ? 'Editar jornada' : 'Registrar jornada'} abierto={edicion !== null} onCerrar={() => setEdicion(null)} ancho>
        {edicion && (
          <FormJornada
            jornada={edicion.jornada}
            prellenado={edicion.prellenado}
            plataformas={plataformas.datos ?? []}
            cuentas={cuentas.datos ?? []}
            categorias={categorias.datos ?? []}
            onListo={() => {
              setEdicion(null)
              jornadas.recargar()
              porPlataforma.recargar()
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function Dato({ t, v, color = '', nota }: { t: string; v: string; color?: string; nota?: string }) {
  return (
    <div className={`${tarjeta} p-5`}>
      <p className="text-sm text-suave">{t}</p>
      <p className={`text-2xl font-bold ${color}`}>{v}</p>
      {nota && <p className="text-xs text-suave mt-1">{nota}</p>}
    </div>
  )
}
