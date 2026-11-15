import { useMemo, useState } from 'react'
import { Aviso, Encabezado, Modal, btnPrincipal, btnSecundario, inputCls, tarjeta } from '../components/ui'
import {
  NOMBRES_DEUDA, borrarDeuda, borrarPagoDeuda, guardarPlanDeudas, listarCuentas, listarDeudas, listarPagosDeuda,
  marcarDeudaPagada, obtenerPlanDeudas, type DeudaConEstado,
} from '../lib/datos'
import {
  PAGOS_POR_MES, cuotaMensual, interesMensual, mesFuturo, proximoPagoDeuda, simular, textoFrecuencia, type DeudaSim, type ResultadoSim,
} from '../lib/deudas'
import { aCentavos, aTexto, formatear } from '../lib/dinero'
import { fechaLarga } from '../lib/fechas'
import { useDatos } from '../lib/useDatos'
import { FormDeuda, FormPago } from './FormsDeuda'

type Edicion =
  | { que: 'deuda'; deuda: DeudaConEstado | null }
  | { que: 'pago'; deuda: DeudaConEstado; sugerido: number }
  | { que: 'historial'; deuda: DeudaConEstado }

const textoMeses = (r: ResultadoSim) =>
  r.meses == null ? 'Nunca (la cuota no cubre los intereses)' : `${r.meses} ${r.meses === 1 ? 'mes' : 'meses'} · ${mesFuturo(r.meses)}`

