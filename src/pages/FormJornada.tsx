import { useState, type FormEvent } from 'react'
import { Aviso, Campo, btnPrincipal, inputCls } from '../components/ui'
import { guardarJornada, type Categoria, type CuentaConSaldo, type Jornada, type Plataforma } from '../lib/datos'
import { aCentavos, aTexto, formatear } from '../lib/dinero'
import { hoyISO } from '../lib/fechas'

interface FilaPlataforma {
  plataforma_id: string
  viajes: string
  efectivo: string
  app: string
  comision: string
  comisionManual: boolean
}
interface FilaGasto {
  clave: number
  categoria_id: string
  monto: string
  nota: string
}

const c = (t: string) => aCentavos(t) ?? 0

export default function FormJornada({ jornada, plataformas, cuentas, categorias, prellenado, onListo }: {
  jornada: Jornada | null
  plataformas: Plataforma[]
  cuentas: CuentaConSaldo[]
  categorias: Categoria[]
  prellenado: { km_final: number | null; cuenta_efectivo_id: string | null; cuenta_app_id: string | null } | null
  onListo: () => void
}) {
  const cuentasPesos = cuentas.filter((x) => x.moneda === 'DOP' && !x.archivada && x.tipo !== 'inversion' && x.tipo !== 'tarjeta')
  const efectivoPorDefecto =
    prellenado?.cuenta_efectivo_id ?? cuentasPesos.find((x) => x.tipo === 'efectivo')?.id ?? cuentasPesos[0]?.id ?? ''
  const appPorDefecto =
    prellenado?.cuenta_app_id ?? cuentasPesos.find((x) => x.tipo === 'banco')?.id ?? ''

  const [fecha, setFecha] = useState(jornada?.fecha ?? hoyISO())
  const [horas, setHoras] = useState(jornada ? String(Math.floor(jornada.minutos / 60)) : '')
  const [minutos, setMinutos] = useState(jornada ? String(jornada.minutos % 60) : '0')
  const [kmInicial, setKmInicial] = useState(
    jornada?.km_inicial != null ? String(jornada.km_inicial) : prellenado?.km_final != null ? String(prellenado.km_final) : '',
  )
  const [kmFinal, setKmFinal] = useState(jornada?.km_final != null ? String(jornada.km_final) : '')
  const [cuentaEfectivo, setCuentaEfectivo] = useState(jornada?.cuenta_efectivo_id ?? efectivoPorDefecto)
  const [cuentaApp, setCuentaApp] = useState(jornada?.cuenta_app_id ?? appPorDefecto)
  const [nota, setNota] = useState(jornada?.nota ?? '')

  const visibles = plataformas.filter((p) => p.activa || jornada?.plataformas.some((jp) => jp.plataforma_id === p.id))
  const [filas, setFilas] = useState<FilaPlataforma[]>(() =>
    visibles.map((p) => {
      const g = jornada?.plataformas.find((jp) => jp.plataforma_id === p.id)
      return {
        plataforma_id: p.id,
        viajes: g ? String(g.viajes) : '',
        efectivo: g?.efectivo_centavos ? aTexto(g.efectivo_centavos) : '',
        app: g?.app_centavos ? aTexto(g.app_centavos) : '',
        comision: g?.comision_centavos ? aTexto(g.comision_centavos) : '',
        comisionManual: Boolean(g),
      }
    }),
  )
  const [gastos, setGastos] = useState<FilaGasto[]>(() =>
    (jornada?.gastos ?? []).map((g, i) => ({
      clave: i, categoria_id: g.categoria_id ?? '', monto: aTexto(g.monto_centavos), nota: g.nota ?? '',
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const catsGasto = categorias.filter((x) => x.tipo === 'gasto' && x.nombre !== 'Comisiones apps')
  const catCombustible = catsGasto.find((x) => x.nombre === 'Combustible')?.id ?? ''

  function cambiarFila(i: number, campo: keyof FilaPlataforma, valor: string) {
    setFilas((fs) =>
      fs.map((f, j) => {
        if (j !== i) return f
        const nueva = { ...f, [campo]: valor }
        if (campo === 'comision') nueva.comisionManual = valor !== ''
        if (!nueva.comisionManual) {
          const pct = plataformas.find((p) => p.id === f.plataforma_id)?.comision_pct ?? 0
          const sugerida = Math.round(((c(nueva.efectivo) + c(nueva.app)) * pct) / 100)
          nueva.comision = sugerida ? aTexto(sugerida) : ''
        }
        return nueva
      }),
    )
  }

  // Totales en vivo
  const bruto = filas.reduce((s, f) => s + c(f.efectivo) + c(f.app), 0)
  const comision = filas.reduce((s, f) => s + c(f.comision), 0)
  const totalGastos = gastos.reduce((s, g) => s + c(g.monto), 0)
  const neto = bruto - comision - totalGastos
  const mins = (Number(horas) || 0) * 60 + (Number(minutos) || 0)
  const km = kmInicial && kmFinal ? Number(kmFinal) - Number(kmInicial) : null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!cuentaEfectivo) return setError('Elige la cuenta donde guardas el efectivo.')
    if (mins > 1440) return setError('Las horas no pueden pasar de 24.')
    if (km !== null && km < 0) return setError('El km final no puede ser menor que el inicial.')
    for (const f of filas) {
      for (const v of [f.efectivo, f.app, f.comision]) {
        if (v && aCentavos(v) === null) return setError(`Monto no válido: "${v}"`)
      }
    }
    if (filas.some((f) => c(f.app) > 0) && !cuentaApp) return setError('Elige la cuenta donde la app te deposita.')
    if (gastos.some((g) => !c(g.monto))) return setError('Cada gasto del día necesita un monto.')

    setGuardando(true)
    try {
      await guardarJornada({
        id: jornada?.id,
        fecha,
        minutos: mins,
        km_inicial: kmInicial ? Number(kmInicial) : null,
        km_final: kmFinal ? Number(kmFinal) : null,
        cuenta_efectivo_id: cuentaEfectivo,
        cuenta_app_id: cuentaApp || null,
        nota: nota.trim() || null,
        plataformas: filas
          .filter((f) => f.viajes || c(f.efectivo) || c(f.app) || c(f.comision))
          .map((f) => ({
            plataforma_id: f.plataforma_id,
            viajes: Number(f.viajes) || 0,
            efectivo_centavos: c(f.efectivo),
            app_centavos: c(f.app),
            comision_centavos: c(f.comision),
          })),
        gastos: gastos.map((g) => ({
          categoria_id: g.categoria_id || null, monto_centavos: c(g.monto), cuenta_id: cuentaEfectivo, nota: g.nota.trim() || null,
        })),
      })
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }

  if (cuentasPesos.length === 0) return <Aviso>Primero crea una cuenta en pesos (por ejemplo "Efectivo") en la sección Cuentas.</Aviso>

  return (
    <form onSubmit={guardar} className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <legend className="sr-only">Datos de la jornada</legend>
        <Campo etiqueta="Fecha">
          <input type="date" required value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </Campo>
        <Campo etiqueta="Horas trabajadas">
          <div className="flex gap-2">
            <input aria-label="Horas" inputMode="numeric" value={horas} onChange={(e) => setHoras(e.target.value.replace(/\D/g, ''))} className={inputCls} placeholder="h" />
            <input aria-label="Minutos" inputMode="numeric" value={minutos} onChange={(e) => setMinutos(e.target.value.replace(/\D/g, ''))} className={inputCls} placeholder="min" />
          </div>
        </Campo>
        <Campo etiqueta="Km inicial">
          <input inputMode="numeric" value={kmInicial} onChange={(e) => setKmInicial(e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </Campo>
        <Campo etiqueta="Km final">
          <input inputMode="numeric" value={kmFinal} onChange={(e) => setKmFinal(e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </Campo>
        <div className="flex flex-col justify-end pb-2 text-sm text-suave">
          {km !== null && km >= 0 ? `${km.toLocaleString('es-DO')} km recorridos` : ''}
        </div>
      </fieldset>

      <section className="space-y-3">
        <h3 className="font-semibold">Lo que ganaste por app</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {filas.map((f, i) => {
            const p = plataformas.find((x) => x.id === f.plataforma_id)!
            return (
              <fieldset key={f.plataforma_id} className="rounded-xl border border-borde p-4 grid grid-cols-2 gap-3">
                <legend className="px-1 font-semibold">{p.nombre}</legend>
                <Campo etiqueta="Viajes">
                  <input inputMode="numeric" value={f.viajes} onChange={(e) => cambiarFila(i, 'viajes', e.target.value.replace(/\D/g, ''))} className={inputCls} />
                </Campo>
                <Campo etiqueta="Cobrado en efectivo">
                  <input inputMode="decimal" value={f.efectivo} onChange={(e) => cambiarFila(i, 'efectivo', e.target.value)} className={inputCls} placeholder="0.00" />
                </Campo>
                <Campo etiqueta="Pagado por la app / tarjeta">
                  <input inputMode="decimal" value={f.app} onChange={(e) => cambiarFila(i, 'app', e.target.value)} className={inputCls} placeholder="0.00" />
                </Campo>
                <Campo etiqueta="Comisión" ayuda={p.comision_pct ? `Sugerida: ${p.comision_pct}% (puedes cambiarla)` : 'Configura el % en Ajustes'}>
                  <input inputMode="decimal" value={f.comision} onChange={(e) => cambiarFila(i, 'comision', e.target.value)} className={inputCls} placeholder="0.00" />
                </Campo>
              </fieldset>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Gastos del día</h3>
          <button
            type="button"
            className="text-sm font-semibold text-marca cursor-pointer"
            onClick={() => setGastos((g) => [...g, { clave: Date.now(), categoria_id: g.length ? '' : catCombustible, monto: '', nota: '' }])}
          >
            + Agregar gasto
          </button>
        </div>
        {gastos.length === 0 ? (
          <p className="text-sm text-suave">Combustible, lavado, peajes, comida… lo que gastaste trabajando hoy.</p>
        ) : (
          <div className="space-y-2">
            {gastos.map((g, i) => (
              <div key={g.clave} className="grid gap-2 sm:grid-cols-[1fr_160px_1fr_auto] items-center">
                <select aria-label="Categoría del gasto" value={g.categoria_id} className={inputCls}
                  onChange={(e) => setGastos((gs) => gs.map((x, j) => (j === i ? { ...x, categoria_id: e.target.value } : x)))}>
                  <option value="">Sin categoría</option>
                  {catsGasto.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}
                </select>
                <input aria-label="Monto del gasto" inputMode="decimal" value={g.monto} placeholder="0.00" className={inputCls}
                  onChange={(e) => setGastos((gs) => gs.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} />
                <input aria-label="Nota del gasto" value={g.nota} placeholder="Nota (opcional)" className={inputCls}
                  onChange={(e) => setGastos((gs) => gs.map((x, j) => (j === i ? { ...x, nota: e.target.value } : x)))} />
                <button type="button" aria-label="Quitar gasto" className="h-11 px-3 text-suave hover:text-peligro cursor-pointer"
                  onClick={() => setGastos((gs) => gs.filter((_, j) => j !== i))}>Quitar</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="sr-only">Cuentas</legend>
        <Campo etiqueta="El efectivo va a la cuenta" ayuda="Los gastos y comisiones también salen de aquí.">
          <select value={cuentaEfectivo} onChange={(e) => setCuentaEfectivo(e.target.value)} className={inputCls}>
            {cuentasPesos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Lo de la app va a la cuenta">
          <select value={cuentaApp} onChange={(e) => setCuentaApp(e.target.value)} className={inputCls}>
            <option value="">Elegir…</option>
            {cuentasPesos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Nota (opcional)">
          <input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} placeholder="Ej.: lluvia, mucho tapón" />
        </Campo>
      </fieldset>

      <div className="rounded-xl bg-marca text-white p-4 grid gap-3 grid-cols-2 md:grid-cols-5">
        <Total t="Bruto" v={formatear(bruto)} />
        <Total t="Comisiones" v={formatear(comision)} />
        <Total t="Gastos" v={formatear(totalGastos)} />
        <Total t="Neto del día" v={formatear(neto)} grande />
        <Total t="Por hora / por km" v={`${mins ? formatear(Math.round(neto / (mins / 60))) : '—'} · ${km ? formatear(Math.round(neto / km)) : '—'}`} />
      </div>

      {error && <Aviso>{error}</Aviso>}
      <div className="flex justify-end gap-2">
        <button type="submit" disabled={guardando} className={btnPrincipal}>{guardando ? 'Guardando…' : 'Guardar jornada'}</button>
      </div>
    </form>
  )
}

function Total({ t, v, grande = false }: { t: string; v: string; grande?: boolean }) {
  return (
    <div>
      <p className="text-xs opacity-85">{t}</p>
      <p className={`${grande ? 'text-xl' : 'text-base'} font-bold`}>{v}</p>
    </div>
  )
}

