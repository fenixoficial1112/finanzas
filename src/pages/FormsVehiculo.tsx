import { useState, type FormEvent, type ReactNode } from 'react'
import { Aviso, Campo, btnPrincipal, inputCls } from '../components/ui'
import {
  NOMBRES_COMBUSTIBLE, NOMBRES_DOCUMENTO, guardarCarga, guardarDocumento, guardarMantenimiento, guardarRecordatorio,
  guardarVehiculo, type CargaCombustible, type CuentaConSaldo, type Documento, type Mantenimiento, type Recordatorio,
  type TipoCombustible, type TipoDocumento, type Vehiculo,
} from '../lib/datos'
import { aCentavos, aTexto } from '../lib/dinero'
import { hoyISO } from '../lib/fechas'

const soloDigitos = (t: string) => t.replace(/\D/g, '')
const entero = (t: string) => (t.trim() ? Number(t) : null)

/** Envoltorio común: maneja guardado y errores. */
function Formulario({ onGuardar, onListo, children, textoBoton = 'Guardar' }: {
  onGuardar: () => Promise<string | void>
  onListo: () => void
  children: ReactNode
  textoBoton?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      const problema = await onGuardar()
      if (problema) {
        setError(problema)
        setGuardando(false)
      } else onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGuardando(false)
    }
  }
  return (
    <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
      {children}
      {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={guardando} className={btnPrincipal}>{guardando ? 'Guardando…' : textoBoton}</button>
      </div>
    </form>
  )
}

