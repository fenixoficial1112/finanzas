import { useState, type FormEvent } from 'react'
import { Aviso, Campo, Encabezado, btnPrincipal, inputCls, tarjeta } from '../components/ui'
import {
  actualizarPlataforma, borrarCategoria, crearCategoria, crearPlataforma, guardarTasaUSD, listarCategorias, listarPlataformas,
  obtenerTasaUSD, type Categoria, type Plataforma,
} from '../lib/datos'
import { useDatos } from '../lib/useDatos'
import { infoConexion, olvidarConfigSupabase } from '../lib/supabase'

export default function Ajustes() {
  return (
    <div className="max-w-5xl space-y-6">
      <Encabezado titulo="Ajustes" />
      <TasaDolar />
      <Plataformas />
      <Categorias />
      <Conexion />
    </div>
  )
}

function TasaDolar() {
  const tasa = useDatos(obtenerTasaUSD, [])
  const [valor, setValor] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const mostrado = valor ?? (tasa.datos ? String(tasa.datos) : '')

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const n = Number(mostrado.replace(',', '.'))
    if (!(n > 0 && n < 1000)) return setMsg({ tipo: 'error', texto: 'Escribe una tasa válida, por ejemplo 63.50' })
    try {
      await guardarTasaUSD(n)
      setMsg({ tipo: 'ok', texto: 'Tasa guardada.' })
      tasa.recargar()
      setValor(null)
    } catch (err) {
      setMsg({ tipo: 'error', texto: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <section className={`${tarjeta} p-6 space-y-4`}>
      <div>
        <h2 className="text-lg font-semibold">Tasa del dólar</h2>
        <p className="text-sm text-suave">Se usa para sumar tus cuentas en US$ al total en pesos. Usa la tasa de tu banco o la del Banco Central.</p>
      </div>
      <form onSubmit={guardar} className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Campo etiqueta="RD$ por cada US$1">
            <input inputMode="decimal" value={mostrado} onChange={(e) => setValor(e.target.value)} className={inputCls} placeholder="Ej.: 63.50" />
          </Campo>
        </div>
        <button className={btnPrincipal}>Guardar tasa</button>
      </form>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
    </section>
  )
}

function Categorias() {
  const cats = useDatos(listarCategorias, [])
  const [error, setError] = useState<string | null>(null)

  async function borrar(c: Categoria) {
    if (!confirm(`¿Borrar la categoría "${c.nombre}"? Los movimientos que la usan quedarán sin categoría.`)) return
    try {
      await borrarCategoria(c.id)
      cats.recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className={`${tarjeta} p-6 space-y-4`}>
      <h2 className="text-lg font-semibold">Categorías</h2>
      {(error || cats.error) && <Aviso>{error ?? cats.error}</Aviso>}
      <div className="grid gap-6 md:grid-cols-2">
        {(['ingreso', 'gasto'] as const).map((tipo) => (
          <ListaCategorias
            key={tipo}
            tipo={tipo}
            categorias={(cats.datos ?? []).filter((c) => c.tipo === tipo)}
            onBorrar={borrar}
            onCrear={async (nombre) => {
              try {
                await crearCategoria(nombre, tipo)
                setError(null)
                cats.recargar()
              } catch (e) {
                const m = e instanceof Error ? e.message : String(e)
                setError(m.includes('duplicate') ? 'Ya existe una categoría con ese nombre.' : m)
              }
            }}
          />
        ))}
      </div>
    </section>
  )
}

function ListaCategorias({ tipo, categorias, onBorrar, onCrear }: {
  tipo: 'ingreso' | 'gasto'
  categorias: Categoria[]
  onBorrar: (c: Categoria) => void
  onCrear: (nombre: string) => Promise<void>
}) {
  const [nueva, setNueva] = useState('')
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{tipo === 'ingreso' ? 'De ingreso' : 'De gasto'}</h3>
      <ul className="divide-y divide-borde border border-borde rounded-xl">
        {categorias.map((c) => (
          <li key={c.id} className="flex justify-between items-center px-3 py-2 text-sm">
            {c.nombre}
            <button onClick={() => onBorrar(c)} className="text-suave hover:text-peligro cursor-pointer">Borrar</button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!nueva.trim()) return
          await onCrear(nueva)
          setNueva('')
        }}
      >
        <input aria-label={`Nueva categoría de ${tipo}`} value={nueva} onChange={(e) => setNueva(e.target.value)} className={inputCls} placeholder="Nueva categoría" />
        <button className={btnPrincipal}>Agregar</button>
      </form>
    </div>
  )
}

function Plataformas() {
  const plats = useDatos(listarPlataformas, [])
  const [error, setError] = useState<string | null>(null)
  const [nueva, setNueva] = useState('')

  async function hacer(accion: () => Promise<void>) {
    try {
      await accion()
      setError(null)
      plats.recargar()
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setError(m.includes('duplicate') ? 'Ya existe una app con ese nombre.' : m)
    }
  }

  return (
    <section className={`${tarjeta} p-6 space-y-4`}>
      <div>
        <h2 className="text-lg font-semibold">Apps de transporte</h2>
        <p className="text-sm text-suave">
          El % de comisión se usa para sugerir la comisión al registrar una jornada. Pon el que te cobra cada app; siempre puedes corregirlo en cada jornada.
        </p>
      </div>
      {(error || plats.error) && <Aviso>{error ?? plats.error}</Aviso>}
      <ul className="divide-y divide-borde border border-borde rounded-xl">
        {(plats.datos ?? []).map((p) => (
          <FilaPlataforma key={p.id} p={p} onGuardar={(c) => hacer(() => actualizarPlataforma(p.id, c))} />
        ))}
      </ul>
      <form
        className="flex gap-2 max-w-md"
        onSubmit={(e) => {
          e.preventDefault()
          if (nueva.trim()) hacer(async () => { await crearPlataforma(nueva, 0); setNueva('') })
        }}
      >
        <input aria-label="Nueva app" value={nueva} onChange={(e) => setNueva(e.target.value)} className={inputCls} placeholder="Otra app (ej.: Yango)" />
        <button className={btnPrincipal}>Agregar</button>
      </form>
    </section>
  )
}

function FilaPlataforma({ p, onGuardar }: { p: Plataforma; onGuardar: (c: Partial<Plataforma>) => void }) {
  const [pct, setPct] = useState(String(p.comision_pct))
  const cambiado = Number(pct) !== p.comision_pct
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className={`font-semibold flex-1 min-w-32 ${p.activa ? '' : 'text-suave line-through'}`}>{p.nombre}</span>
      <label className="flex items-center gap-2 text-sm">
        Comisión
        <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className={`${inputCls} w-24`} aria-label={`Comisión de ${p.nombre} en %`} />
        %
      </label>
      {cambiado && (
        <button
          className="text-sm font-semibold text-marca cursor-pointer"
          onClick={() => {
            const n = Number(pct.replace(',', '.'))
            if (n >= 0 && n < 100) onGuardar({ comision_pct: n })
          }}
        >
          Guardar
        </button>
      )}
      <button className="text-sm text-suave hover:text-tinta cursor-pointer" onClick={() => onGuardar({ activa: !p.activa })}>
        {p.activa ? 'Ocultar' : 'Mostrar'}
      </button>
    </li>
  )
}

function Conexion() {
  const { url, cambiable } = infoConexion()
  return (
    <section className={`${tarjeta} p-6 space-y-3`}>
      <h2 className="text-lg font-semibold">Conexión con la nube</h2>
      <p className="text-sm text-suave">Tus datos se guardan en tu proyecto de Supabase: <b className="text-tinta break-all">{url}</b></p>
      {cambiable && (
        <button
          className="text-sm font-semibold text-peligro cursor-pointer"
          onClick={() => {
            if (confirm('¿Conectar la app a otro proyecto de Supabase? Se cerrará tu sesión; tus datos siguen guardados en el proyecto actual.')) olvidarConfigSupabase()
          }}
        >
          Cambiar de proyecto
        </button>
      )}
    </section>
  )
}
