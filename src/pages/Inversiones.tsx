import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Encabezado, Modal, btnPrincipal, tarjeta } from '../components/ui'
import {
  NOMBRES_INVERSION, cerrarInversion, listarCuentas, listarDeudas, listarInversiones, obtenerTasaUSD, type InversionConValor,
} from '../lib/datos'
import { formatear, type Moneda } from '../lib/dinero'
import { fechaLarga } from '../lib/fechas'
import { GUIA_INVERSIONES, consejoBasico, diasParaVencer, interesMensualEstimado, rendimientoPct } from '../lib/inversiones'
import { useDatos } from '../lib/useDatos'
import { FormInversion, FormOperacion } from './FormsInversion'

type Edicion =
  | { que: 'nueva' }
  | { que: 'editar'; inv: InversionConValor }
  | { que: 'operar'; inv: InversionConValor; tipo: 'depositar' | 'retirar' | 'rendimiento' | 'valor' }
  | { que: 'historial'; inv: InversionConValor }

export default function Inversiones() {
  const datos = useDatos(async () => {
    const [inversiones, cuentas, tasa, deudas] = await Promise.all([listarInversiones(), listarCuentas(), obtenerTasaUSD(), listarDeudas()])
    return { inversiones, cuentas, tasa, deudas }
  }, [])
  const [ver, setVer] = useState<Moneda>('DOP')
  const [verCerradas, setVerCerradas] = useState(false)
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (datos.error) return <Aviso>{datos.error}</Aviso>
  if (datos.cargando || !datos.datos) return <p className="text-suave">Cargando…</p>
  const { inversiones, cuentas, tasa, deudas } = datos.datos
  const listo = () => { setEdicion(null); datos.recargar() }

  const activas = inversiones.filter((i) => i.estado === 'activa')
  // Convierte a la moneda elegida para el resumen.
  const conv = (c: number, de: Moneda) => {
    if (de === ver) return c
    if (!tasa) return null
    return de === 'USD' ? Math.round(c * tasa) : Math.round(c / tasa)
  }
  const sumar = (f: (i: InversionConValor) => number) =>
    activas.reduce<number | null>((s, i) => { const v = conv(f(i), i.moneda); return s == null || v == null ? null : s + v }, 0)
  const total = sumar((i) => i.valor_centavos)
  const ganancia = sumar((i) => i.ganancia_centavos)
  const mensual = sumar((i) => interesMensualEstimado(i) ?? 0)
  const consejo = consejoBasico(deudas, inversiones)
  const lista = inversiones.filter((i) => verCerradas || i.estado === 'activa')
  const faltaTasa = !tasa && activas.some((i) => i.moneda !== ver)

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado titulo="Inversiones" subtitulo="Tu dinero trabajando, en pesos y en dólares.">
        <div role="radiogroup" aria-label="Ver en" className="inline-flex rounded-full bg-gray-200 p-1">
          {(['DOP', 'USD'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={ver === m} onClick={() => setVer(m)}
              className={`px-4 h-9 rounded-full text-sm font-semibold cursor-pointer ${ver === m ? 'bg-white shadow-sm' : 'text-suave'}`}>
              {m === 'DOP' ? 'RD$' : 'US$'}
            </button>
          ))}
        </div>
        <button className={btnPrincipal} onClick={() => setEdicion({ que: 'nueva' })}>+ Agregar inversión</button>
      </Encabezado>
      {error && <Aviso>{error}</Aviso>}
      {faltaTasa && <Aviso>Para sumar pesos y dólares necesito la tasa del dólar. <Link to="/ajustes" className="underline font-semibold">Ponla en Ajustes</Link>.</Aviso>}

      {inversiones.length > 0 && (
        <section className="rounded-2xl bg-[#1e3a8a] text-white p-6 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-indigo-200">Total invertido (valor actual)</p>
            <p className="text-3xl font-bold">{total == null ? '—' : formatear(total, ver)}</p>
          </div>
          <div>
            <p className="text-sm text-indigo-200">Ganancia acumulada</p>
            <p className={`text-3xl font-bold ${ganancia != null && ganancia < 0 ? 'text-red-200' : 'text-green-300'}`}>
              {ganancia == null ? '—' : `${ganancia >= 0 ? '+' : '−'} ${formatear(Math.abs(ganancia), ver)}`}
            </p>
          </div>
          <div>
            <p className="text-sm text-indigo-200">Rendimiento estimado al mes</p>
            <p className="text-3xl font-bold">{mensual == null ? '—' : formatear(mensual, ver)}</p>
            <p className="text-xs text-indigo-200 mt-1">Solo inversiones con tasa fija{tasa ? ` · US$1 = ${formatear(tasa * 100)}` : ''}</p>
          </div>
        </section>
      )}

      {consejo && (
        <section className="rounded-2xl border border-[#f5d3ae] bg-[#fff4e8] p-5 space-y-2">
          <p className="font-semibold text-[#7c2d12]">Antes de invertir</p>
          <p className="text-sm text-[#7c2d12] leading-relaxed">{consejo}</p>
          <Link to="/asesor" className="text-sm font-semibold text-[#7c2d12] underline">Pregúntale a tu asesor IA qué te conviene →</Link>
        </section>
      )}

      {inversiones.length === 0 ? (
        <section className={`${tarjeta} p-8 text-center space-y-3`}>
          <p className="font-semibold text-lg">Registra tus inversiones</p>
          <p className="text-sm text-suave max-w-xl mx-auto">Certificados, ahorros en dólares, fondos, bonos o cooperativas. Verás cuánto vale todo, cuánto has ganado y cuándo vence cada una.</p>
          <button className={btnPrincipal} onClick={() => setEdicion({ que: 'nueva' })}>Agregar mi primera inversión</button>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Mis inversiones</h2>
            {inversiones.some((i) => i.estado === 'cerrada') && (
              <label className="flex items-center gap-2 text-sm text-suave">
                <input type="checkbox" checked={verCerradas} onChange={(e) => setVerCerradas(e.target.checked)} /> Ver cerradas
              </label>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {lista.map((i) => {
              const dias = diasParaVencer(i)
              const pct = rendimientoPct(i)
              const mes = interesMensualEstimado(i)
              return (
                <article key={i.id} className={`${tarjeta} p-5 space-y-3 ${i.estado === 'cerrada' ? 'opacity-60' : ''}`}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold break-words">{i.nombre}</h3>
                      <p className="text-xs text-suave">{NOMBRES_INVERSION[i.tipo]}{i.entidad ? ` · ${i.entidad}` : ''}{i.tasa_anual != null ? ` · ${i.tasa_anual}% anual` : ' · rendimiento variable'}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${i.moneda === 'USD' ? 'bg-marca-claro text-marca-oscuro' : 'bg-ia-claro text-ia'}`}>{i.moneda === 'USD' ? 'US$' : 'RD$'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><p className="text-xs text-suave">Valor</p><p className="font-bold">{formatear(i.valor_centavos, i.moneda)}</p></div>
                    <div><p className="text-xs text-suave">Puesto</p><p className="font-semibold">{formatear(i.aportado_centavos, i.moneda)}</p></div>
                    <div>
                      <p className="text-xs text-suave">Ganancia</p>
                      <p className={`font-semibold ${i.ganancia_centavos < 0 ? 'text-peligro' : 'text-marca'}`}>
                        {i.ganancia_centavos >= 0 ? '+' : '−'}{formatear(Math.abs(i.ganancia_centavos), i.moneda)}{pct != null ? ` (${pct.toFixed(1)}%)` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-suave">
                    {mes != null && mes > 0 && <span>≈ {formatear(mes, i.moneda)} al mes</span>}
                    {dias != null && (
                      <span className={dias <= 15 && dias >= 0 && i.estado === 'activa' ? 'font-semibold text-amber-800' : ''}>
                        {dias < 0 ? `Venció el ${fechaLarga(i.fecha_vencimiento!).toLowerCase()}` : dias === 0 ? 'Vence hoy' : `Vence ${fechaLarga(i.fecha_vencimiento!).toLowerCase()} (${dias} días)`}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pt-1">
                    {i.estado === 'activa' && (
                      <>
                        <button className="font-semibold text-marca cursor-pointer" onClick={() => setEdicion({ que: 'operar', inv: i, tipo: 'depositar' })}>Depositar / retirar</button>
                        <button className="font-semibold text-marca cursor-pointer" onClick={() => setEdicion({ que: 'operar', inv: i, tipo: i.tasa_anual != null ? 'rendimiento' : 'valor' })}>
                          {i.tasa_anual != null ? 'Rendimiento' : 'Actualizar valor'}
                        </button>
                      </>
                    )}
                    <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => setEdicion({ que: 'historial', inv: i })}>Historial</button>
                    <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => setEdicion({ que: 'editar', inv: i })}>Editar</button>
                    <button className="text-suave hover:text-tinta cursor-pointer"
                      onClick={async () => {
                        if (i.estado === 'activa' && i.valor_centavos > 0 && !confirm(`Todavía vale ${formatear(i.valor_centavos, i.moneda)}. Si ya cobraste el dinero, primero regístralo como retiro. ¿Cerrar de todas formas?`)) return
                        try { await cerrarInversion(i, i.estado === 'activa'); datos.recargar() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
                      }}>
                      {i.estado === 'activa' ? 'Cerrar' : 'Reabrir'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section className={`${tarjeta} p-5 space-y-3`}>
        <h2 className="font-semibold">Opciones para invertir en República Dominicana</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {GUIA_INVERSIONES.map((g) => (
            <div key={g.nombre} className="rounded-xl bg-gray-50 border border-borde p-4">
              <p className="font-semibold text-sm">{g.nombre}</p>
              <p className="text-sm text-suave mt-1 leading-relaxed">{g.texto}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-suave">Información general, no es asesoría financiera profesional. Antes de invertir, confirma tasas, plazos y condiciones con la entidad y verifica que esté regulada.</p>
      </section>

      <Modal
        titulo={!edicion ? '' : edicion.que === 'nueva' ? 'Nueva inversión' : edicion.que === 'editar' ? 'Editar inversión' : edicion.que === 'operar' ? edicion.inv.nombre : `Historial · ${edicion.inv.nombre}`}
        abierto={edicion !== null}
        onCerrar={() => setEdicion(null)}
      >
        {edicion?.que === 'nueva' && <FormInversion inversion={null} cuentas={cuentas} onListo={listo} />}
        {edicion?.que === 'editar' && <FormInversion inversion={edicion.inv} cuentas={cuentas} onListo={listo} />}
        {edicion?.que === 'operar' && <FormOperacion inversion={edicion.inv} cuentas={cuentas} inicial={edicion.tipo} onListo={listo} />}
        {edicion?.que === 'historial' && <Historial inv={edicion.inv} />}
      </Modal>
    </div>
  )
}

function Historial({ inv }: { inv: InversionConValor }) {
  if (!inv.movimientos.length) return <p className="text-suave">Todavía no hay movimientos.</p>
  const texto = (m: InversionConValor['movimientos'][number]) => {
    if (m.tipo === 'transferencia') return m.cuenta_destino_id === inv.cuenta_id ? 'Depósito' : 'Retiro'
    if (m.origen === 'inversion_rendimiento') return m.cuenta_id === inv.cuenta_id ? 'Rendimiento reinvertido' : 'Rendimiento cobrado'
    if (m.origen === 'inversion_ajuste') return m.tipo === 'ingreso' ? 'Subió de valor' : 'Bajó de valor'
    return m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'
  }
  const positivo = (m: InversionConValor['movimientos'][number]) =>
    (m.tipo === 'transferencia' && m.cuenta_destino_id === inv.cuenta_id) || m.tipo === 'ingreso'
  return (
    <ul className="divide-y divide-borde">
      {inv.movimientos.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
          <div className="flex-1 min-w-40">
            <p className="font-semibold">{texto(m)} · {fechaLarga(m.fecha)}</p>
            {m.nota && <p className="text-xs text-suave">{m.nota}</p>}
          </div>
          <span className={`font-bold ${positivo(m) ? 'text-marca' : 'text-peligro'}`}>{positivo(m) ? '+' : '−'} {formatear(m.monto_centavos, inv.moneda)}</span>
        </li>
      ))}
      <li className="pt-3 text-xs text-suave">Para corregir un movimiento, edítalo o bórralo desde Movimientos.</li>
    </ul>
  )
}