function SelectorCuenta({ cuentas, valor, onCambio, textoNinguna }: {
  cuentas: CuentaConSaldo[]
  valor: string
  onCambio: (v: string) => void
  textoNinguna: string
}) {
  return (
    <select value={valor} onChange={(e) => onCambio(e.target.value)} className={inputCls}>
      <option value="">{textoNinguna}</option>
      {cuentas.filter((c) => c.moneda === 'DOP' && !c.archivada).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
    </select>
  )
}

// ---------- Vehículo ----------
export function FormVehiculo({ vehiculo, onListo }: { vehiculo: Vehiculo | null; onListo: () => void }) {
  const [marca, setMarca] = useState(vehiculo?.marca ?? '')
  const [modelo, setModelo] = useState(vehiculo?.modelo ?? '')
  const [anio, setAnio] = useState(vehiculo?.anio ? String(vehiculo.anio) : '')
  const [placa, setPlaca] = useState(vehiculo?.placa ?? '')
  const [km, setKm] = useState(vehiculo ? String(vehiculo.km_registro) : '')
  const [combustible, setCombustible] = useState<TipoCombustible>(vehiculo?.combustible ?? 'gasolina_regular')

  return (
    <Formulario
      onListo={onListo}
      textoBoton={vehiculo ? 'Guardar' : 'Registrar vehículo'}
      onGuardar={async () => {
        if (!km.trim()) return 'Escribe el kilometraje actual.'
        await guardarVehiculo({
          id: vehiculo?.id, marca: marca.trim(), modelo: modelo.trim(), anio: entero(anio),
          placa: placa.trim().toUpperCase() || null, km_registro: Number(km), combustible,
        })
      }}
    >
      <Campo etiqueta="Marca"><input required value={marca} onChange={(e) => setMarca(e.target.value)} className={inputCls} placeholder="Ej.: Toyota" /></Campo>
      <Campo etiqueta="Modelo"><input required value={modelo} onChange={(e) => setModelo(e.target.value)} className={inputCls} placeholder="Ej.: Corolla" /></Campo>
      <Campo etiqueta="Año"><input inputMode="numeric" value={anio} onChange={(e) => setAnio(soloDigitos(e.target.value).slice(0, 4))} className={inputCls} /></Campo>
      <Campo etiqueta="Placa"><input value={placa} onChange={(e) => setPlaca(e.target.value)} className={inputCls} placeholder="Ej.: A123456" /></Campo>
      <Campo etiqueta={vehiculo ? 'Km al registrarlo' : 'Kilometraje actual'} ayuda={vehiculo ? 'El km actual se actualiza solo con tus jornadas, cargas y mantenimientos.' : undefined}>
        <input inputMode="numeric" required value={km} onChange={(e) => setKm(soloDigitos(e.target.value))} className={inputCls} />
      </Campo>
      <Campo etiqueta="Combustible">
        <select value={combustible} onChange={(e) => setCombustible(e.target.value as TipoCombustible)} className={inputCls}>
          {Object.entries(NOMBRES_COMBUSTIBLE).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </Campo>
    </Formulario>
  )
}

// ---------- Carga de combustible ----------
export function FormCarga({ vehiculoId, carga, kmActual, cuentas, onListo }: {
  vehiculoId: string
  carga: CargaCombustible | null
  kmActual: number
  cuentas: CuentaConSaldo[]
  onListo: () => void
}) {
  const [fecha, setFecha] = useState(carga?.fecha ?? hoyISO())
  const [galones, setGalones] = useState(carga ? String(carga.galones) : '')
  const [precio, setPrecio] = useState(carga ? aTexto(Math.round(carga.total_centavos / carga.galones)) : '')
  const [total, setTotal] = useState(carga ? aTexto(carga.total_centavos) : '')
  const [km, setKm] = useState(carga?.km != null ? String(carga.km) : String(kmActual))
  const [lleno, setLleno] = useState(carga?.tanque_lleno ?? true)
  const [cuenta, setCuenta] = useState(
    carga ? carga.cuenta_id ?? '' : cuentas.find((c) => c.tipo === 'efectivo' && c.moneda === 'DOP')?.id ?? '',
  )
  const [nota, setNota] = useState(carga?.nota ?? '')

  const recalcular = (g: string, p: string) => {
    const gal = Number(g.replace(',', '.'))
    const cent = aCentavos(p)
    if (gal > 0 && cent) setTotal(aTexto(Math.round(gal * cent)))
  }

  return (
    <Formulario
      onListo={onListo}
      onGuardar={async () => {
        const gal = Number(galones.replace(',', '.'))
        const tot = aCentavos(total)
        if (!(gal > 0)) return 'Escribe los galones (ej.: 8.5).'
        if (!tot) return 'Escribe el total pagado.'
        await guardarCarga(vehiculoId, {
          fecha, galones: gal, total_centavos: tot, km: entero(km), tanque_lleno: lleno, cuenta_id: cuenta || null, nota: nota.trim() || null,
        }, carga?.id)
      }}
    >
      <Campo etiqueta="Fecha"><input type="date" required value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className={inputCls} /></Campo>
      <Campo etiqueta="Km en el odómetro"><input inputMode="numeric" value={km} onChange={(e) => setKm(soloDigitos(e.target.value))} className={inputCls} /></Campo>
      <Campo etiqueta="Galones">
        <input inputMode="decimal" required value={galones} className={inputCls} placeholder="Ej.: 8.5"
          onChange={(e) => { setGalones(e.target.value); recalcular(e.target.value, precio) }} />
      </Campo>
      <Campo etiqueta="Precio por galón (RD$)">
        <input inputMode="decimal" value={precio} className={inputCls} placeholder="Ej.: 317.50"
          onChange={(e) => { setPrecio(e.target.value); recalcular(galones, e.target.value) }} />
      </Campo>
      <Campo etiqueta="Total pagado (RD$)">
        <input inputMode="decimal" required value={total} onChange={(e) => setTotal(e.target.value)} className={`${inputCls} font-semibold`} />
      </Campo>
      <label className="flex items-center gap-2 text-sm self-end h-11">
        <input type="checkbox" checked={lleno} onChange={(e) => setLleno(e.target.checked)} className="w-4 h-4" />
        Llené el tanque (para calcular km por galón)
      </label>
      <div className="sm:col-span-2">
        <Campo etiqueta="Registrar el gasto en la cuenta" ayuda="Si ya anotaste este combustible en la jornada, elige “No crear gasto” para no contarlo dos veces.">
          <SelectorCuenta cuentas={cuentas} valor={cuenta} onCambio={setCuenta} textoNinguna="No crear gasto" />
        </Campo>
      </div>
      <div className="sm:col-span-2">
        <Campo etiqueta="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} placeholder="Ej.: bomba Shell de la Churchill" /></Campo>
      </div>
    </Formulario>
  )
}

// ---------- Mantenimiento ----------
export function FormMantenimiento({ vehiculoId, mantenimiento, kmActual, cuentas, tipos, onListo }: {
  vehiculoId: string
  mantenimiento: Mantenimiento | null
  kmActual: number
  cuentas: CuentaConSaldo[]
  tipos: string[]
  onListo: () => void
}) {
  const [tipo, setTipo] = useState(mantenimiento?.tipo ?? '')
  const [fecha, setFecha] = useState(mantenimiento?.fecha ?? hoyISO())
  const [km, setKm] = useState(mantenimiento?.km != null ? String(mantenimiento.km) : String(kmActual))
  const [costo, setCosto] = useState(mantenimiento ? aTexto(mantenimiento.costo_centavos) : '')
  const [cuenta, setCuenta] = useState(
    mantenimiento ? mantenimiento.cuenta_id ?? '' : cuentas.find((c) => c.tipo === 'efectivo' && c.moneda === 'DOP')?.id ?? '',
  )
  const [taller, setTaller] = useState(mantenimiento?.taller ?? '')
  const [nota, setNota] = useState(mantenimiento?.nota ?? '')

  return (
    <Formulario
      onListo={onListo}
      onGuardar={async () => {
        const c = costo.trim() ? aCentavos(costo) : 0
        if (c === null) return 'Escribe un costo válido.'
        await guardarMantenimiento(vehiculoId, {
          tipo: tipo.trim(), fecha, km: entero(km), costo_centavos: c, cuenta_id: cuenta || null,
          taller: taller.trim() || null, nota: nota.trim() || null,
        }, mantenimiento?.id)
      }}
    >
      <div className="sm:col-span-2">
        <Campo etiqueta="¿Qué se hizo?" ayuda="Si coincide con un recordatorio (ej.: Cambio de aceite), ese recordatorio vuelve a empezar.">
          <input required list="tipos-mantenimiento" value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls} placeholder="Ej.: Cambio de aceite" />
          <datalist id="tipos-mantenimiento">{tipos.map((t) => <option key={t} value={t} />)}</datalist>
        </Campo>
      </div>
      <Campo etiqueta="Fecha"><input type="date" required value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className={inputCls} /></Campo>
      <Campo etiqueta="Km"><input inputMode="numeric" value={km} onChange={(e) => setKm(soloDigitos(e.target.value))} className={inputCls} /></Campo>
      <Campo etiqueta="Costo (RD$)"><input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} className={inputCls} placeholder="0.00" /></Campo>
      <Campo etiqueta="Pagado desde">
        <SelectorCuenta cuentas={cuentas} valor={cuenta} onCambio={setCuenta} textoNinguna="No crear gasto" />
      </Campo>
      <Campo etiqueta="Taller (opcional)"><input value={taller} onChange={(e) => setTaller(e.target.value)} className={inputCls} /></Campo>
      <Campo etiqueta="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} /></Campo>
    </Formulario>
  )
}

