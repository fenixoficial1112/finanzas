import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Campo, Encabezado, btnPrincipal, inputCls, tarjeta } from '../components/ui'
import {
  NOMBRES_OBLIGACION, borrarObligacion, guardarObligacion, guardarPreferenciasMeta, type Obligacion, type TipoObligacion,
} from '../lib/datos'
import { aCentavos, aTexto, formatear } from '../lib/dinero'
import { mesActual, nombreMes } from '../lib/fechas'
import { DIAS_HISTORIAL, useMeta } from '../lib/useMeta'

export default function MetaDiaria() {
  const datos = useMeta()
  const [editando, setEditando] = useState<Obligacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mes = mesActual()

  if (datos.error) return <Aviso>{datos.error}</Aviso>
  if (datos.cargando || !datos.datos) return <p className="text-suave">Cargando…</p>

  const { obligaciones: lista, cuotas, aportesMetas, prefs: p, totalMes, meta, netoMes, netoHoy, progreso: prog } = datos.datos

  const recargarTodo = datos.recargar

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado
        titulo="Mi meta diaria"
        subtitulo="Cuánto necesitas producir manejando para cubrir todas tus obligaciones del mes."
      />
      {error && <Aviso>{error}</Aviso>}

      {totalMes === 0 ? (
        <section className={`${tarjeta} p-6 text-center space-y-2`}>
          <p className="font-semibold text-lg">Empieza anotando tus obligaciones del mes</p>
          <p className="text-suave text-sm">Alquiler, luz, comida, cuota del carro, préstamos, lo que mandas a la familia, lo que quieres ahorrar…</p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl bg-tinta text-white p-6 space-y-5">
            <div className="space-y-1">
              <p className="text-gray-300 text-sm">
                Para cubrir {formatear(meta.conMargen)} al mes ({formatear(totalMes)} + {p.margen_pct}% de margen), trabajando {p.dias_trabajo_semana} días por semana, necesitas ganar:
              </p>
              <p className="text-4xl md:text-5xl font-bold">
                {formatear(meta.netoDiario)} <span className="text-xl font-semibold text-gray-300">neto por día</span>
              </p>
              {meta.horasDiarias && (
                <p className="text-gray-300 text-sm">
                  Con tu promedio real de {formatear(Math.round(meta.netoPorHora!))} por hora, son unas <b className="text-white">{meta.horasDiarias.toFixed(1)} horas</b> al día.
                </p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {meta.plataformas.map((pl) => (
                <div key={pl.plataforma.id} className="rounded-xl bg-white/10 p-4">
                  <p className="text-sm text-gray-300">Si trabajas solo con {pl.plataforma.nombre}, factura al día:</p>
                  <p className="text-2xl font-bold">{pl.brutoDiario ? formatear(pl.brutoDiario) : '—'}</p>
                  <p className="text-xs text-gray-300 mt-1">
                    {pl.viajesDiarios ? `≈ ${pl.viajesDiarios} viajes · ` : ''}
                    comisión {(pl.comisionPct * 100).toFixed(1)}%{meta.gastosPct != null ? ` · gastos ${(meta.gastosPct * 100).toFixed(0)}%` : ''}
                  </p>
                </div>
              ))}
            </div>
            {meta.jornadasEnHistorial < 5 && (
              <p className="text-xs text-amber-200">
                {meta.jornadasEnHistorial === 0
                  ? 'Aún no hay jornadas registradas: el cálculo de lo que hay que facturar solo usa la comisión configurada. Registra jornadas para que incluya tus gastos reales (combustible, lavado…).'
                  : `Calculado con solo ${meta.jornadasEnHistorial} jornada(s) de los últimos ${DIAS_HISTORIAL} días: se irá afinando a medida que registres más.`}
              </p>
            )}
          </section>

          <section className={`${tarjeta} p-5 space-y-3`}>
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-semibold">Cómo vas en {nombreMes(mes)}</h2>
              <span className="text-sm text-suave">Hoy llevas {formatear(netoHoy)} de {formatear(meta.netoDiario)}</span>
            </div>
            <div className="h-3 rounded-full bg-gray-200" role="progressbar" aria-label="Avance del mes" aria-valuenow={Math.round(prog.avance * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-3 rounded-full ${prog.avance >= 1 ? 'bg-marca' : 'bg-amber-500'}`} style={{ width: `${Math.max(1, prog.avance * 100)}%` }} />
            </div>
            <p className="text-sm">
              Llevas <b>{formatear(netoMes)}</b> de {formatear(meta.conMargen)} ({Math.round(prog.avance * 100)}%).{' '}
              {prog.falta > 0 ? (
                <>
                  Te faltan <b>{formatear(prog.falta)}</b>: unos <b className="text-marca">{formatear(prog.netoDiarioRestante)} neto por día</b> en los ~{prog.diasTrabajoRestantes} días de trabajo que quedan
                  {meta.plataformas[0]?.brutoDiario > 0 && meta.netoDiario > 0 && (
                    <> (en InDrive/Uber: {meta.plataformas.map((pl) => `${pl.plataforma.nombre} ${formatear(Math.round((pl.brutoDiario * prog.netoDiarioRestante) / meta.netoDiario))}`).join(' o ')} bruto al día)</>
                  )}.
                </>
              ) : (
                <b className="text-marca">¡Ya cubriste tus obligaciones del mes! Lo que ganes de aquí en adelante puede ir a deudas o ahorro.</b>
              )}
            </p>
          </section>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className={`${tarjeta} p-5 space-y-4`}>
          <div>
            <h2 className="font-semibold">Mis obligaciones del mes</h2>
            <p className="text-xs text-suave">
              No incluyas combustible, lavado ni comisiones: eso ya se descuenta en cada jornada.
            </p>
          </div>
          {lista.some((o) => o.tipo === 'deuda') && cuotas.length > 0 && (
            <Aviso>Las cuotas de la sección Deudas ya se suman solas. Si una obligación de tipo "Deuda / préstamo" es la misma, quítala de aquí para no contarla dos veces.</Aviso>
          )}
          {(lista.length > 0 || cuotas.length > 0 || aportesMetas.length > 0) && (
            <ul className="divide-y divide-borde border border-borde rounded-xl">
              {cuotas.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 bg-gray-50/60">
                  <div className="flex-1 min-w-40">
                    <p className="font-semibold text-sm">{d.nombre}</p>
                    <p className="text-xs text-suave">Cuota de deuda · automático desde <Link to="/deudas" className="text-marca font-semibold">Deudas</Link></p>
                  </div>
                  <span className="font-semibold">{formatear(d.cuota_centavos)}</span>
                </li>
              ))}
              {aportesMetas.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 bg-gray-50/60">
                  <div className="flex-1 min-w-40">
                    <p className="font-semibold text-sm">{m.nombre}</p>
                    <p className="text-xs text-suave">Aporte a meta · automático desde <Link to="/metas" className="text-marca font-semibold">Metas</Link></p>
                  </div>
                  <span className="font-semibold">{formatear(m.mensual)}</span>
                </li>
              ))}
              {lista.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                  <div className="flex-1 min-w-40">
                    <p className="font-semibold text-sm">{o.nombre}</p>
                    <p className="text-xs text-suave">{NOMBRES_OBLIGACION[o.tipo]}</p>
                  </div>
                  <span className="font-semibold">{formatear(o.monto_centavos)}</span>
                  <button className="text-sm text-suave hover:text-tinta cursor-pointer" onClick={() => setEditando(o)}>Editar</button>
                  <button
                    className="text-sm text-suave hover:text-peligro cursor-pointer"
                    onClick={async () => {
                      if (!confirm(`¿Quitar "${o.nombre}"?`)) return
                      try { await borrarObligacion(o.id); datos.recargar() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
                    }}
                  >
                    Quitar
                  </button>
                </li>
              ))}
              <li className="flex justify-between px-4 py-2.5 bg-gray-50 rounded-b-xl">
                <span className="font-semibold">Total al mes</span>
                <span className="font-bold">{formatear(totalMes)}</span>
              </li>
            </ul>
          )}
          <FormObligacion key={editando?.id ?? 'nueva'} obligacion={editando} onListo={() => { setEditando(null); datos.recargar() }} onCancelar={() => setEditando(null)} />
        </section>

        <section className={`${tarjeta} p-5 space-y-4 self-start`}>
          <h2 className="font-semibold">Cómo trabajas</h2>
          <FormPreferencias key={`${p.dias_trabajo_semana}-${p.margen_pct}`} inicial={p} onListo={recargarTodo} />
          <p className="text-xs text-suave">
            El margen es un colchón para imprevistos (un día malo, una goma ponchada).{' '}
            <Link to="/ajustes" className="text-marca font-semibold">Comisión de cada app</Link>
          </p>
        </section>
      </div>
    </div>
  )
}

function FormObligacion({ obligacion, onListo, onCancelar }: { obligacion: Obligacion | null; onListo: () => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(obligacion?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoObligacion>(obligacion?.tipo ?? 'casa')
  const [monto, setMonto] = useState(obligacion ? aTexto(obligacion.monto_centavos) : '')
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const c = aCentavos(monto)
    if (!c) return setError('Escribe el monto mensual.')
    try {
      await guardarObligacion({ nombre: nombre.trim(), tipo, monto_centavos: c }, obligacion?.id)
      setNombre(''); setMonto(''); setError(null)
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
        <Campo etiqueta="Qué es"><input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Ej.: Alquiler" /></Campo>
        <Campo etiqueta="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoObligacion)} className={inputCls}>
            {Object.entries(NOMBRES_OBLIGACION).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Monto al mes (RD$)"><input inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} className={inputCls} placeholder="0.00" /></Campo>
      </div>
      {error && <Aviso>{error}</Aviso>}
      <div className="flex gap-2">
        <button className={btnPrincipal}>{obligacion ? 'Guardar cambios' : '+ Agregar obligación'}</button>
        {obligacion && <button type="button" onClick={onCancelar} className="h-11 px-4 text-suave cursor-pointer">Cancelar</button>}
      </div>
    </form>
  )
}

function FormPreferencias({ inicial, onListo }: { inicial: { dias_trabajo_semana: number; margen_pct: number }; onListo: () => void }) {
  const [dias, setDias] = useState(String(inicial.dias_trabajo_semana))
  const [margen, setMargen] = useState(String(inicial.margen_pct))
  const [msg, setMsg] = useState<string | null>(null)
  const cambiado = Number(dias) !== inicial.dias_trabajo_semana || Number(margen) !== inicial.margen_pct

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const d = Number(dias), m = Number(margen)
        if (!(d >= 1 && d <= 7)) return setMsg('Los días deben ser de 1 a 7.')
        if (!(m >= 0 && m <= 100)) return setMsg('El margen debe ser de 0 a 100%.')
        try { await guardarPreferenciasMeta({ dias_trabajo_semana: d, margen_pct: m }); setMsg(null); onListo() } catch (err) { setMsg(err instanceof Error ? err.message : String(err)) }
      }}
    >
      <Campo etiqueta="Días que trabajas por semana">
        <select value={dias} onChange={(e) => setDias(e.target.value)} className={inputCls}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Margen de seguridad (%)">
        <input inputMode="numeric" value={margen} onChange={(e) => setMargen(e.target.value.replace(/\D/g, ''))} className={inputCls} />
      </Campo>
      {msg && <Aviso>{msg}</Aviso>}
      {cambiado && <button className={btnPrincipal}>Guardar</button>}
    </form>
  )
}
