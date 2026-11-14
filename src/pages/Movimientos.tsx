import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Aviso, Encabezado, Modal, btnPrincipal, inputCls, tarjeta } from '../components/ui'
import {
  borrarMovimiento, listarCategorias, listarCuentas, listarMovimientos, obtenerTasaUSD,
  type Movimiento, type TipoMovimiento,
} from '../lib/datos'
import { formatear } from '../lib/dinero'
import { fechaLarga, mesActual, nombreMes, rangoMes } from '../lib/fechas'
import { resumir } from '../lib/resumen'
import { useDatos } from '../lib/useDatos'
import FormMovimiento from './FormMovimiento'

export default function Movimientos() {
  const [params, setParams] = useSearchParams()
  const mes = params.get('mes') ?? mesActual()
  const cuentaId = params.get('cuenta') ?? ''
  const tipo = (params.get('tipo') ?? '') as TipoMovimiento | ''

  const cambiarFiltro = (clave: string, valor: string) => {
    const p = new URLSearchParams(params)
    if (valor) p.set(clave, valor)
    else p.delete(clave)
    setParams(p, { replace: true })
  }

  const cuentas = useDatos(() => listarCuentas(true), [])
  const categorias = useDatos(listarCategorias, [])
  const tasa = useDatos(obtenerTasaUSD, [])
  const movs = useDatos(
    () => listarMovimientos({ ...rangoMes(mes), cuentaId: cuentaId || undefined, tipo: tipo || undefined }),
    [mes, cuentaId, tipo],
  )
  const [editando, setEditando] = useState<Movimiento | 'nuevo' | null>(null)

  const listaCuentas = cuentas.datos ?? []
  const cuentasActivas = listaCuentas.filter((c) => !c.archivada)
  const mapaCuentas = useMemo(() => new Map((cuentas.datos ?? []).map((c) => [c.id, c])), [cuentas.datos])
  const mapaCats = useMemo(() => new Map((categorias.datos ?? []).map((c) => [c.id, c.nombre])), [categorias.datos])
  const lista = movs.datos ?? []
  const resumen = resumir(lista, listaCuentas, tasa.datos ?? null)

  const porDia = useMemo(() => {
    const grupos = new Map<string, Movimiento[]>()
    for (const m of movs.datos ?? []) grupos.set(m.fecha, [...(grupos.get(m.fecha) ?? []), m])
    return [...grupos.entries()]
  }, [movs.datos])

  async function borrar(m: Movimiento) {
    if (!confirm('¿Borrar este movimiento? No se puede deshacer.')) return
    try {
      await borrarMovimiento(m.id)
      movs.recargar()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const error = movs.error ?? cuentas.error ?? categorias.error

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado titulo="Movimientos" subtitulo={`Ingresos y gastos de ${nombreMes(mes)}`}>
        <button className={btnPrincipal} onClick={() => setEditando('nuevo')}>+ Nuevo movimiento</button>
      </Encabezado>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`${tarjeta} p-4`}><p className="text-sm text-suave">Ingresos</p><p className="text-2xl font-bold text-marca">{formatear(resumen.ingresos)}</p></div>
        <div className={`${tarjeta} p-4`}><p className="text-sm text-suave">Gastos</p><p className="text-2xl font-bold text-peligro">{formatear(resumen.gastos)}</p></div>
        <div className={`${tarjeta} p-4`}><p className="text-sm text-suave">Balance del mes</p><p className={`text-2xl font-bold ${resumen.neto < 0 ? 'text-peligro' : ''}`}>{formatear(resumen.neto)}</p></div>
      </div>
      {resumen.faltaTasa && (
        <Aviso>Hay movimientos en dólares que no se sumaron porque falta la tasa del dólar. <Link to="/ajustes" className="font-semibold underline">Ponla en Ajustes</Link>.</Aviso>
      )}

      <div className={`${tarjeta} p-4 flex flex-wrap gap-3`}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Mes</span>
          <input type="month" value={mes} onChange={(e) => cambiarFiltro('mes', e.target.value)} className={`${inputCls} w-44`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Cuenta</span>
          <select value={cuentaId} onChange={(e) => cambiarFiltro('cuenta', e.target.value)} className={`${inputCls} w-56`}>
            <option value="">Todas</option>
            {listaCuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Tipo</span>
          <select value={tipo} onChange={(e) => cambiarFiltro('tipo', e.target.value)} className={`${inputCls} w-44`}>
            <option value="">Todos</option>
            <option value="ingreso">Ingresos</option>
            <option value="gasto">Gastos</option>
            <option value="transferencia">Transferencias</option>
          </select>
        </label>
      </div>

      {error && <Aviso>{error}</Aviso>}

      {movs.cargando ? (
        <p className="text-suave">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className={`${tarjeta} p-8 text-center text-suave`}>No hay movimientos con estos filtros.</div>
      ) : (
        <div className="space-y-5">
          {porDia.map(([dia, items]) => (
            <section key={dia} className="space-y-2">
              <h2 className="text-sm font-semibold text-suave">{fechaLarga(dia)}</h2>
              <ul className={`${tarjeta} divide-y divide-borde`}>
                {items.map((m) => {
                  const cuenta = mapaCuentas.get(m.cuenta_id)
                  const destino = m.cuenta_destino_id ? mapaCuentas.get(m.cuenta_destino_id) : undefined
                  const titulo = m.tipo === 'transferencia'
                    ? `Transferencia a ${destino?.nombre ?? '—'}`
                    : (m.categoria_id && mapaCats.get(m.categoria_id)) || (m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto')
                  const signo = m.tipo === 'ingreso' ? '+' : m.tipo === 'gasto' ? '−' : ''
                  const color = m.tipo === 'ingreso' ? 'text-marca' : m.tipo === 'gasto' ? 'text-peligro' : 'text-tinta'
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                      <div className="flex-1 min-w-48">
                        <p className="font-semibold">{titulo}</p>
                        <p className="text-sm text-suave">
                          {cuenta?.nombre ?? '—'}
                          {m.nota && ` · ${m.nota}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${color}`}>{signo} {formatear(m.monto_centavos, cuenta?.moneda)}</p>
                        {m.monto_destino_centavos && destino && (
                          <p className="text-xs text-suave">→ {formatear(m.monto_destino_centavos, destino.moneda)}</p>
                        )}
                      </div>
                      {m.pago_deuda_id ? (
                        <Link to="/deudas" className="text-sm font-semibold text-marca" title="Se edita desde Deudas">
                          Ver en Deudas
                        </Link>
                      ) : m.carga_id || m.mantenimiento_id ? (
                        <Link to="/vehiculo" className="text-sm font-semibold text-marca" title="Se edita desde Vehículo">
                          Ver en Vehículo
                        </Link>
                      ) : m.jornada_id ? (
                        <Link to={`/jornadas?mes=${m.fecha.slice(0, 7)}`} className="text-sm font-semibold text-marca" title="Se edita desde Jornadas">
                          Ver jornada
                        </Link>
                      ) : (
                        <div className="flex gap-3 text-sm">
                          <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => setEditando(m)}>Editar</button>
                          <button className="text-suave hover:text-peligro cursor-pointer" onClick={() => borrar(m)}>Borrar</button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal
        titulo={editando === 'nuevo' ? 'Nuevo movimiento' : 'Editar movimiento'}
        abierto={editando !== null}
        onCerrar={() => setEditando(null)}
      >
        <FormMovimiento
          movimiento={editando === 'nuevo' ? null : editando}
          cuentas={editando && editando !== 'nuevo' ? listaCuentas : cuentasActivas}
          categorias={categorias.datos ?? []}
          onListo={(seguir) => {
            movs.recargar()
            if (!seguir) setEditando(null)
          }}
        />
      </Modal>
    </div>
  )
}
