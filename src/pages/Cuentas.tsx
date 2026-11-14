import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Campo, Encabezado, Modal, btnPrincipal, inputCls, tarjeta } from '../components/ui'
import {
  NOMBRES_TIPO_CUENTA, archivarCuenta, guardarCuenta, listarCuentas, obtenerTasaUSD,
  type CuentaConSaldo, type TipoCuenta,
} from '../lib/datos'
import { aCentavos, aTexto, enPesos, formatear, type Moneda } from '../lib/dinero'
import { useDatos } from '../lib/useDatos'

export default function Cuentas() {
  const [verArchivadas, setVerArchivadas] = useState(false)
  const cuentas = useDatos(() => listarCuentas(verArchivadas), [verArchivadas])
  const tasa = useDatos(obtenerTasaUSD, [])
  const [editando, setEditando] = useState<CuentaConSaldo | 'nueva' | null>(null)

  const activas = (cuentas.datos ?? []).filter((c) => !c.archivada)
  const tasaUSD = tasa.datos ?? null
  const totalPesos = activas.reduce(
    (s, c) => s + (c.moneda === 'USD' && !tasaUSD ? 0 : enPesos(c.saldo_centavos, c.moneda, tasaUSD ?? 0)),
    0,
  )
  const hayUSD = activas.some((c) => c.moneda === 'USD')

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado titulo="Cuentas" subtitulo="Efectivo, bancos, tarjetas y ahorros en pesos o dólares.">
        <button className={btnPrincipal} onClick={() => setEditando('nueva')}>+ Nueva cuenta</button>
      </Encabezado>

      {cuentas.error && <Aviso>{cuentas.error}</Aviso>}

      <section className={`${tarjeta} p-5 flex flex-wrap gap-x-10 gap-y-3 items-end`}>
        <div>
          <p className="text-sm text-suave">Total en pesos</p>
          <p className="text-3xl font-bold">{formatear(totalPesos, 'DOP')}</p>
        </div>
        {hayUSD && (
          <p className="text-sm text-suave">
            {tasaUSD
              ? `Dólares convertidos a ${formatear(tasaUSD * 100, 'DOP')} por US$1.`
              : <>Los dólares no se suman porque falta la tasa. <Link to="/ajustes" className="text-marca font-semibold">Ponla en Ajustes</Link>.</>}
          </p>
        )}
      </section>

      {cuentas.cargando ? (
        <p className="text-suave">Cargando…</p>
      ) : (cuentas.datos ?? []).length === 0 ? (
        <div className={`${tarjeta} p-8 text-center space-y-3`}>
          <p className="font-semibold">Todavía no tienes cuentas.</p>
          <p className="text-suave text-sm">Crea al menos una: por ejemplo "Efectivo" en RD$ y "Ahorro en dólares" en US$.</p>
          <button className={btnPrincipal} onClick={() => setEditando('nueva')}>Crear mi primera cuenta</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(cuentas.datos ?? []).map((c) => (
            <article key={c.id} className={`${tarjeta} p-5 space-y-3 ${c.archivada ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold truncate">{c.nombre}</h2>
                  <p className="text-xs text-suave">{NOMBRES_TIPO_CUENTA[c.tipo]}{c.archivada && ' · archivada'}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${c.moneda === 'USD' ? 'bg-ia-claro text-ia' : 'bg-marca-claro text-marca-oscuro'}`}>
                  {c.moneda === 'USD' ? 'US$' : 'RD$'}
                </span>
              </div>
              <p className={`text-2xl font-bold ${c.saldo_centavos < 0 ? 'text-peligro' : ''}`}>
                {formatear(c.saldo_centavos, c.moneda)}
              </p>
              <div className="flex gap-3 text-sm">
                <Link to={`/movimientos?cuenta=${c.id}`} className="font-semibold text-marca hover:underline">Ver movimientos</Link>
                <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => setEditando(c)}>Editar</button>
                <button
                  className="text-suave hover:text-tinta cursor-pointer"
                  onClick={async () => { await archivarCuenta(c.id, !c.archivada); cuentas.recargar() }}
                >
                  {c.archivada ? 'Restaurar' : 'Archivar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-suave">
        <input type="checkbox" checked={verArchivadas} onChange={(e) => setVerArchivadas(e.target.checked)} />
        Mostrar cuentas archivadas
      </label>

      <Modal
        titulo={editando === 'nueva' ? 'Nueva cuenta' : 'Editar cuenta'}
        abierto={editando !== null}
        onCerrar={() => setEditando(null)}
      >
        <FormCuenta
          cuenta={editando === 'nueva' ? null : editando}
          onListo={() => { setEditando(null); cuentas.recargar() }}
        />
      </Modal>
    </div>
  )
}

function FormCuenta({ cuenta, onListo }: { cuenta: CuentaConSaldo | null; onListo: () => void }) {
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoCuenta>(cuenta?.tipo ?? 'efectivo')
  const [moneda, setMoneda] = useState<Moneda>(cuenta?.moneda ?? 'DOP')
  const [saldo, setSaldo] = useState(cuenta ? aTexto(cuenta.saldo_inicial_centavos) : '0')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const negativo = saldo.trim().startsWith('-')
    const centavos = aCentavos(saldo.replace('-', ''))
    if (centavos === null) return setError('Escribe un saldo válido, por ejemplo 1500 o 1,500.50')
    setGuardando(true)
    try {
      await guardarCuenta({
        id: cuenta?.id, nombre: nombre.trim(), tipo, moneda,
        saldo_inicial_centavos: negativo ? -centavos : centavos,
      })
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Campo etiqueta="Nombre">
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Ej.: Efectivo, Banco Popular" />
        </Campo>
      </div>
      <Campo etiqueta="Tipo">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCuenta)} className={inputCls}>
          {Object.entries(NOMBRES_TIPO_CUENTA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Moneda" ayuda={cuenta ? 'La moneda no se puede cambiar después de crearla.' : undefined}>
        <select value={moneda} disabled={!!cuenta} onChange={(e) => setMoneda(e.target.value as Moneda)} className={inputCls}>
          <option value="DOP">Pesos (RD$)</option>
          <option value="USD">Dólares (US$)</option>
        </select>
      </Campo>
      <div className="sm:col-span-2">
        <Campo etiqueta="Saldo inicial" ayuda="Lo que tienes hoy en esta cuenta. En tarjetas de crédito, pon lo que debes en negativo (ej.: -15000).">
          <input inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} className={inputCls} />
        </Campo>
      </div>
      {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button type="submit" disabled={guardando} className={btnPrincipal}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

