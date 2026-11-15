import { useState, type FormEvent } from 'react'
import { Aviso, Campo, btnPrincipal, inputCls } from '../components/ui'
import {
  NOMBRES_INVERSION, actualizarInversion, crearInversion, operarInversion, type CuentaConSaldo, type InversionConValor,
  type TipoInversion,
} from '../lib/datos'
import { aCentavos, aTexto, formatear, type Moneda } from '../lib/dinero'
import { hoyISO } from '../lib/fechas'

const simbolo = (m: Moneda) => (m === 'USD' ? 'US$' : 'RD$')

export function FormInversion({ inversion, cuentas, onListo }: { inversion: InversionConValor | null; cuentas: CuentaConSaldo[]; onListo: () => void }) {
  const [nombre, setNombre] = useState(inversion?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoInversion>(inversion?.tipo ?? 'certificado')
  const [entidad, setEntidad] = useState(inversion?.entidad ?? '')
  const [moneda, setMoneda] = useState<Moneda>(inversion?.moneda ?? 'DOP')
  const [monto, setMonto] = useState('')
  const [origen, setOrigen] = useState('')
  const [tasa, setTasa] = useState(inversion?.tasa_anual != null ? String(inversion.tasa_anual) : '')
  const [inicio, setInicio] = useState(inversion?.fecha_inicio ?? hoyISO())
  const [vence, setVence] = useState(inversion?.fecha_vencimiento ?? '')
  const [nota, setNota] = useState(inversion?.nota ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const origenes = cuentas.filter((c) => c.moneda === moneda && !c.archivada && c.tipo !== 'inversion')

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const t = tasa.trim() ? Number(tasa.replace(',', '.')) : null
    if (t != null && !(t >= 0 && t <= 100)) return setError('La tasa debe estar entre 0 y 100%.')
    if (vence && vence < inicio) return setError('El vencimiento no puede ser antes del inicio.')
    setGuardando(true)
    try {
      if (inversion) {
        await actualizarInversion(inversion.id, { nombre: nombre.trim(), entidad: entidad.trim() || null, tasa_anual: t, fecha_vencimiento: vence || null, nota: nota.trim() || null })
      } else {
        const c = aCentavos(monto)
        if (!c) { setGuardando(false); return setError('Escribe cuánto invertiste.') }
        await crearInversion({
          nombre: nombre.trim(), tipo, entidad: entidad.trim() || null, moneda, tasa_anual: t, fecha_inicio: inicio,
          fecha_vencimiento: vence || null, nota: nota.trim() || null, monto_centavos: c, cuenta_origen_id: origen || null,
        })
      }
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre"><input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Ej.: Certificado 6 meses" /></Campo>
      <Campo etiqueta="Tipo">
        <select value={tipo} disabled={!!inversion} onChange={(e) => setTipo(e.target.value as TipoInversion)} className={inputCls}>
          {Object.entries(NOMBRES_INVERSION).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Entidad (opcional)"><input value={entidad} onChange={(e) => setEntidad(e.target.value)} className={inputCls} placeholder="Banco, AFI, puesto de bolsa, cooperativa…" /></Campo>
      <Campo etiqueta="Moneda">
        <select value={moneda} disabled={!!inversion} onChange={(e) => { setMoneda(e.target.value as Moneda); setOrigen('') }} className={inputCls}>
          <option value="DOP">Pesos (RD$)</option>
          <option value="USD">Dólares (US$)</option>
        </select>
      </Campo>
      {!inversion && (
        <>
          <Campo etiqueta={`Monto invertido (${simbolo(moneda)})`}>
            <input inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} className={inputCls} placeholder="0.00" />
          </Campo>
          <Campo etiqueta="El dinero sale de" ayuda="Si ya estaba invertido antes de usar la app, elige la primera opción.">
            <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={inputCls}>
              <option value="">Ya lo tenía invertido (no mover dinero)</option>
              {origenes.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({formatear(c.saldo_centavos, c.moneda)})</option>)}
            </select>
          </Campo>
        </>
      )}
      <Campo etiqueta="Tasa anual (%)" ayuda="Déjala vacía si el rendimiento es variable (fondos, acciones).">
        <input inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} className={inputCls} placeholder="Ej.: 9" />
      </Campo>
      <Campo etiqueta="Fecha de inicio">
        <input type="date" value={inicio} disabled={!!inversion} max={hoyISO()} onChange={(e) => setInicio(e.target.value)} className={inputCls} />
      </Campo>
      <Campo etiqueta="Vence (opcional)"><input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className={inputCls} /></Campo>
      <Campo etiqueta="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} /></Campo>
      {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={guardando} className={btnPrincipal}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

type TipoOp = 'depositar' | 'retirar' | 'rendimiento' | 'valor'
const NOMBRES_OP: Record<TipoOp, string> = {
  depositar: 'Depositar',
  retirar: 'Retirar',
  rendimiento: 'Cobré rendimiento',
  valor: 'Actualizar valor',
}

export function FormOperacion({ inversion, cuentas, inicial, onListo }: {
  inversion: InversionConValor
  cuentas: CuentaConSaldo[]
  inicial: TipoOp
  onListo: () => void
}) {
  const [tipo, setTipo] = useState<TipoOp>(inicial)
  const [monto, setMonto] = useState(inicial === 'valor' ? aTexto(inversion.valor_centavos) : '')
  const [fecha, setFecha] = useState(hoyISO())
  const otras = cuentas.filter((c) => c.moneda === inversion.moneda && !c.archivada && c.id !== inversion.cuenta_id && c.tipo !== 'inversion')
  const [cuenta, setCuenta] = useState(otras.find((c) => c.tipo === 'banco')?.id ?? otras[0]?.id ?? '')
  const [reinvertir, setReinvertir] = useState(true)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const c = aCentavos(monto)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (c === null || (tipo !== 'valor' && !c)) return setError('Escribe un monto válido.')
    if (tipo !== 'valor' && tipo !== 'rendimiento' && !cuenta) return setError('Elige la cuenta.')
    if (tipo === 'retirar' && c > inversion.valor_centavos) return setError('No puedes retirar más del valor actual.')
    setGuardando(true)
    try {
      if (tipo === 'valor') await operarInversion(inversion, { tipo, valor_centavos: c, fecha, nota })
      else if (tipo === 'rendimiento') {
        await operarInversion(inversion, { tipo, monto_centavos: c, fecha, nota, cuenta_id: reinvertir ? inversion.cuenta_id : cuenta })
      } else await operarInversion(inversion, { tipo, monto_centavos: c, fecha, nota, cuenta_id: cuenta })
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }

  const diferencia = tipo === 'valor' && c != null ? c - inversion.valor_centavos : 0

  return (
    <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
      <div role="radiogroup" aria-label="Operación" className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1">
        {(Object.keys(NOMBRES_OP) as TipoOp[]).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t}
            onClick={() => { setTipo(t); setMonto(t === 'valor' ? aTexto(inversion.valor_centavos) : '') }}
            className={`h-10 rounded-lg text-sm font-semibold cursor-pointer ${tipo === t ? 'bg-white shadow-sm' : 'text-suave'}`}>
            {NOMBRES_OP[t]}
          </button>
        ))}
      </div>
      <Campo etiqueta={tipo === 'valor' ? `Valor actual según tu estado de cuenta (${simbolo(inversion.moneda)})` : `Monto (${simbolo(inversion.moneda)})`}>
        <input autoFocus inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} className={`${inputCls} text-lg font-semibold`} />
      </Campo>
      <Campo etiqueta="Fecha"><input type="date" required value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className={inputCls} /></Campo>
      {(tipo === 'depositar' || tipo === 'retirar') && (
        <div className="sm:col-span-2">
          <Campo etiqueta={tipo === 'depositar' ? 'Sale de la cuenta' : 'Va a la cuenta'}>
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={inputCls}>
              {otras.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </Campo>
        </div>
      )}
      {tipo === 'rendimiento' && (
        <div className="sm:col-span-2 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reinvertir} onChange={(e) => setReinvertir(e.target.checked)} className="w-4 h-4" />
            Se quedó reinvertido (suma al valor de la inversión)
          </label>
          {!reinvertir && (
            <Campo etiqueta="Me lo pagaron en la cuenta">
              <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={inputCls}>
                {otras.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </Campo>
          )}
        </div>
      )}
      {tipo === 'valor' && diferencia !== 0 && (
        <p className={`sm:col-span-2 text-sm ${diferencia > 0 ? 'text-marca' : 'text-peligro'}`}>
          {diferencia > 0 ? 'Ganancia' : 'Pérdida'} de {formatear(Math.abs(diferencia), inversion.moneda)} desde el último valor. No cuenta en tus ingresos ni gastos del mes.
        </p>
      )}
      <div className="sm:col-span-2"><Campo etiqueta="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} /></Campo></div>
      {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={guardando} className={btnPrincipal}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