export default function Deudas() {
  const deudas = useDatos(listarDeudas, [])
  const plan = useDatos(obtenerPlanDeudas, [])
  const cuentas = useDatos(() => listarCuentas(), [])
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [extraTxt, setExtraTxt] = useState<string | null>(null)
  const [verPagadas, setVerPagadas] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todas = deudas.datos ?? []
  const activas = todas.filter((d) => !d.pagada && d.saldo_centavos > 0)
  const estrategia = plan.datos?.estrategia_deudas ?? 'avalancha'
  const extraGuardado = plan.datos?.pago_extra_deudas_centavos ?? 0
  const extra = extraTxt !== null ? aCentavos(extraTxt) ?? 0 : extraGuardado

  const sims = useMemo(() => {
    const ds: DeudaSim[] = (deudas.datos ?? []).filter((d) => !d.pagada && d.saldo_centavos > 0).map((d) => ({ id: d.id, nombre: d.nombre, saldo: d.saldo_centavos, tasaAnual: d.tasa_anual, cuota: cuotaMensual(d.cuota_centavos, d.frecuencia) }))
    return {
      minimos: simular(ds, 'minimos', 0),
      avalancha: simular(ds, 'avalancha', extra),
      bola_nieve: simular(ds, 'bola_nieve', extra),
    }
  }, [deudas.datos, extra])
  const elegido = sims[estrategia]

  async function hacer(fn: () => Promise<void>) {
    try {
      await fn()
      setError(null)
      deudas.recargar()
      plan.recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (deudas.cargando || plan.cargando) return <p className="text-suave">Cargando…</p>
  const errorCarga = deudas.error ?? plan.error
  if (errorCarga) return <Aviso>{errorCarga}</Aviso>

  const total = activas.reduce((s, d) => s + d.saldo_centavos, 0)
  const interesesMes = activas.reduce((s, d) => s + interesMensual(d.saldo_centavos, d.tasa_anual), 0)
  const cuotasMes = activas.reduce((s, d) => s + cuotaMensual(d.cuota_centavos, d.frecuencia), 0)
  const atrapadas = activas.filter((d) => cuotaMensual(d.cuota_centavos, d.frecuencia) <= interesMensual(d.saldo_centavos, d.tasa_anual) && d.tasa_anual > 0)
  const ahorroVsMinimos = sims.minimos.meses != null && elegido.meses != null
    ? { intereses: sims.minimos.totalIntereses - elegido.totalIntereses, meses: sims.minimos.meses - elegido.meses }
    : null
  const orden = new Map(elegido.orden.map((id, i) => [id, i]))
  const lista = [...todas]
    .filter((d) => verPagadas || (!d.pagada && d.saldo_centavos > 0))
    .sort((a, b) => (orden.get(a.id) ?? 99) - (orden.get(b.id) ?? 99))
  const hayPagadas = todas.some((d) => d.pagada || d.saldo_centavos <= 0)

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado titulo="Deudas" subtitulo="Tu plan para quedar libre de deudas.">
        <button className={btnPrincipal} onClick={() => setEdicion({ que: 'deuda', deuda: null })}>+ Nueva deuda</button>
      </Encabezado>
      {error && <Aviso>{error}</Aviso>}

      {todas.length === 0 ? (
        <section className={`${tarjeta} p-8 text-center space-y-3`}>
          <p className="font-semibold text-lg">Anota tus deudas y armamos tu plan</p>
          <p className="text-suave text-sm">Tarjetas, préstamos, el carro, prestamistas, lo que le debes a un familiar…</p>
          <button className={btnPrincipal} onClick={() => setEdicion({ que: 'deuda', deuda: null })}>Agregar mi primera deuda</button>
        </section>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Dato t="Debes en total" v={formatear(total)} color="text-peligro" nota={`${activas.length} deuda(s) activa(s)`} />
            <Dato t="Intereses este mes" v={formatear(interesesMes)} nota="Lo que te cobran solo por deber" />
            <Dato t="Cuotas al mes" v={formatear(cuotasMes)} nota={extra ? `+ ${formatear(extra)} extra` : undefined} />
            <Dato t="Libre de deudas" v={elegido.meses == null ? 'Nunca' : activas.length === 0 ? '¡Ya!' : mesFuturo(elegido.meses)} color="text-marca"
              nota={elegido.meses ? `${elegido.meses} meses con tu plan` : undefined} />
          </div>

          {atrapadas.length > 0 && (
            <Aviso>
              {atrapadas.map((d) => d.nombre).join(', ')}: la cuota no alcanza ni para los intereses ({atrapadas.map((d) => formatear(interesMensual(d.saldo_centavos, d.tasa_anual))).join(', ')} al mes). Pagando solo eso, la deuda nunca baja.
            </Aviso>
          )}

          {activas.length > 0 && (
            <section className={`${tarjeta} p-5 space-y-5`}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Tu plan de pago</h2>
                  <p className="text-sm text-suave">Elige la estrategia y cuánto extra puedes poner cada mes.</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div role="radiogroup" aria-label="Estrategia" className="inline-flex rounded-lg bg-gray-100 p-1">
                    {(['avalancha', 'bola_nieve'] as const).map((e) => (
                      <button key={e} role="radio" aria-checked={estrategia === e}
                        onClick={() => hacer(() => guardarPlanDeudas({ estrategia_deudas: e, pago_extra_deudas_centavos: extra }))}
                        className={`px-4 h-10 rounded-md text-sm font-semibold cursor-pointer ${estrategia === e ? 'bg-white shadow-sm' : 'text-suave'}`}>
                        {e === 'avalancha' ? 'Avalancha' : 'Bola de nieve'}
                      </button>
                    ))}
                  </div>
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    Pago extra al mes (RD$)
                    <input inputMode="decimal" value={extraTxt ?? (extraGuardado ? aTexto(extraGuardado) : '')} placeholder="0"
                      onChange={(e) => setExtraTxt(e.target.value)} className={`${inputCls} w-40`} />
                  </label>
                  {extraTxt !== null && extra !== extraGuardado && (
                    <button className={btnSecundario} onClick={() => hacer(async () => { await guardarPlanDeudas({ estrategia_deudas: estrategia, pago_extra_deudas_centavos: extra }); setExtraTxt(null) })}>
                      Guardar extra
                    </button>
                  )}
                </div>
              </div>

              <p className="text-sm text-suave">
                {estrategia === 'avalancha'
                  ? 'Avalancha: todo lo extra va a la deuda con el interés más alto. Es la que menos dinero te cuesta.'
                  : 'Bola de nieve: todo lo extra va a la deuda más pequeña. Ves resultados rápido y eso motiva.'}{' '}
                Cuando terminas una deuda, su cuota pasa a la siguiente.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-suave text-left">
                    <tr><th className="py-2 font-medium">Escenario</th><th className="font-medium">Libre de deudas en</th><th className="font-medium">Intereses que pagarás</th></tr>
                  </thead>
                  <tbody>
                    {([['minimos', 'Solo cuotas mínimas, sin extra'], ['avalancha', 'Avalancha'], ['bola_nieve', 'Bola de nieve']] as const).map(([k, n]) => (
                      <tr key={k} className={`border-t border-borde ${k === estrategia ? 'bg-marca-claro/50 font-semibold' : ''}`}>
                        <td className="py-2.5 px-1">{n}{k === estrategia && ' (tu plan)'}</td>
                        <td>{textoMeses(sims[k])}</td>
                        <td>{sims[k].meses == null ? '—' : formatear(sims[k].totalIntereses)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ahorroVsMinimos && (ahorroVsMinimos.intereses > 0 || ahorroVsMinimos.meses > 0) && (
                <p className="rounded-lg bg-marca-claro px-4 py-3 text-sm text-marca-oscuro">
                  Con tu plan te ahorras <b>{formatear(ahorroVsMinimos.intereses)}</b> en intereses y terminas <b>{ahorroVsMinimos.meses} meses antes</b> que pagando solo las cuotas.
                </p>
              )}

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Este mes paga así:</h3>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {elegido.orden.map((id, i) => {
                    const d = activas.find((x) => x.id === id)!
                    const monto = elegido.planEsteMes[id] ?? 0
                    return (
                      <li key={id} className={`rounded-xl border p-3 ${i === 0 ? 'border-marca bg-marca-claro/40' : 'border-borde'}`}>
                        <p className="text-xs font-semibold text-suave">{i === 0 ? 'ATACAR PRIMERO' : `Prioridad ${i + 1}`}</p>
                        <p className="font-semibold">{d.nombre}</p>
                        <p className="text-lg font-bold">{formatear(monto)}</p>
                        {d.frecuencia !== 'mensual' && monto > 0 && (
                          <p className="text-xs text-suave">≈ {formatear(Math.round(monto / PAGOS_POR_MES[d.frecuencia]))} {d.frecuencia === 'quincenal' ? 'por quincena' : d.frecuencia === 'semanal' ? 'por semana' : 'por día'}</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Mis deudas</h2>
              {hayPagadas && (
                <label className="flex items-center gap-2 text-sm text-suave">
                  <input type="checkbox" checked={verPagadas} onChange={(e) => setVerPagadas(e.target.checked)} /> Ver pagadas
                </label>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {lista.map((d) => {
                const totalDeuda = d.saldo_inicial_centavos + d.cargos_centavos
                const avance = totalDeuda > 0 ? Math.min(1, Math.max(0, 1 - d.saldo_centavos / totalDeuda)) : 1
                const proximo = proximoPagoDeuda(d)
                const uso = d.limite_credito_centavos ? d.saldo_centavos / d.limite_credito_centavos : null
                const colorUso = uso == null ? '' : uso > 0.7 ? 'bg-red-600' : uso > 0.3 ? 'bg-amber-500' : 'bg-marca'
                const terminada = d.pagada || d.saldo_centavos <= 0
                const mesFin = elegido.mesLiquidada[d.id]
                return (
                  <article key={d.id} className={`${tarjeta} p-5 space-y-3 ${terminada ? 'opacity-70' : ''}`}>
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{d.nombre}</h3>
                        <p className="text-xs text-suave">
                          {NOMBRES_DEUDA[d.tipo]}{d.acreedor ? ` · ${d.acreedor}` : ''} · {d.tasa_anual}% anual
                          {d.tasa_anual >= 60 && <span className="text-peligro font-semibold"> ({Math.round((d.tasa_anual / 12) * 10) / 10}% al mes)</span>}
                        </p>
                      </div>
                      <p className="text-xl font-bold whitespace-nowrap">{formatear(Math.max(0, d.saldo_centavos))}</p>
                    </div>
                    {d.tipo === 'tarjeta' && uso != null ? (
                      <div className="space-y-1.5">
                        <div className="h-2 rounded-full bg-gray-200" role="progressbar" aria-label={`Uso del límite de ${d.nombre}`} aria-valuenow={Math.round(uso * 100)} aria-valuemin={0} aria-valuemax={100}>
                          <div className={`h-2 rounded-full ${colorUso}`} style={{ width: `${Math.min(100, Math.max(1, uso * 100))}%` }} />
                        </div>
                        <p className="text-xs text-suave">
                          Usas el <b className={uso > 0.7 ? 'text-peligro' : 'text-tinta'}>{Math.round(uso * 100)}%</b> de {formatear(d.limite_credito_centavos!)} · disponible {formatear(Math.max(0, d.limite_credito_centavos! - d.saldo_centavos))}
                          {d.dia_corte ? ` · corte el día ${d.dia_corte}` : ''}
                        </p>
                        {uso > 0.3 && <p className="text-xs text-amber-800">Trata de usar menos del 30% del límite: cuida tu historial de crédito y pagas menos intereses.</p>}
                      </div>
                    ) : d.cuenta_tarjeta_id ? null : (
                      <div className="h-2 rounded-full bg-gray-200" role="progressbar" aria-label={`Pagado de ${d.nombre}`} aria-valuenow={Math.round(avance * 100)} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-2 rounded-full bg-marca" style={{ width: `${Math.max(1, avance * 100)}%` }} />
                      </div>
                    )}
                    {d.tipo === 'tarjeta' && !terminada && (
                      <p className="text-xs rounded-lg bg-gray-50 px-3 py-2">
                        Para <b>no pagar intereses</b>, paga el balance total del corte antes de la fecha límite. Pagar solo el mínimo ({formatear(d.cuota_centavos)}) es lo más caro.
                      </p>
                    )}
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-suave">
                      <span>
                        {d.cuenta_tarjeta_id ? `Intereses y cargos ${formatear(d.intereses_pagados_centavos)}` : `${Math.round(avance * 100)}% pagado · intereses pagados ${formatear(d.intereses_pagados_centavos)}`}
                      </span>
                      {terminada ? <span className="font-semibold text-marca">¡Pagada!</span> : (
                        <span>
                          {d.cuota_centavos ? `${d.tipo === 'tarjeta' ? 'Mínimo' : 'Cuota'} ${formatear(d.cuota_centavos)} ${textoFrecuencia(d)}` : 'Sin cuota fija'}
                          {proximo && d.frecuencia !== 'diaria' && ` · próximo pago ${fechaLarga(`${proximo.getFullYear()}-${String(proximo.getMonth() + 1).padStart(2, '0')}-${String(proximo.getDate()).padStart(2, '0')}`).toLowerCase()}`}
                        </span>
                      )}
                    </div>
                    {!terminada && mesFin != null && (
                      <p className="text-xs">Con tu plan la terminas en <b>{mesFuturo(mesFin)}</b>.</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pt-1">
                      {!terminada && (
                        <button className="font-semibold text-marca cursor-pointer"
                          onClick={() => setEdicion({ que: 'pago', deuda: d, sugerido: d.frecuencia === 'mensual' ? elegido.planEsteMes[d.id] ?? d.cuota_centavos : Math.max(d.cuota_centavos, Math.round((elegido.planEsteMes[d.id] ?? 0) / PAGOS_POR_MES[d.frecuencia])) })}>
                          Registrar pago
                        </button>
                      )}
                      <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => setEdicion({ que: 'historial', deuda: d })}>Historial</button>
                      <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => setEdicion({ que: 'deuda', deuda: d })}>Editar</button>
                      <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => hacer(() => marcarDeudaPagada(d.id, !d.pagada))}>
                        {d.pagada ? 'Reactivar' : 'Marcar pagada'}
                      </button>
                      <button className="text-suave hover:text-peligro cursor-pointer"
                        onClick={() => confirm(`¿Borrar "${d.nombre}" con todos sus pagos?`) && hacer(() => borrarDeuda(d.id))}>
                        Borrar
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
          <p className="text-xs text-suave">
            Las fechas e intereses son estimados con la tasa que pusiste; tu banco puede calcular distinto. Úsalo como guía, no como asesoría financiera profesional.
          </p>
        </>
      )}

      <Modal
        titulo={!edicion ? '' : edicion.que === 'deuda' ? (edicion.deuda ? 'Editar deuda' : 'Nueva deuda') : edicion.que === 'pago' ? `Pago · ${edicion.deuda.nombre}` : `Historial · ${edicion.deuda.nombre}`}
        abierto={edicion !== null}
        onCerrar={() => setEdicion(null)}
      >
        {edicion?.que === 'deuda' && <FormDeuda deuda={edicion.deuda} cuentas={cuentas.datos ?? []} onListo={() => { setEdicion(null); deudas.recargar(); cuentas.recargar() }} />}
        {edicion?.que === 'pago' && (
          <FormPago deuda={edicion.deuda} cuentas={cuentas.datos ?? []} sugerido={edicion.sugerido} onListo={() => { setEdicion(null); deudas.recargar() }} />
        )}
        {edicion?.que === 'historial' && <Historial deudaId={edicion.deuda.id} onCambio={deudas.recargar} />}
      </Modal>
    </div>
  )
}

function Historial({ deudaId, onCambio }: { deudaId: string; onCambio: () => void }) {
  const pagos = useDatos(() => listarPagosDeuda(deudaId), [deudaId])
  if (pagos.cargando) return <p className="text-suave">Cargando…</p>
  if (pagos.error) return <Aviso>{pagos.error}</Aviso>
  const lista = pagos.datos ?? []
  if (lista.length === 0) return <p className="text-suave">Todavía no hay pagos ni cargos.</p>
  return (
    <ul className="divide-y divide-borde">
      {lista.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
          <div className="flex-1 min-w-40">
            <p className="font-semibold">{p.tipo === 'pago' ? 'Pago' : 'Cargo'} · {fechaLarga(p.fecha)}</p>
            <p className="text-xs text-suave">
              {p.tipo === 'pago' ? `Capital ${formatear(p.monto_centavos - p.interes_centavos)} · intereses ${formatear(p.interes_centavos)}` : 'Subió la deuda'}
              {p.nota ? ` · ${p.nota}` : ''}
            </p>
          </div>
          <span className={`font-bold ${p.tipo === 'pago' ? 'text-marca' : 'text-peligro'}`}>{p.tipo === 'pago' ? '−' : '+'} {formatear(p.monto_centavos)}</span>
          <button className="text-suave hover:text-peligro cursor-pointer"
            onClick={async () => {
              if (!confirm('¿Borrar este registro? Si era un pago, también se borra su gasto.')) return
              await borrarPagoDeuda(p.id)
              pagos.recargar()
              onCambio()
            }}>
            Borrar
          </button>
        </li>
      ))}
    </ul>
  )
}

function Dato({ t, v, color = '', nota }: { t: string; v: string; color?: string; nota?: string }) {
  return (
    <div className={`${tarjeta} p-5`}>
      <p className="text-sm text-suave">{t}</p>
      <p className={`text-2xl font-bold first-letter:uppercase ${color}`}>{v}</p>
      {nota && <p className="text-xs text-suave mt-1">{nota}</p>}
    </div>
  )
}
