import { useState, type FormEvent } from 'react'
import { Aviso, Campo, btnPrincipal, btnSecundario, inputCls } from '../components/ui'
import { guardarMovimiento, type Categoria, type CuentaConSaldo, type Movimiento, type TipoMovimiento } from '../lib/datos'
import { aCentavos, aTexto, formatear } from '../lib/dinero'
import { hoyISO } from '../lib/fechas'

const TIPOS: { valor: TipoMovimiento; nombre: string }[] = [
  { valor: 'gasto', nombre: 'Gasto' },
  { valor: 'ingreso', nombre: 'Ingreso' },
  { valor: 'transferencia', nombre: 'Transferencia' },
]

export default function FormMovimiento({ movimiento, cuentas, categorias, onListo }: {
  movimiento: Movimiento | null
  cuentas: CuentaConSaldo[]
  categorias: Categoria[]
  onListo: (seguir: boolean) => void
}) {
  const [tipo, setTipo] = useState<TipoMovimiento>(movimiento?.tipo ?? 'gasto')
  const [monto, setMonto] = useState(movimiento ? aTexto(movimiento.monto_centavos) : '')
  const [cuentaId, setCuentaId] = useState(movimiento?.cuenta_id ?? cuentas[0]?.id ?? '')
  const [destinoId, setDestinoId] = useState(movimiento?.cuenta_destino_id ?? '')
  const [montoDestino, setMontoDestino] = useState(
    movimiento?.monto_destino_centavos ? aTexto(movimiento.monto_destino_centavos) : '',
  )
  const [categoriaId, setCategoriaId] = useState(movimiento?.categoria_id ?? '')
  const [fecha, setFecha] = useState(movimiento?.fecha ?? hoyISO())
  const [nota, setNota] = useState(movimiento?.nota ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const cuenta = cuentas.find((c) => c.id === cuentaId)
  const destino = cuentas.find((c) => c.id === destinoId)
  const monedasDistintas = tipo === 'transferencia' && cuenta && destino && cuenta.moneda !== destino.moneda
  const cats = categorias.filter((c) => c.tipo === tipo)

  const centavos = aCentavos(monto)
  const centavosDestino = aCentavos(montoDestino)
  let tasaImplicita: string | null = null
  if (monedasDistintas && centavos && centavosDestino) {
    const pesos = cuenta.moneda === 'DOP' ? centavos : centavosDestino
    const dolares = cuenta.moneda === 'USD' ? centavos : centavosDestino
    tasaImplicita = formatear(Math.round((pesos / dolares) * 100), 'DOP')
  }

  async function guardar(e: FormEvent, seguir: boolean) {
    e.preventDefault()
    setError(null)
    if (!centavos || centavos <= 0) return setError('Escribe un monto mayor que cero.')
    if (!cuentaId) return setError('Elige una cuenta.')
    if (tipo === 'transferencia') {
      if (!destinoId) return setError('Elige la cuenta destino.')
      if (destinoId === cuentaId) return setError('La cuenta destino debe ser diferente.')
      if (monedasDistintas && (!centavosDestino || centavosDestino <= 0))
        return setError(`Escribe cuánto llegó a la cuenta destino en ${destino.moneda === 'USD' ? 'US$' : 'RD$'}.`)
    }
    setGuardando(true)
    try {
      const esTransferencia = tipo === 'transferencia'
      await guardarMovimiento(
        {
          tipo,
          monto_centavos: centavos,
          cuenta_id: cuentaId,
          cuenta_destino_id: esTransferencia ? destinoId : null,
          monto_destino_centavos: esTransferencia && monedasDistintas ? centavosDestino : null,
          categoria_id: esTransferencia ? null : categoriaId || null,
          fecha,
          nota: nota.trim() || null,
        },
        movimiento?.id,
      )
      if (seguir) {
        setMonto('')
        setNota('')
        setMontoDestino('')
        setGuardado(true)
        setGuardando(false)
      }
      onListo(seguir)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }

  if (cuentas.length === 0) {
    return <Aviso>Primero crea una cuenta en la sección Cuentas.</Aviso>
  }

  return (
    <form onSubmit={(e) => guardar(e, false)} className="grid gap-4 sm:grid-cols-2">
      <div role="radiogroup" aria-label="Tipo de movimiento" className="sm:col-span-2 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
        {TIPOS.map((t) => (
          <button
            key={t.valor}
            type="button"
            role="radio"
            aria-checked={tipo === t.valor}
            onClick={() => { setTipo(t.valor); setCategoriaId('') }}
            className={`h-10 rounded-lg text-sm font-semibold cursor-pointer ${tipo === t.valor ? 'bg-white shadow-sm' : 'text-suave'}`}
          >
            {t.nombre}
          </button>
        ))}
      </div>

      <Campo etiqueta={`Monto${cuenta ? ` (${cuenta.moneda === 'USD' ? 'US$' : 'RD$'})` : ''}`}>
        <input autoFocus required inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)}
          className={`${inputCls} text-lg font-semibold`} placeholder="0.00" />
      </Campo>
      <Campo etiqueta="Fecha">
        <input type="date" required value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
      </Campo>

      <Campo etiqueta={tipo === 'transferencia' ? 'Desde la cuenta' : 'Cuenta'}>
        <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={inputCls}>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda === 'USD' ? 'US$' : 'RD$'})</option>)}
        </select>
      </Campo>

      {tipo === 'transferencia' ? (
        <Campo etiqueta="Hacia la cuenta">
          <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} className={inputCls}>
            <option value="">Elegir…</option>
            {cuentas.filter((c) => c.id !== cuentaId).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} ({c.moneda === 'USD' ? 'US$' : 'RD$'})</option>
            ))}
          </select>
        </Campo>
      ) : (
        <Campo etiqueta="Categoría">
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={inputCls}>
            <option value="">Sin categoría</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      )}

      {monedasDistintas && (
        <div className="sm:col-span-2">
          <Campo
            etiqueta={`Monto que llegó (${destino.moneda === 'USD' ? 'US$' : 'RD$'})`}
            ayuda={tasaImplicita ? `Tasa de esta operación: ${tasaImplicita} por US$1` : 'Ej.: compraste US$100 pagando RD$6,350.'}
          >
            <input inputMode="decimal" value={montoDestino} onChange={(e) => setMontoDestino(e.target.value)} className={inputCls} placeholder="0.00" />
          </Campo>
        </div>
      )}

      <div className="sm:col-span-2">
        <Campo etiqueta="Nota (opcional)">
          <input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} placeholder="Ej.: gasolina en la bomba de la 27" />
        </Campo>
      </div>

      {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
      {guardado && !error && <div className="sm:col-span-2"><Aviso tipo="ok">Guardado. Puedes anotar el siguiente.</Aviso></div>}

      <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
        {!movimiento && (
          <button type="button" disabled={guardando} onClick={(e) => guardar(e, true)} className={btnSecundario}>
            Guardar y anotar otro
          </button>
        )}
        <button type="submit" disabled={guardando} className={btnPrincipal}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
