import { useState, type FormEvent } from 'react'
import { Aviso, Campo, btnPrincipal, inputCls } from '../components/ui'
import {
  NOMBRES_DEUDA, NOMBRES_FRECUENCIA, borrarCuenta, crearCuentaTarjeta, guardarDeuda, guardarPagoDeuda, type CuentaConSaldo, type Deuda,
  type DeudaConEstado, type FrecuenciaPago, type TipoDeuda,
} from '../lib/datos'
import { cuotaMensual, interesMensual, tasaAnual, type PeriodoTasa } from '../lib/deudas'
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

export function FormDeuda({ deuda, cuentas, onListo }: { deuda: DeudaConEstado | null; cuentas: CuentaConSaldo[]; onListo: () => void }) {
  const [nombre, setNombre] = useState(deuda?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoDeuda>(deuda?.tipo ?? 'tarjeta')
  const [acreedor, setAcreedor] = useState(deuda?.acreedor ?? '')
  const [saldo, setSaldo] = useState(deuda ? aTexto(deuda.cuenta_tarjeta_id ? deuda.saldo_centavos : deuda.saldo_inicial_centavos) : '')
  const [tasa, setTasa] = useState(deuda ? String(deuda.tasa_anual) : '')
  const [periodo, setPeriodo] = useState<PeriodoTasa>('anual')
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>(deuda?.frecuencia ?? 'mensual')
  const [cuota, setCuota] = useState(deuda ? aTexto(deuda.cuota_centavos) : '')
  const [dia, setDia] = useState(deuda?.dia_pago ? String(deuda.dia_pago) : '')
  const [dia2, setDia2] = useState(deuda?.dia_pago_2 ? String(deuda.dia_pago_2) : '')
  const [diaSemana, setDiaSemana] = useState(deuda?.dia_semana != null ? String(deuda.dia_semana) : '1')
  const [limite, setLimite] = useState(deuda?.limite_credito_centavos ? aTexto(deuda.limite_credito_centavos) : '')
  const [corte, setCorte] = useState(deuda?.dia_corte ? String(deuda.dia_corte) : '')
  // Tarjeta: '' = sin vincular, 'nueva' = crear la cuenta, o el id de una cuenta tipo tarjeta existente.
  const tarjetasLibres = cuentas.filter((c) => c.tipo === 'tarjeta' && c.moneda === 'DOP' && !c.archivada)
  const [vinculo, setVinculo] = useState(deuda ? deuda.cuenta_tarjeta_id ?? '' : 'nueva')
  const [enMeta, setEnMeta] = useState(deuda?.incluir_en_meta ?? true)
  const [plazo, setPlazo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const esTarjeta = tipo === 'tarjeta'
  const vinculada = esTarjeta && vinculo !== ''
  const esPrestamo = !esTarjeta && frecuencia === 'mensual'
  const tasaCalculada = plazo ? tasaDesdeCuota(aCentavos(saldo) ?? 0, aCentavos(cuota) ?? 0, Number(plazo)) : null
  const tasaNum = Number((tasa || '0').replace(',', '.'))
  const anualVista = tasaNum > 0 && periodo !== 'anual' ? tasaAnual(tasaNum, periodo) : null
  const c = aCentavos(cuota) ?? 0
  const s = aCentavos(saldo) ?? 0
  const interesMes = s && tasaNum ? interesMensual(s, periodo === 'anual' ? tasaNum : tasaAnual(tasaNum, periodo)) : 0
  const mensual = cuotaMensual(c, frecuencia)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const sc = aCentavos(saldo)
    const cc = cuota.trim() ? aCentavos(cuota) : 0
    if (sc === null) return setError('Escribe el saldo que debes.')
    if (cc === null) return setError('Escribe una cuota válida.')
    if (!(tasaNum >= 0)) return setError('Escribe una tasa válida.')
    if (frecuencia === 'quincenal' && (!dia || !dia2)) return setError('Pon los dos días del mes en que pagas (ej.: 15 y 30).')
    const anual = Math.round(tasaAnual(tasaNum, periodo) * 100) / 100
    if (anual > 1000) return setError('Esa tasa es demasiado alta; revisa el número y el periodo.')
    const lim = limite.trim() ? aCentavos(limite) : null
    if (limite.trim() && !lim) return setError('Escribe un límite de crédito válido.')
    setGuardando(true)
    let cuentaCreada: string | null = null
    try {
      let cuentaTarjeta: string | null = null
      if (esTarjeta && vinculo === 'nueva') cuentaTarjeta = cuentaCreada = await crearCuentaTarjeta(nombre.trim(), sc)
      else if (esTarjeta && vinculo) cuentaTarjeta = vinculo
      await guardarDeuda({
        nombre: nombre.trim(), tipo, acreedor: acreedor.trim() || null,
        saldo_inicial_centavos: cuentaTarjeta ? 0 : sc,
        tasa_anual: anual, cuota_centavos: cc,
        frecuencia: esTarjeta ? 'mensual' : frecuencia,
        dia_pago: frecuencia === 'semanal' || frecuencia === 'diaria' ? null : dia ? Number(dia) : null,
        dia_pago_2: frecuencia === 'quincenal' && dia2 ? Number(dia2) : null,
        dia_semana: frecuencia === 'semanal' ? Number(diaSemana) : null,
        limite_credito_centavos: esTarjeta ? lim : null,
        dia_corte: esTarjeta && corte ? Number(corte) : null,
        cuenta_tarjeta_id: cuentaTarjeta,
        incluir_en_meta: enMeta,
      } satisfies Omit<Deuda, 'id' | 'pagada' | 'creado_en'>, deuda?.id)
      onListo()
    } catch (err) {
      // Si la deuda no se pudo guardar, no dejamos la cuenta de la tarjeta suelta.
      if (cuentaCreada) await borrarCuenta(cuentaCreada).catch(() => undefined)
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }

  const soloDias = (v: string) => v.replace(/\D/g, '').slice(0, 2)

  return (
    <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre"><input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder={esTarjeta ? 'Ej.: Tarjeta Popular' : 'Ej.: Préstamo de Juan'} /></Campo>
      <Campo etiqueta="Tipo">
        <select value={tipo} disabled={!!deuda?.cuenta_tarjeta_id} onChange={(e) => setTipo(e.target.value as TipoDeuda)} className={inputCls}>
          {Object.entries(NOMBRES_DEUDA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </Campo>

      {esTarjeta && (
        <div className="sm:col-span-2 rounded-xl bg-gray-50 border border-borde p-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Campo etiqueta="Cómo llevar esta tarjeta" ayuda={vinculada
              ? 'Registra cada compra como un gasto con la cuenta de la tarjeta. Pagarla será una transferencia desde tu banco o efectivo, sin contar el gasto dos veces.'
              : 'Solo anotarás pagos y cargos; las compras no se registran por separado.'}>
              <select value={vinculo} disabled={!!deuda?.cuenta_tarjeta_id} onChange={(e) => setVinculo(e.target.value)} className={inputCls}>
                {!deuda && <option value="nueva">Crear una cuenta para registrar mis compras (recomendado)</option>}
                {tarjetasLibres.map((t) => <option key={t.id} value={t.id}>Usar mi cuenta “{t.nombre}”</option>)}
                <option value="">Solo llevar el saldo de la deuda</option>
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Límite de crédito (RD$)"><input inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} className={inputCls} placeholder="Ej.: 100,000" /></Campo>
          <Campo etiqueta="Día de corte"><input inputMode="numeric" value={corte} onChange={(e) => setCorte(soloDias(e.target.value))} className={inputCls} placeholder="Ej.: 2" /></Campo>
          <Campo etiqueta="Fecha límite de pago (día)"><input inputMode="numeric" value={dia} onChange={(e) => setDia(soloDias(e.target.value))} className={inputCls} placeholder="Ej.: 17" /></Campo>
        </div>
      )}

      <Campo
        etiqueta={vinculada && deuda?.cuenta_tarjeta_id ? 'Lo que debes hoy (RD$)' : deuda && !vinculada ? 'Saldo al registrarla (RD$)' : 'Cuánto debes hoy (RD$)'}
        ayuda={deuda?.cuenta_tarjeta_id ? 'Se calcula solo con tus compras, pagos y cargos.' : deuda ? 'Los pagos y cargos se suman aparte.' : undefined}
      >
        <input inputMode="decimal" required disabled={!!deuda?.cuenta_tarjeta_id} value={saldo} onChange={(e) => setSaldo(e.target.value)} className={inputCls} placeholder="0.00" />
      </Campo>

      {!esTarjeta && (
        <Campo etiqueta="¿Cada cuánto pagas?">
          <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaPago)} className={inputCls}>
            {Object.entries(NOMBRES_FRECUENCIA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </Campo>
      )}

      <Campo etiqueta={esTarjeta ? 'Pago mínimo al mes (RD$)' : `Cuota por pago (RD$)`}
        ayuda={!esTarjeta && frecuencia !== 'mensual' && c > 0 ? `Equivale a ${formatear(mensual)} al mes.` : undefined}>
        <input inputMode="decimal" value={cuota} onChange={(e) => setCuota(e.target.value)} className={inputCls} placeholder="0.00" />
      </Campo>

      {!esTarjeta && frecuencia === 'mensual' && (
        <Campo etiqueta="Día de pago (1–31)"><input inputMode="numeric" value={dia} onChange={(e) => setDia(soloDias(e.target.value))} className={inputCls} placeholder="Ej.: 17" /></Campo>
      )}
      {!esTarjeta && frecuencia === 'quincenal' && (
        <Campo etiqueta="Días de pago">
          <div className="flex gap-2">
            <input aria-label="Primer día" inputMode="numeric" value={dia} onChange={(e) => setDia(soloDias(e.target.value))} className={inputCls} placeholder="15" />
            <input aria-label="Segundo día" inputMode="numeric" value={dia2} onChange={(e) => setDia2(soloDias(e.target.value))} className={inputCls} placeholder="30" />
          </div>
        </Campo>
      )}
      {!esTarjeta && frecuencia === 'semanal' && (
        <Campo etiqueta="Día de la semana">
          <select value={diaSemana} onChange={(e) => setDiaSemana(e.target.value)} className={inputCls}>
            {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((n, i) => <option key={n} value={i}>{n}</option>)}
          </select>
        </Campo>
      )}

      <Campo etiqueta="Tasa de interés (%)" ayuda="La del contrato o estado de cuenta. En préstamos callejeros suele ser “X% mensual” o “X% por quincena”. Si es un familiar sin interés, pon 0.">
        <div className="flex gap-2">
          <input inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} className={inputCls} placeholder="Ej.: 20" />
          <select aria-label="Periodo de la tasa" value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoTasa)} className={`${inputCls} w-36`}>
            <option value="anual">anual</option>
            <option value="mensual">mensual</option>
            <option value="quincenal">quincenal</option>
            <option value="semanal">semanal</option>
            <option value="diaria">diaria</option>
          </select>
        </div>
      </Campo>
      {(anualVista || (interesMes > 0 && mensual > 0)) && (
        <div className="sm:col-span-2 space-y-2">
          {anualVista != null && (
            <p className={`text-sm rounded-lg px-3 py-2 ${anualVista >= 60 ? 'bg-red-50 text-peligro' : 'bg-gray-50 text-suave'}`}>
              {tasaNum}% {periodo} equivale a <b>{Math.round(anualVista)}% al año</b>.
              {anualVista >= 60 && ' Es un préstamo muy caro: conviene salir de él primero.'}
            </p>
          )}
          {interesMes > 0 && mensual > 0 && mensual <= interesMes && (
            <p className="text-sm rounded-lg px-3 py-2 bg-red-50 text-peligro">
              Pagas {formatear(mensual)} al mes y los intereses son {formatear(interesMes)}: <b>solo cubres réditos, el capital no baja</b>. Necesitas abonar a capital para salir.
            </p>
          )}
        </div>
      )}

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
      <Campo etiqueta="Acreedor (opcional)"><input value={acreedor} onChange={(e) => setAcreedor(e.target.value)} className={inputCls} placeholder="Ej.: Banco Popular, Don Pedro" /></Campo>
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
  const pesos = cuentas.filter((c) => c.moneda === 'DOP' && !c.archivada && c.tipo !== 'tarjeta' && c.tipo !== 'inversion')
  const [cuenta, setCuenta] = useState(pesos.find((c) => c.tipo === 'efectivo')?.id ?? pesos[0]?.id ?? '')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const m = aCentavos(monto) ?? 0
  const vinculada = Boolean(deuda.cuenta_tarjeta_id)
  // En tarjetas vinculadas los intereses se registran como "cargo"; el pago completo baja el saldo.
  const i = vinculada ? 0 : Math.min(aCentavos(interes) ?? 0, m)

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
            {t === 'pago' ? 'Hice un pago' : vinculada ? 'Intereses o cargos del banco' : 'Nuevo cargo (compra, mora…)'}
          </button>
        ))}
      </div>
      <Campo etiqueta="Monto (RD$)"><input autoFocus inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} className={`${inputCls} text-lg font-semibold`} /></Campo>
      <Campo etiqueta="Fecha"><input type="date" required value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className={inputCls} /></Campo>
      {tipo === 'cargo' && vinculada && (
        <p className="sm:col-span-2 text-sm text-suave">Se registra como gasto en la tarjeta (categoría “Intereses y cargos bancarios”). Las compras anótalas en Movimientos con la cuenta de la tarjeta.</p>
      )}
      {tipo === 'pago' && (
        <>
          {!vinculada && (
            <Campo etiqueta="De eso, intereses (RD$)" ayuda={`Estimado: ${formatear(interesEstimado)} este mes. Cópialo de tu estado de cuenta si lo tienes.`}>
              <input inputMode="decimal" value={interes} onChange={(e) => setInteres(e.target.value)} className={inputCls} />
            </Campo>
          )}
          <Campo etiqueta="Pagado desde">
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={inputCls}>
              <option value="">{vinculada ? 'No mover dinero (solo anotar)' : 'No crear gasto'}</option>
              {pesos.filter((c) => c.id !== deuda.cuenta_tarjeta_id).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
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