// ---------- Recordatorio ----------
export function FormRecordatorio({ vehiculoId, recordatorio, kmActual, onListo }: {
  vehiculoId: string
  recordatorio: Recordatorio | null
  kmActual: number
  onListo: () => void
}) {
  const [tipo, setTipo] = useState(recordatorio?.tipo ?? '')
  const [cadaKm, setCadaKm] = useState(recordatorio?.cada_km ? String(recordatorio.cada_km) : '')
  const [cadaMeses, setCadaMeses] = useState(recordatorio?.cada_meses ? String(recordatorio.cada_meses) : '')
  const [ultimoKm, setUltimoKm] = useState(recordatorio?.ultimo_km != null ? String(recordatorio.ultimo_km) : String(kmActual))
  const [ultimaFecha, setUltimaFecha] = useState(recordatorio?.ultima_fecha ?? hoyISO())

  return (
    <Formulario
      onListo={onListo}
      onGuardar={async () => {
        if (!cadaKm && !cadaMeses) return 'Pon cada cuántos km o cada cuántos meses.'
        await guardarRecordatorio(vehiculoId, {
          tipo: tipo.trim(), cada_km: entero(cadaKm), cada_meses: entero(cadaMeses),
          ultimo_km: entero(ultimoKm), ultima_fecha: ultimaFecha || null,
        }, recordatorio?.id)
      }}
    >
      <div className="sm:col-span-2">
        <Campo etiqueta="Mantenimiento"><input required value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls} placeholder="Ej.: Cambio de aceite" /></Campo>
      </div>
      <Campo etiqueta="Cada cuántos km"><input inputMode="numeric" value={cadaKm} onChange={(e) => setCadaKm(soloDigitos(e.target.value))} className={inputCls} placeholder="Ej.: 5000" /></Campo>
      <Campo etiqueta="Y/o cada cuántos meses"><input inputMode="numeric" value={cadaMeses} onChange={(e) => setCadaMeses(soloDigitos(e.target.value))} className={inputCls} placeholder="Ej.: 6" /></Campo>
      <Campo etiqueta="Última vez: km"><input inputMode="numeric" value={ultimoKm} onChange={(e) => setUltimoKm(soloDigitos(e.target.value))} className={inputCls} /></Campo>
      <Campo etiqueta="Última vez: fecha"><input type="date" value={ultimaFecha} max={hoyISO()} onChange={(e) => setUltimaFecha(e.target.value)} className={inputCls} /></Campo>
    </Formulario>
  )
}

// ---------- Documento ----------
export function FormDocumento({ vehiculoId, documento, onListo }: { vehiculoId: string; documento: Documento | null; onListo: () => void }) {
  const [tipo, setTipo] = useState<TipoDocumento>(documento?.tipo ?? 'seguro')
  const [nombre, setNombre] = useState(documento?.nombre ?? '')
  const [vence, setVence] = useState(documento?.vence ?? '')
  const [nota, setNota] = useState(documento?.nota ?? '')
  return (
    <Formulario
      onListo={onListo}
      onGuardar={async () => {
        await guardarDocumento(vehiculoId, { tipo, nombre: nombre.trim() || null, vence, nota: nota.trim() || null }, documento?.id)
      }}
    >
      <Campo etiqueta="Documento">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)} className={inputCls}>
          {Object.entries(NOMBRES_DOCUMENTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Vence el"><input type="date" required value={vence} onChange={(e) => setVence(e.target.value)} className={inputCls} /></Campo>
      <Campo etiqueta="Detalle (opcional)"><input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Ej.: Seguros Universal, póliza 123" /></Campo>
      <Campo etiqueta="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} /></Campo>
    </Formulario>
  )
}
