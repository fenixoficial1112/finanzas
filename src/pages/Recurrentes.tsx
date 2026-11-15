import { useState, type FormEvent } from 'react'
import { Aviso, Campo, Encabezado, Modal, btnPrincipal, inputCls, tarjeta } from '../components/ui'
import {
  borrarRecurrente, guardarRecurrente, listarCategorias, listarCuentas, listarRecurrentes, pausarRecurrente,
  type Recurrente, type TipoMovimiento,
} from '../lib/datos'
import { aCentavos, aTexto, formatear } from '../lib/dinero'
import { fechaLarga, hoyISO } from '../lib/fechas'
import { describir, primeraFecha, type FrecuenciaRecurrente } from '../lib/recurrentes'
import { useDatos } from '../lib/useDatos'

const NOMBRES_FRECUENCIA: Record<FrecuenciaRecurrente, string> = {
  mensual: 'Cada mes',
  quincenal: 'Cada quincena (2 veces al mes)',
  semanal: 'Cada semana',
  diaria: 'Cada día',
  anual: 'Cada año',
}
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function Recurrentes() {
  const datos = useDatos(async () => {
    const [recurrentes, cuentas, categorias] = await Promise.all([listarRecurrentes(), listarCuentas(), listarCategorias()])
    return { recurrentes, cuentas, categorias }
  }, [])
  const [editando, setEditando] = useState<Recurrente | 'nuevo' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (datos.error) return <Aviso>{datos.error}</Aviso>
  if (datos.cargando || !datos.datos) return <p className="text-suave">Cargando…</p>
  const { recurrentes, cuentas, categorias } = datos.datos
  const cuenta = new Map(cuentas.map((c) => [c.id, c]))
  const cat = new Map(categorias.map((c) => [c.id, c.nombre]))

  const accion = async (fn: () => Promise<void>) => {
    try { await fn(); setError(null); datos.recargar() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <Encabezado titulo="Pagos recurrentes" subtitulo="Alquiler, sueldo, suscripciones, cuotas… lo que se repite.">
        <button className={btnPrincipal} onClick={() => setEditando('nuevo')}>+ Nuevo recurrente</button>
      </Encabezado>
      {error && <Aviso>{error}</Aviso>}

      {recurrentes.length === 0 ? (
        <section className={`${tarjeta} p-8 text-center space-y-3`}>
          <p className="font-semibold text-lg">Anota lo que se repite y olvídate</p>
          <p className="text-sm text-suave max-w-xl mx-auto">
            Por ejemplo: el alquiler el día 1, Netflix el 20, la cuota del préstamo los días 15 y 30. Puedes elegir que se anoten
            solos o que la app te pregunte cada vez.
          </p>
          <button className={btnPrincipal} onClick={() => setEditando('nuevo')}>Crear el primero</button>
        </section>
      ) : (
        <ul className={`${tarjeta} divide-y divide-borde`}>
          {recurrentes.map((r) => {
            const signo = r.tipo === 'ingreso' ? '+' : r.tipo === 'gasto' ? '−' : ''
            return (
              <li key={r.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 ${r.activa ? '' : 'opacity-60'}`}>
                <div className="flex-1 min-w-56">
                  <p className="font-semibold">{r.nombre}</p>
                  <p className="text-sm text-suave">
                    {describir(r)} · {cuenta.get(r.cuenta_id)?.nombre ?? '—'}
                    {r.tipo === 'transferencia' ? ` → ${cuenta.get(r.cuenta_destino_id!)?.nombre ?? '—'}` : r.categoria_id ? ` · ${cat.get(r.categoria_id)}` : ''}
                  </p>
                  <p className="text-xs text-suave mt-0.5">
                    {r.activa ? `Próxima: ${fechaLarga(r.proxima_fecha).toLowerCase()}` : 'Pausado'}
                    {' · '}{r.automatico ? 'se anota solo' : 'te pregunta antes'}
                    {r.hasta ? ` · hasta ${fechaLarga(r.hasta).toLowerCase()}` : ''}
                  </p>
                </div>
                <span className={`font-bold ${r.tipo === 'ingreso' ? 'text-marca' : r.tipo === 'gasto' ? 'text-peligro' : ''}`}>
                  {signo} {formatear(r.monto_centavos, cuenta.get(r.cuenta_id)?.moneda)}
                </span>
                <div className="flex gap-3 text-sm">
                  <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => setEditando(r)}>Editar</button>
                  <button className="text-suave hover:text-tinta cursor-pointer" onClick={() => accion(() => pausarRecurrente(r.id, !r.activa))}>{r.activa ? 'Pausar' : 'Reanudar'}</button>
                  <button className="text-suave hover:text-peligro cursor-pointer"
                    onClick={() => confirm(`¿Borrar "${r.nombre}"? Los movimientos ya anotados se quedan.`) && accion(() => borrarRecurrente(r.id))}>Borrar</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal titulo={editando === 'nuevo' ? 'Nuevo pago recurrente' : 'Editar pago recurrente'} abierto={editando !== null} onCerrar={() => setEditando(null)}>
        {editando && (
          <FormRecurrente
            recurrente={editando === 'nuevo' ? null : editando}
            cuentas={cuentas}
            categorias={categorias}
            onListo={() => { setEditando(null); datos.recargar() }}
          />
        )}
      </Modal>
    </div>
  )
}

function FormRecurrente({ recurrente: r, cuentas, categorias, onListo }: {
  recurrente: Recurrente | null
  cuentas: Awaited<ReturnType<typeof listarCuentas>>
  categorias: Awaited<ReturnType<typeof listarCategorias>>
  onListo: () => void
}) {
  const [nombre, setNombre] = useState(r?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoMovimiento>(r?.tipo ?? 'gasto')
  const [monto, setMonto] = useState(r ? aTexto(r.monto_centavos) : '')
  const [cuenta, setCuenta] = useState(r?.cuenta_id ?? cuentas[0]?.id ?? '')
  const [destino, setDestino] = useState(r?.cuenta_destino_id ?? '')
  const [categoria, setCategoria] = useState(r?.categoria_id ?? '')
  const [frecuencia, setFrecuencia] = useState<FrecuenciaRecurrente>(r?.frecuencia ?? 'mensual')
  const [diaMes, setDiaMes] = useState(String(r?.dia_mes ?? 1))
  const [diaMes2, setDiaMes2] = useState(String(r?.dia_mes_2 ?? 30))
  const [diaSemana, setDiaSemana] = useState(String(r?.dia_semana ?? 1))
  const [mes, setMes] = useState(String(r?.mes ?? 1))
  const [desde, setDesde] = useState(r?.proxima_fecha ?? hoyISO())
  const [hasta, setHasta] = useState(r?.hasta ?? '')
  const [automatico, setAutomatico] = useState(r?.automatico ?? false)
  const [error, setError] = useState<string | null>(null)

  const programacion = {
    frecuencia,
    dia_mes: frecuencia === 'mensual' || frecuencia === 'quincenal' || frecuencia === 'anual' ? Number(diaMes) || 1 : null,
    dia_mes_2: frecuencia === 'quincenal' ? Number(diaMes2) || 30 : null,
    dia_semana: frecuencia === 'semanal' ? Number(diaSemana) : null,
    mes: frecuencia === 'anual' ? Number(mes) : null,
  }
  const primera = desde ? primeraFecha(programacion, desde) : null
  const soloDias = (v: string) => v.replace(/\D/g, '').slice(0, 2)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const c = aCentavos(monto)
    if (!c) return setError('Escribe el monto.')
    if (tipo === 'transferencia' && (!destino || destino === cuenta)) return setError('Elige otra cuenta de destino.')
    if (!primera) return setError('Elige desde cuándo.')
    try {
      await guardarRecurrente({
        nombre: nombre.trim(), tipo, monto_centavos: c, cuenta_id: cuenta, cuenta_destino_id: tipo === 'transferencia' ? destino : null,
        categoria_id: tipo === 'transferencia' ? null : categoria || null, ...programacion,
        proxima_fecha: primera, hasta: hasta || null, automatico,
      }, r?.id)
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Campo etiqueta="Nombre"><input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Ej.: Alquiler, Netflix, Cuota préstamo BHD" /></Campo>
      </div>
      <Campo etiqueta="Tipo">
        <select value={tipo} onChange={(e) => { setTipo(e.target.value as TipoMovimiento); setCategoria('') }} className={inputCls}>
          <option value="gasto">Gasto</option>
          <option value="ingreso">Ingreso</option>
          <option value="transferencia">Transferencia entre cuentas</option>
        </select>
      </Campo>
      <Campo etiqueta="Monto"><input inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} className={inputCls} placeholder="0.00" /></Campo>
      <Campo etiqueta={tipo === 'transferencia' ? 'Desde la cuenta' : 'Cuenta'}>
        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={inputCls}>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </Campo>
      {tipo === 'transferencia' ? (
        <Campo etiqueta="Hacia la cuenta">
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className={inputCls}>
            <option value="">Elegir…</option>
            {cuentas.filter((c) => c.id !== cuenta).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      ) : (
        <Campo etiqueta="Categoría">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls}>
            <option value="">Sin categoría</option>
            {categorias.filter((c) => c.tipo === tipo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      )}
      <Campo etiqueta="¿Cada cuánto?">
        <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaRecurrente)} className={inputCls}>
          {Object.entries(NOMBRES_FRECUENCIA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </Campo>
      {frecuencia === 'mensual' && (
        <Campo etiqueta="Día del mes"><input inputMode="numeric" value={diaMes} onChange={(e) => setDiaMes(soloDias(e.target.value))} className={inputCls} /></Campo>
      )}
      {frecuencia === 'quincenal' && (
        <Campo etiqueta="Días del mes">
          <div className="flex gap-2">
            <input aria-label="Primer día" inputMode="numeric" value={diaMes} onChange={(e) => setDiaMes(soloDias(e.target.value))} className={inputCls} />
            <input aria-label="Segundo día" inputMode="numeric" value={diaMes2} onChange={(e) => setDiaMes2(soloDias(e.target.value))} className={inputCls} />
          </div>
        </Campo>
      )}
      {frecuencia === 'semanal' && (
        <Campo etiqueta="Día de la semana">
          <select value={diaSemana} onChange={(e) => setDiaSemana(e.target.value)} className={inputCls}>
            {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </Campo>
      )}
      {frecuencia === 'anual' && (
        <Campo etiqueta="Fecha (día y mes)">
          <div className="flex gap-2">
            <input aria-label="Día" inputMode="numeric" value={diaMes} onChange={(e) => setDiaMes(soloDias(e.target.value))} className={`${inputCls} w-20`} />
            <select aria-label="Mes" value={mes} onChange={(e) => setMes(e.target.value)} className={inputCls}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </Campo>
      )}
      {frecuencia === 'diaria' && <div />}
      <Campo etiqueta="Empieza desde" ayuda={primera ? `Primera vez: ${fechaLarga(primera).toLowerCase()}` : undefined}>
        <input type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
      </Campo>
      <Campo etiqueta="Hasta (opcional)" ayuda="Por ejemplo, cuando termina el préstamo.">
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
      </Campo>
      <label className="sm:col-span-2 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={automatico} onChange={(e) => setAutomatico(e.target.checked)} className="w-4 h-4 mt-0.5" />
        <span>
          <b>Anotarlo solo en su fecha.</b> Si no lo marcas, aparecerá en Inicio como pendiente para que lo confirmes (útil si el monto cambia, como la luz).
        </span>
      </label>
      {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
      <div className="sm:col-span-2 flex justify-end"><button className={btnPrincipal}>Guardar</button></div>
    </form>
  )
}
