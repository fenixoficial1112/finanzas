import { useState } from 'react'
import { Aviso, Encabezado, Modal, btnPrincipal, tarjeta } from '../components/ui'
import {
  borrarAporte, borrarMeta, cambiarEstadoMeta, listarAportes, listarCuentas, listarMetas, obtenerTasaUSD, type MetaConAhorro,
} from '../lib/datos'
import { enPesos, formatear } from '../lib/dinero'
import { fechaLarga } from '../lib/fechas'
import { DESCRIPCION_PLAZO, NOMBRES_PLAZO, TEXTO_RITMO, estadoMeta, type Plazo } from '../lib/metas'
import { useDatos } from '../lib/useDatos'
import { FormAporte, FormMeta } from './FormsMeta'

type Filtro = Plazo | 'todas' | 'logradas'
type Edicion =
  | { que: 'meta'; meta: MetaConAhorro | null }
  | { que: 'aporte'; meta: MetaConAhorro; sugerido: number }
  | { que: 'historial'; meta: MetaConAhorro }

export default function Metas() {
  const metas = useDatos(listarMetas, [])
  const cuentas = useDatos(() => listarCuentas(), [])
  const tasa = useDatos(obtenerTasaUSD, [])
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function hacer(fn: () => Promise<void>) {
    try {
      await fn()
      setError(null)
      metas.recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (metas.error) return <Aviso>{metas.error}</Aviso>
  if (metas.cargando) return <p className="text-suave">Cargando…</p>

  const todas = (metas.datos ?? []).map((m) => ({ m, e: estadoMeta(m.monto_objetivo_centavos, m.ahorrado_centavos, m.fecha_objetivo, m.creado_en) }))
  const abiertas = todas.filter(({ m }) => m.estado !== 'lograda')
  const visibles = filtro === 'logradas'
    ? todas.filter(({ m }) => m.estado === 'lograda')
    : abiertas.filter(({ e }) => filtro === 'todas' || e.plazo === filtro)
  const cuenta = (p: Plazo) => abiertas.filter(({ e }) => e.plazo === p).length

  const t = tasa.datos ?? null
  const aPesos = (c: number, m: MetaConAhorro) => (m.moneda === 'USD' ? (t ? enPesos(c, 'USD', t) : 0) : c)
  const ahorradoTotal = abiertas.reduce((s, { m }) => s + aPesos(m.ahorrado_centavos, m), 0)
  const mensualTotal = abiertas.filter(({ m }) => m.estado === 'activa').reduce((s, { m, e }) => s + aPesos(e.aporteMensual, m), 0)
  const hayUSD = abiertas.some(({ m }) => m.moneda === 'USD')

  const pestañas: { valor: Filtro; texto: string }[] = [
    { valor: 'todas', texto: `Todas (${abiertas.length})` },
    { valor: 'corto', texto: `Corto (${cuenta('corto')})` },
    { valor: 'mediano', texto: `Mediano (${cuenta('mediano')})` },
    { valor: 'largo', texto: `Largo (${cuenta('largo')})` },
    { valor: 'logradas', texto: 'Logradas' },
  ]

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado titulo="Metas" subtitulo="Lo que quieres lograr a corto, mediano y largo plazo.">
        <button className={btnPrincipal} onClick={() => setEdicion({ que: 'meta', meta: null })}>+ Nueva meta</button>
      </Encabezado>
      {error && <Aviso>{error}</Aviso>}

      {todas.length === 0 ? (
        <section className={`${tarjeta} p-8 text-center space-y-3`}>
          <p className="font-semibold text-lg">¿Qué quieres lograr?</p>
          <p className="text-suave text-sm max-w-xl mx-auto">
            Gomas nuevas o un fondo de emergencia (corto plazo), cambiar de carro (mediano), la inicial de una casa o tu retiro (largo plazo).
            Te digo cuánto apartar cada mes para llegar a tiempo.
          </p>
          <button className={btnPrincipal} onClick={() => setEdicion({ que: 'meta', meta: null })}>Crear mi primera meta</button>
        </section>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Dato t="Ahorrado en tus metas" v={formatear(ahorradoTotal)} nota={hayUSD ? (t ? 'Dólares convertidos a pesos' : 'Sin contar dólares (falta la tasa)') : undefined} />
            <Dato t="Debes apartar al mes" v={formatear(mensualTotal)} nota="Para llegar a tiempo a todas tus metas activas" />
            <Dato t="Metas activas" v={String(abiertas.filter(({ m }) => m.estado === 'activa').length)}
              nota={`${abiertas.filter(({ e }) => e.ritmo === 'atrasada').length} atrasada(s)`} />
          </div>

          <div role="tablist" className="inline-flex flex-wrap rounded-lg bg-gray-100 p-1">
            {pestañas.map((p) => (
              <button key={p.valor} role="tab" aria-selected={filtro === p.valor} onClick={() => setFiltro(p.valor)}
                className={`px-4 h-9 rounded-md text-sm font-semibold cursor-pointer ${filtro === p.valor ? 'bg-white shadow-sm' : 'text-suave'}`}>
                {p.texto}
              </button>
            ))}
          </div>

          {visibles.length === 0 ? (
            <p className="text-suave">No hay metas aquí.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibles.map(({ m, e }) => {
                const ritmo = m.estado === 'pausada' ? { texto: 'Pausada', clase: 'bg-gray-100 text-suave' } : TEXTO_RITMO[m.estado === 'lograda' ? 'lograda' : e.ritmo]
                return (
                  <article key={m.id} className={`${tarjeta} p-5 space-y-3 ${m.estado === 'pausada' ? 'opacity-70' : ''}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-suave uppercase tracking-wide">{NOMBRES_PLAZO[e.plazo]} · {DESCRIPCION_PLAZO[e.plazo]}</p>
                        <h2 className="font-semibold text-lg break-words">{m.nombre}</h2>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${ritmo.clase}`}>{ritmo.texto}</span>
                    </div>
                    <div>
                      <p className="text-sm"><b className="text-xl">{formatear(m.ahorrado_centavos, m.moneda)}</b> <span className="text-suave">de {formatear(m.monto_objetivo_centavos, m.moneda)}</span></p>
                      <div className="h-2.5 mt-2 rounded-full bg-gray-200" role="progressbar" aria-label={m.nombre} aria-valuenow={Math.round(e.fraccion * 100)} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-2.5 rounded-full bg-marca" style={{ width: `${Math.max(1, e.fraccion * 100)}%` }} />
                      </div>
                      <p className="text-xs text-suave mt-1">{Math.round(e.fraccion * 100)}% · para el {fechaLarga(m.fecha_objetivo).toLowerCase()}</p>
                    </div>
                    {e.falta > 0 && m.estado === 'activa' && (
                      <p className="text-sm rounded-lg bg-gray-50 px-3 py-2">
                        {e.ritmo === 'vencida'
                          ? <>La fecha ya pasó y faltan <b>{formatear(e.falta, m.moneda)}</b>. Ponle una fecha nueva.</>
                          : <>Aparta <b>{formatear(e.aporteMensual, m.moneda)} al mes</b> ({formatear(e.aporteSemanal, m.moneda)}/semana) durante {e.mesesRestantes} {e.mesesRestantes === 1 ? 'mes' : 'meses'}.</>}
                      </p>
                    )}
                    {e.falta === 0 && m.estado !== 'lograda' && (
                      <p className="text-sm rounded-lg bg-marca-claro px-3 py-2 text-marca-oscuro">
                        ¡Reuniste el dinero! <button className="font-semibold underline cursor-pointer" onClick={() => hacer(() => cambiarEstadoMeta(m.id, 'lograda'))}>Marcar como lograda</button>
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {m.estado !== 'lograda' && (
                        <button className="font-semibold text-marca cursor-pointer" onClick={() => setEdicion({ que: 'aporte', meta: m, sugerido: Math.min(e.aporteMensual, e.falta) })}>Aportar</button>
                      )}
                      <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => setEdicion({ que: 'historial', meta: m })}>Historial</button>
                      <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => setEdicion({ que: 'meta', meta: m })}>Editar</button>
                      {m.estado !== 'lograda' && (
                        <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => hacer(() => cambiarEstadoMeta(m.id, m.estado === 'pausada' ? 'activa' : 'pausada'))}>
                          {m.estado === 'pausada' ? 'Reanudar' : 'Pausar'}
                        </button>
                      )}
                      {m.estado === 'lograda' && (
                        <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => hacer(() => cambiarEstadoMeta(m.id, 'activa'))}>Reabrir</button>
                      )}
                      <button className="text-suave hover:text-peligro cursor-pointer"
                        onClick={() => confirm(`¿Borrar la meta "${m.nombre}" y su historial?`) && hacer(() => borrarMeta(m.id))}>Borrar</button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}

      <Modal
        titulo={!edicion ? '' : edicion.que === 'meta' ? (edicion.meta ? 'Editar meta' : 'Nueva meta') : edicion.que === 'aporte' ? edicion.meta.nombre : `Historial · ${edicion.meta.nombre}`}
        abierto={edicion !== null}
        onCerrar={() => setEdicion(null)}
      >
        {edicion?.que === 'meta' && <FormMeta meta={edicion.meta} cuentas={cuentas.datos ?? []} onListo={() => { setEdicion(null); metas.recargar() }} />}
        {edicion?.que === 'aporte' && (
          <FormAporte meta={edicion.meta} cuentas={cuentas.datos ?? []} sugerido={edicion.sugerido} onListo={() => { setEdicion(null); metas.recargar() }} />
        )}
        {edicion?.que === 'historial' && <Historial meta={edicion.meta} onCambio={metas.recargar} />}
      </Modal>
    </div>
  )
}

function Historial({ meta, onCambio }: { meta: MetaConAhorro; onCambio: () => void }) {
  const aportes = useDatos(() => listarAportes(meta.id), [meta.id])
  if (aportes.cargando) return <p className="text-suave">Cargando…</p>
  if (aportes.error) return <Aviso>{aportes.error}</Aviso>
  const lista = aportes.datos ?? []
  if (!lista.length) return <p className="text-suave">Todavía no hay aportes.</p>
  return (
    <ul className="divide-y divide-borde">
      {lista.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
          <div className="flex-1 min-w-40">
            <p className="font-semibold">{a.tipo === 'aporte' ? 'Aporte' : 'Retiro'} · {fechaLarga(a.fecha)}</p>
            {a.nota && <p className="text-xs text-suave">{a.nota}</p>}
          </div>
          <span className={`font-bold ${a.tipo === 'aporte' ? 'text-marca' : 'text-peligro'}`}>{a.tipo === 'aporte' ? '+' : '−'} {formatear(a.monto_centavos, meta.moneda)}</span>
          <button className="text-suave hover:text-peligro cursor-pointer"
            onClick={async () => {
              if (!confirm('¿Borrar este registro? Si movió dinero entre cuentas, esa transferencia también se borra.')) return
              await borrarAporte(a.id)
              aportes.recargar()
              onCambio()
            }}>Borrar</button>
        </li>
      ))}
    </ul>
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
