import { useState, type FormEvent } from 'react'
import { Aviso, Campo, btnPrincipal, inputCls } from '../components/ui'
import {
  NOMBRES_DEUDA, guardarDeuda, guardarPagoDeuda, type CuentaConSaldo, type Deuda, type DeudaConEstado, type TipoDeuda,
} from '../lib/datos'
import { interesMensual } from '../lib/deudas'
import { aCentavos, aTexto, formatear } from '../lib/dinero'
import { hoyISO } from '../lib/fechas'

/** Tasa anual (%) de un préstamo a partir del saldo, la cuota y los meses que faltan (búsqueda por bisección). */
function tasaDesdeCuota(saldo: number, cuota: number, meses: number): number | null {
  if (saldo <= 0 || cuota <= 0 || meses <= 0 || cuota * meses < saldo) return null
  const cuotaCon = (tasaAnual: number) => {
    const i = tasaAnual / 1200
    return i === 0 ? saldo / meses : (saldo * i) / (1 - Math.pow(1 + i, -meses))
  }
  let bajo = 0, alto = 500
  for (let k = 0; k < 100; k++) {
    const medio = (bajo + alto) / 2
    if (cuotaCon(medio) > cuota) alto = medio
    else bajo = medio
  }
  return Math.round(((bajo + alto) / 2) * 100) / 100
}

