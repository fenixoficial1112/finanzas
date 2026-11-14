import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Encabezado, btnPrincipal, btnSecundario, inputCls, tarjeta } from '../components/ui'
import {
  borrarPresupuesto, guardarLimites, guardarUmbralAlerta, listarCategorias, listarCuentas, listarMovimientos,
  listarPresupuestos, obtenerTasaUSD, obtenerUmbralAlerta,
} from '../lib/datos'
import { aCentavos, aTexto, formatear } from '../lib/dinero'
import { diasDelMes, mesActual, moverMes, nombreMes, rangoMes } from '../lib/fechas'
import { COLORES_PRESUPUESTO, avance, gastoPorCategoria, sugerirLimites } from '../lib/presupuesto'
import { useDatos } from '../lib/useDatos'

export default function Presupuesto() {
  const [mes, setMes] = useState(mesActual())
  const anterior = moverMes(mes, -1)
  const datos = useDatos(async () => {
    const [presupuestos, previos, categorias, cuentas, tasa, movs, umbral] = await Promise.all([
      listarPresupuestos(mes), listarPresupuestos(anterior), listarCategorias(), listarCuentas(true),
      obtenerTasaUSD(), listarMovimientos(rangoMes(mes)), obtenerUmbralAlerta(),
    ])
    return { presupuestos, previos, categorias, cuentas, tasa, movs, umbral }
  }, [mes])
  const [editando, setEditando] = useState<{ categoria_id: string; valor: string } | null>(null)
  const [nueva, setNueva] = useState({ categoria_id: '', monto: '' })
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function hacer(fn: () => Promise<void | string>) {
    setTrabajando(true)
    setError(null)
    setAviso(null)
    try {
      const msg = await fn()
      if (msg) setAviso(msg)
      datos.recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTrabajando(false)
    }
  }

  if (datos.error) return <Aviso>{datos.error}</Aviso>
  if (datos.cargando || !datos.datos) return <p className="text-suave">Cargando…</p>
  const { presupuestos, previos, categorias, cuentas, tasa, movs, umbral } = datos.datos

  const nombres = new Map(categorias.map((c) => [c.id, c.nombre]))
  const { porCategoria, sinCategoria } = gastoPorCategoria(movs, cuentas, tasa)
  const esMesActual = mes === mesActual()
  const diasMes = diasDelMes(mes)
  const hoy = new Date().getDate()
  const filas = presupuestos
    .map((p) => ({ p, a: avance(porCategoria.get(p.categoria_id) ?? 0, p.limite_centavos, umbral, esMesActual ? hoy : null, diasMes) }))
    .sort((x, y) => y.a.fraccion - x.a.fraccion)
  const conPresupuesto = new Set(presupuestos.map((p) => p.categoria_id))
  const sinPresupuesto = [...porCategoria.entries()].filter(([id]) => !conPresupuesto.has(id)).sort((a, b) => b[1] - a[1])
  const catsDisponibles = categorias.filter((c) => c.tipo === 'gasto' && !conPresupuesto.has(c.id))

  const totalLimite = presupuestos.reduce((s, p) => s + p.limite_centavos, 0)
  const totalGastado = filas.reduce((s, f) => s + f.a.gastado, 0)
  const disponible = totalLimite - totalGastado
  const diasRestantes = esMesActual ? diasMes - hoy + 1 : null
  const hayUSDsinTasa = !tasa && cuentas.some((c) => c.moneda === 'USD')

  async function sugerir() {
    const meses = [moverMes(mes, -1), moverMes(mes, -2), moverMes(mes, -3)]
    const listas = await Promise.all(meses.map((m) => listarMovimientos(rangoMes(m))))
    const sugeridos = sugerirLimites(listas.map((l) => gastoPorCategoria(l, cuentas, tasa).porCategoria))
    const nuevos = [...sugeridos.entries()]
      .filter(([id]) => !conPresupuesto.has(id) && categorias.some((c) => c.id === id && c.tipo === 'gasto'))
      .map(([categoria_id, limite_centavos]) => ({ categoria_id, limite_centavos }))
    if (!nuevos.length) return 'No encontré gastos en los últimos 3 meses para sugerir límites nuevos.'
    await guardarLimites(mes, nuevos)
    return `Agregué ${nuevos.length} categoría(s) con tu promedio de los últimos 3 meses. Ajústalas a lo que quieres gastar.`
  }

  async function agregar(e: FormEvent) {
    e.preventDefault()
    const c = aCentavos(nueva.monto)
    if (!nueva.categoria_id) return setError('Elige una categoría.')
    if (!c) return setError('Escribe el límite del mes.')
    await hacer(async () => {
      await guardarLimites(mes, [{ categoria_id: nueva.categoria_id, limite_centavos: c }])
      setNueva({ categoria_id: '', monto: '' })
    })
  }

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado titulo="Presupuesto" subtitulo="Cuánto quieres gastar como máximo en cada categoría.">
        <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white">
          <button aria-label="Mes anterior" className="h-11 w-11 cursor-pointer hover:bg-gray-50 rounded-l-lg" onClick={() => setMes(moverMes(mes, -1))}>‹</button>
          <span className="inline-block px-2 font-semibold min-w-40 text-center first-letter:uppercase">{nombreMes(mes)}</span>
          <button aria-label="Mes siguiente" className="h-11 w-11 cursor-pointer hover:bg-gray-50 rounded-r-lg" onClick={() => setMes(moverMes(mes, 1))}>›</button>
        </div>
      </Encabezado>

      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {hayUSDsinTasa && <Aviso>Los gastos en dólares no se cuentan porque falta la tasa. <Link to="/ajustes" className="underline font-semibold">Ponla en Ajustes</Link>.</Aviso>}

      {presupuestos.length === 0 ? (
        <section className={`${tarjeta} p-8 text-center space-y-4`}>
          <p className="font-semibold text-lg">Aún no tienes presupuesto para {nombreMes(mes)}</p>
          <p className="text-sm text-suave">Ponle un límite a lo que más gastas: combustible, comida, servicios… Te aviso al llegar al {umbral}% y si te pasas.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {previos.length > 0 && (
              <button className={btnPrincipal} disabled={trabajando}
                onClick={() => hacer(async () => {
                  await guardarLimites(mes, previos.map((p) => ({ categoria_id: p.categoria_id, limite_centavos: p.limite_centavos })))
                  return `Copié ${previos.length} límite(s) de ${nombreMes(anterior)}.`
                })}>
                Copiar de {nombreMes(anterior)}
              </button>
            )}
            <button className={previos.length ? btnSecundario : btnPrincipal} disabled={trabajando} onClick={() => hacer(sugerir)}>
              Sugerir con mis gastos de 3 meses
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Dato t="Presupuesto del mes" v={formatear(totalLimite)} />
            <Dato t="Gastado" v={formatear(totalGastado)} nota={totalLimite ? `${Math.round((totalGastado / totalLimite) * 100)}% del presupuesto` : undefined} />
            <Dato t={disponible >= 0 ? 'Te queda' : 'Te pasaste por'} v={formatear(Math.abs(disponible))} color={disponible >= 0 ? 'text-marca' : 'text-peligro'} />
            <Dato t="Puedes gastar por día" v={diasRestantes && disponible > 0 ? formatear(Math.floor(disponible / diasRestantes)) : '—'}
              nota={diasRestantes ? `${diasRestantes} días restantes` : 'Solo para el mes en curso'} />
          </div>

          <section className={`${tarjeta} p-5 space-y-4`}>
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h2 className="font-semibold">Por categoría</h2>
              <button className="text-sm font-semibold text-marca cursor-pointer" disabled={trabajando} onClick={() => hacer(sugerir)}>
                + Sugerir categorías que faltan
              </button>
            </div>
            <ul className="space-y-5">
              {filas.map(({ p, a }) => {
                const col = COLORES_PRESUPUESTO[a.estado]
                const enEdicion = editando?.categoria_id === p.categoria_id
                return (
                  <li key={p.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-semibold">{nombres.get(p.categoria_id) ?? 'Categoría'}</span>
                      {enEdicion ? (
                        <form className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault()
                            const c = aCentavos(editando.valor)
                            if (!c) return setError('Escribe un límite válido.')
                            hacer(async () => { await guardarLimites(mes, [{ categoria_id: p.categoria_id, limite_centavos: c }]); setEditando(null) })
                          }}>
                          <div className="w-36">
                            <input autoFocus aria-label="Nuevo límite" inputMode="decimal" value={editando.valor}
                              onChange={(e) => setEditando({ ...editando, valor: e.target.value })} className={`${inputCls} h-9`} />
                          </div>
                          <button className="text-sm font-semibold text-marca cursor-pointer">Guardar</button>
                          <button type="button" className="text-sm text-suave cursor-pointer" onClick={() => setEditando(null)}>Cancelar</button>
                        </form>
                      ) : (
                        <span className="text-sm">
                          <b>{formatear(a.gastado)}</b> <span className="text-suave">de {formatear(a.limite)}</span>
                        </span>
                      )}
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-200" role="progressbar" aria-label={nombres.get(p.categoria_id)} aria-valuenow={Math.round(a.fraccion * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <div className={`h-2.5 rounded-full ${col.barra}`} style={{ width: `${Math.min(100, Math.max(1, a.fraccion * 100))}%` }} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className={`font-semibold px-2 py-0.5 rounded-full ${col.etiqueta}`}>
                        {a.estado === 'excedido' ? `Te pasaste por ${formatear(-a.restante)}` : `Quedan ${formatear(a.restante)} (${Math.round(a.fraccion * 100)}%)`}
                      </span>
                      {a.proyeccion != null && a.estado !== 'excedido' && a.proyeccion > a.limite && (
                        <span className="text-amber-800">A este ritmo terminarás el mes en {formatear(a.proyeccion)}</span>
                      )}
                      <span className="flex-1" />
                      {!enEdicion && (
                        <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => setEditando({ categoria_id: p.categoria_id, valor: aTexto(p.limite_centavos) })}>Cambiar límite</button>
                      )}
                      <button className="text-suave hover:text-peligro cursor-pointer" onClick={() => hacer(() => borrarPresupuesto(p.id))}>Quitar</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${tarjeta} p-5 space-y-3`}>
          <h2 className="font-semibold">Agregar categoría al presupuesto</h2>
          <form onSubmit={agregar} className="flex flex-wrap gap-2 items-end">
            <label className="flex flex-col gap-1 text-sm font-semibold flex-1 min-w-40">
              Categoría
              <select value={nueva.categoria_id} onChange={(e) => setNueva({ ...nueva, categoria_id: e.target.value })} className={inputCls}>
                <option value="">Elegir…</option>
                {catsDisponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold w-40">
              Límite (RD$)
              <input inputMode="decimal" value={nueva.monto} onChange={(e) => setNueva({ ...nueva, monto: e.target.value })} className={inputCls} placeholder="0.00" />
            </label>
            <button className={btnPrincipal} disabled={trabajando}>Agregar</button>
          </form>
        </section>

        <section className={`${tarjeta} p-5 space-y-3`}>
          <h2 className="font-semibold">Gastos sin presupuesto este mes</h2>
          {sinPresupuesto.length === 0 && !sinCategoria ? (
            <p className="text-sm text-suave">Todo lo que gastaste tiene presupuesto.</p>
          ) : (
            <ul className="divide-y divide-borde text-sm">
              {sinPresupuesto.map(([id, monto]) => (
                <li key={id} className="flex items-center justify-between gap-3 py-2">
                  <span>{nombres.get(id) ?? 'Categoría'}</span>
                  <span className="flex items-center gap-3">
                    <b>{formatear(monto)}</b>
                    <button className="text-marca font-semibold cursor-pointer"
                      onClick={() => setNueva({ categoria_id: id, monto: aTexto(Math.ceil(monto / 50_000) * 50_000) })}>
                      Poner límite
                    </button>
                  </span>
                </li>
              ))}
              {sinCategoria > 0 && (
                <li className="flex items-center justify-between py-2 text-suave">
                  <span>Sin categoría</span><b>{formatear(sinCategoria)}</b>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      <Umbral actual={umbral} onGuardar={(n) => hacer(() => guardarUmbralAlerta(n))} />
    </div>
  )
}

function Umbral({ actual, onGuardar }: { actual: number; onGuardar: (n: number) => void }) {
  const [valor, setValor] = useState(String(actual))
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm text-suave"
      onSubmit={(e) => {
        e.preventDefault()
        const n = Number(valor)
        if (n >= 10 && n <= 100) onGuardar(n)
      }}
    >
      <label htmlFor="umbral">Avisarme cuando llegue al</label>
      <div className="w-20">
        <input id="umbral" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))} className={`${inputCls} h-9`} />
      </div>
      <span>% de una categoría.</span>
      {Number(valor) !== actual && <button className="font-semibold text-marca cursor-pointer">Guardar</button>}
    </form>
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
