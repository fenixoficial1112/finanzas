import { useState, type FormEvent } from 'react'
import { Aviso, Campo, btnPrincipal, inputCls } from '../components/ui'
import { guardarAporte, guardarMeta, type CuentaConSaldo, type MetaConAhorro } from '../lib/datos'
import { aCentavos, aTexto, formatear, type Moneda } from '../lib/dinero'
import { hoyISO } from '../lib/fechas'
import { DESCRIPCION_PLAZO, NOMBRES_PLAZO, estadoMeta, plazo } from '../lib/metas'

const simbolo = (m: Moneda) => (m === 'USD' ? 'US$' : 'RD$')

export function FormMeta({ meta, cuentas, onListo }: { meta: MetaConAhorro | null; cuentas: CuentaConSaldo[]; onListo: () => void }) {
  const [nombre, setNombre] = useState(meta?.nombre ?? '')
  const [moneda, setMoneda] = useState<Moneda>(meta?.moneda ?? 'DOP')
  const [monto, setMonto] = useState(meta ? aTexto(meta.monto_objetivo_centavos) : '')
  const [fecha, setFecha] = useState(meta?.fecha_objetivo ?? '')
  const [cuenta, setCuenta] = useState(meta?.cuenta_id ?? '')
  const [enMeta, setEnMeta] = useState(meta?.incluir_en_meta ?? true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cuentasMoneda = cuentas.filter((c) => c.moneda === moneda && !c.archivada)
  const objetivo = aCentavos(monto)
  const vista = objetivo && fecha ? estadoMeta(objetivo, meta?.ahorrado_centavos ?? 0, fecha, meta?.creado_en ?? hoyISO()) : null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!objetivo) return setError('Escribe cuánto quieres reunir.')
    if (!fecha || fecha <= hoyISO()) return setError('Elige una fecha objetivo en el futuro.')
    setGuardando(true)
    try {
      await guardarMeta({
        nombre: nombre.trim(), moneda, monto_objetivo_centavos: objetivo, fecha_objetivo: fecha,
        cuenta_id: cuenta || null, incluir_en_meta: enMeta,
      }, meta?.id)
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Campo etiqueta="¿Para qué estás ahorrando?">
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Ej.: Gomas nuevas, fondo de emergencia, inicial de una casa" />
        </Campo>
      </div>
      <Campo etiqueta="Moneda" ayuda={meta ? 'La moneda no se puede cambiar.' : undefined}>
        <select value={moneda} disabled={!!meta} onChange={(e) => { setMoneda(e.target.value as Moneda); setCuenta('') }} className={inputCls}>
          <option value="DOP">Pesos (RD$)</option>
          <option value="USD">Dólares (US$)</option>
        </select>
      </Campo>
      <Campo etiqueta={`Cuánto necesitas (${simbolo(moneda)})`}>
        <input inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} className={inputCls} placeholder="0.00" />
      </Campo>
      <Campo etiqueta="Para cuándo" ayuda={fecha ? `${NOMBRES_PLAZO[plazo(fecha)]} (${DESCRIPCION_PLAZO[plazo(fecha)]})` : 'Corto: menos de 1 año · Mediano: 1 a 5 años · Largo: más de 5 años'}>
        <input type="date" required value={fecha} min={hoyISO()} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
      </Campo>
      <Campo etiqueta="Cuenta donde guardas este ahorro (opcional)" ayuda="Si eliges una, cada aporte mueve el dinero a esa cuenta.">
        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={inputCls}>
          <option value="">Ninguna</option>
          {cuentasMoneda.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </Campo>
      {vista && vista.aporteMensual > 0 && (
        <p className="sm:col-span-2 rounded-lg bg-marca-claro px-4 py-3 text-sm text-marca-oscuro">
          Para llegar a tiempo necesitas apartar <b>{formatear(vista.aporteMensual, moneda)} al mes</b> (unos {formatear(vista.aporteSemanal, moneda)} por semana).
        </p>
      )}
      <label className="sm:col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enMeta} onChange={(e) => setEnMeta(e.target.checked)} className="w-4 h-4" />
        Sumar el aporte mensual a mi meta diaria (lo que necesito producir manejando)
      </label>
      {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={guardando} className={btnPrincipal}>{guardando ? 'Guardando…' : 'Guardar meta'}</button>
      </div>
    </form>
  )
}

export function FormAporte({ meta, cuentas, sugerido, onListo }: {
  meta: MetaConAhorro
  cuentas: CuentaConSaldo[]
  sugerido: number
  onListo: () => void
}) {
  const [tipo, setTipo] = useState<'aporte' | 'retiro'>('aporte')
  const [monto, setMonto] = useState(sugerido ? aTexto(sugerido) : '')
  const [fecha, setFecha] = useState(hoyISO())
  const opciones = cuentas.filter((c) => c.moneda === meta.moneda && !c.archivada && c.id !== meta.cuenta_id)
  const [cuenta, setCuenta] = useState(meta.cuenta_id ? opciones.find((c) => c.tipo === 'efectivo')?.id ?? opciones[0]?.id ?? '' : '')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const m = aCentavos(monto) ?? 0

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!m) return setError('Escribe el monto.')
    if (tipo === 'retiro' && m > meta.ahorrado_centavos) return setError('No puedes retirar más de lo ahorrado.')
    setGuardando(true)
    try {
      await guardarAporte({ meta_id: meta.id, tipo, fecha, monto_centavos: m, cuenta_id: cuenta || null, nota: nota.trim() || null })
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
      <div role="radiogroup" aria-label="Tipo" className="sm:col-span-2 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
        {(['aporte', 'retiro'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)}
            className={`h-10 rounded-lg text-sm font-semibold cursor-pointer ${tipo === t ? 'bg-white shadow-sm' : 'text-suave'}`}>
            {t === 'aporte' ? 'Aportar' : 'Retirar'}
          </button>
        ))}
      </div>
      <Campo etiqueta={`Monto (${simbolo(meta.moneda)})`}>
        <input autoFocus inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} className={`${inputCls} text-lg font-semibold`} />
      </Campo>
      <Campo etiqueta="Fecha"><input type="date" required value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className={inputCls} /></Campo>
      {meta.cuenta_id && (
        <div className="sm:col-span-2">
          <Campo etiqueta={tipo === 'aporte' ? 'Sale de la cuenta' : 'Va a la cuenta'} ayuda="Se registra como transferencia con la cuenta de la meta.">
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={inputCls}>
              <option value="">No mover dinero (solo anotar)</option>
              {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
        </div>
      )}
      <div className="sm:col-span-2"><Campo etiqueta="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} /></Campo></div>
      {tipo === 'aporte' && m > 0 && (
        <p className="sm:col-span-2 text-sm text-suave">
          Quedarás con {formatear(meta.ahorrado_centavos + m, meta.moneda)} de {formatear(meta.monto_objetivo_centavos, meta.moneda)}
          {' '}({Math.min(100, Math.round(((meta.ahorrado_centavos + m) / meta.monto_objetivo_centavos) * 100))}%).
        </p>
      )}
      {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={guardando} className={btnPrincipal}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