export function FormDeuda({ deuda, onListo }: { deuda: DeudaConEstado | null; onListo: () => void }) {
  const [nombre, setNombre] = useState(deuda?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoDeuda>(deuda?.tipo ?? 'tarjeta')
  const [acreedor, setAcreedor] = useState(deuda?.acreedor ?? '')
  const [saldo, setSaldo] = useState(deuda ? aTexto(deuda.saldo_inicial_centavos) : '')
  const [tasa, setTasa] = useState(deuda ? String(deuda.tasa_anual) : '')
  const [periodo, setPeriodo] = useState<'anual' | 'mensual'>('anual')
  const [cuota, setCuota] = useState(deuda ? aTexto(deuda.cuota_centavos) : '')
  const [dia, setDia] = useState(deuda?.dia_pago ? String(deuda.dia_pago) : '')
  const [enMeta, setEnMeta] = useState(deuda?.incluir_en_meta ?? true)
  const [plazo, setPlazo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const esPrestamo = tipo !== 'tarjeta'
  const tasaCalculada = plazo ? tasaDesdeCuota(aCentavos(saldo) ?? 0, aCentavos(cuota) ?? 0, Number(plazo)) : null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const s = aCentavos(saldo)
    const c = cuota.trim() ? aCentavos(cuota) : 0
    const t = Number((tasa || '0').replace(',', '.'))
    if (s === null) return setError('Escribe el saldo que debes.')
    if (c === null) return setError('Escribe una cuota válida.')
    if (!(t >= 0)) return setError('Escribe una tasa válida.')
    const tasaAnual = periodo === 'mensual' ? t * 12 : t
    setGuardando(true)
    try {
      await guardarDeuda({
        nombre: nombre.trim(), tipo, acreedor: acreedor.trim() || null, saldo_inicial_centavos: s,
        tasa_anual: Math.round(tasaAnual * 100) / 100, cuota_centavos: c, dia_pago: dia ? Number(dia) : null, incluir_en_meta: enMeta,
      } satisfies Omit<Deuda, 'id' | 'pagada' | 'creado_en'>, deuda?.id)
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre"><input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Ej.: Tarjeta Popular" /></Campo>
      <Campo etiqueta="Tipo">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeuda)} className={inputCls}>
          {Object.entries(NOMBRES_DEUDA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </Campo>
      <Campo etiqueta={deuda ? 'Saldo al registrarla (RD$)' : 'Cuánto debes hoy (RD$)'} ayuda={deuda ? 'Los pagos y cargos se suman aparte.' : undefined}>
        <input inputMode="decimal" required value={saldo} onChange={(e) => setSaldo(e.target.value)} className={inputCls} placeholder="0.00" />
      </Campo>
      <Campo etiqueta={tipo === 'tarjeta' ? 'Pago mínimo al mes (RD$)' : 'Cuota al mes (RD$)'}>
        <input inputMode="decimal" value={cuota} onChange={(e) => setCuota(e.target.value)} className={inputCls} placeholder="0.00" />
      </Campo>
      <Campo etiqueta="Tasa de interés (%)" ayuda="Está en tu estado de cuenta o contrato. Si es un familiar sin interés, pon 0.">
        <div className="flex gap-2">
          <input inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} className={inputCls} placeholder="Ej.: 60" />
          <select aria-label="Periodo de la tasa" value={periodo} onChange={(e) => setPeriodo(e.target.value as 'anual' | 'mensual')} className={`${inputCls} w-32`}>
            <option value="anual">anual</option>
            <option value="mensual">mensual</option>
          </select>
        </div>
      </Campo>
      <Campo etiqueta="Día de pago (1–31)">
        <input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} className={inputCls} placeholder="Ej.: 17" />
      </Campo>
      {esPrestamo && (
        <div className="sm:col-span-2 rounded-xl bg-gray-50 border border-borde p-3 space-y-2">
          <p className="text-sm font-semibold">¿No sabes la tasa? Te la calculo</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Meses que faltan por pagar
              <input inputMode="numeric" value={plazo} onChange={(e) => setPlazo(e.target.value.replace(/\D/g, ''))} className={`${inputCls} w-40`} />
            </label>
            {plazo && (
              tasaCalculada != null ? (
                <button type="button" className="h-11 px-3 rounded-lg bg-white border border-gray-300 text-sm font-semibold cursor-pointer"
                  onClick={() => { setTasa(String(tasaCalculada)); setPeriodo('anual') }}>
                  Usar {tasaCalculada}% anual
                </button>
              ) : <span className="text-sm text-suave">Revisa saldo, cuota y meses.</span>
            )}
          </div>
        </div>
      )}
      <Campo etiqueta="Acreedor (opcional)"><input value={acreedor} onChange={(e) => setAcreedor(e.target.value)} className={inputCls} placeholder="Ej.: Banco Popular" /></Campo>
      <label className="flex items-center gap-2 text-sm self-end h-11">
        <input type="checkbox" checked={enMeta} onChange={(e) => setEnMeta(e.target.checked)} className="w-4 h-4" />
        Sumar la cuota a mi meta diaria
      </label>
      {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={guardando} className={btnPrincipal}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

export function FormPago({ deuda, cuentas, sugerido, onListo }: {
  deuda: DeudaConEstado
  cuentas: CuentaConSaldo[]
  sugerido: number
  onListo: () => void
}) {
  const [tipo, setTipo] = useState<'pago' | 'cargo'>('pago')
  const [fecha, setFecha] = useState(hoyISO())
  const [monto, setMonto] = useState(sugerido ? aTexto(sugerido) : '')
  const interesEstimado = interesMensual(deuda.saldo_centavos, deuda.tasa_anual)
  const [interes, setInteres] = useState(interesEstimado ? aTexto(interesEstimado) : '0')
  const pesos = cuentas.filter((c) => c.moneda === 'DOP' && !c.archivada)
  const [cuenta, setCuenta] = useState(pesos.find((c) => c.tipo === 'efectivo')?.id ?? pesos[0]?.id ?? '')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const m = aCentavos(monto) ?? 0
  const i = Math.min(aCentavos(interes) ?? 0, m)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!m) return setError('Escribe el monto.')
    setGuardando(true)
    try {
      await guardarPagoDeuda({
        deuda_id: deuda.id, tipo, fecha, monto_centavos: m, interes_centavos: tipo === 'pago' ? i : 0,
        cuenta_id: tipo === 'pago' ? cuenta || null : null, nota: nota.trim() || null,
      })
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
      <div role="radiogroup" aria-label="Tipo" className="sm:col-span-2 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
        {(['pago', 'cargo'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)}
            className={`h-10 rounded-lg text-sm font-semibold cursor-pointer ${tipo === t ? 'bg-white shadow-sm' : 'text-suave'}`}>
            {t === 'pago' ? 'Hice un pago' : 'Nuevo cargo (compra, mora…)'}
          </button>
        ))}
      </div>
      <Campo etiqueta="Monto (RD$)"><input autoFocus inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} className={`${inputCls} text-lg font-semibold`} /></Campo>
      <Campo etiqueta="Fecha"><input type="date" required value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className={inputCls} /></Campo>
      {tipo === 'pago' && (
        <>
          <Campo etiqueta="De eso, intereses (RD$)" ayuda={`Estimado: ${formatear(interesEstimado)} este mes. Cópialo de tu estado de cuenta si lo tienes.`}>
            <input inputMode="decimal" value={interes} onChange={(e) => setInteres(e.target.value)} className={inputCls} />
          </Campo>
          <Campo etiqueta="Pagado desde">
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={inputCls}>
              <option value="">No crear gasto</option>
              {pesos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <p className="sm:col-span-2 text-sm text-suave">
            Baja tu deuda en <b className="text-marca">{formatear(Math.max(0, m - i))}</b> (el resto son intereses). Saldo después: {formatear(Math.max(0, deuda.saldo_centavos - (m - i)))}
          </p>
        </>
      )}
      <div className="sm:col-span-2"><Campo etiqueta="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} /></Campo></div>
      {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={guardando} className={btnPrincipal}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
