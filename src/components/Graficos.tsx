// Gráficos en SVG propio, siguiendo las reglas de visualización: marcas finas, una sola escala,
// leyenda para 2+ series, detalle al pasar el mouse (o al enfocar con teclado) y vista de tabla.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { COLORES, compacto } from '../lib/graficos'

export interface Serie {
  nombre: string
  color: string
  valores: number[]
}

/** Ancho disponible del contenedor (se actualiza al cambiar el tamaño de la ventana). */
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return { ref, ancho }
}

/** Divisiones "redondas" para un eje. */
function ticks(min: number, max: number, cantidad = 4): number[] {
  if (min === max) max = min + 1
  const paso0 = (max - min) / cantidad
  const mag = Math.pow(10, Math.floor(Math.log10(paso0)))
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= paso0) ?? 10 * mag
  const inicio = Math.floor(min / paso) * paso
  const fin = Math.ceil(max / paso) * paso
  const res: number[] = []
  for (let v = inicio; v <= fin + paso / 2; v += paso) res.push(Math.round(v * 1000) / 1000)
  return res
}

function Tooltip({ x, y, ancho, children }: { x: number; y: number; ancho: number; children: ReactNode }) {
  const izquierda = x > ancho - 200
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-lg"
      style={{ left: izquierda ? undefined : x + 12, right: izquierda ? ancho - x + 12 : undefined, top: Math.max(0, y - 8) }}
    >
      {children}
    </div>
  )
}

function FilaTooltip({ color, nombre, valor }: { color: string; nombre: string; valor: string }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="inline-block w-3 h-0.5 rounded" style={{ background: color }} aria-hidden="true" />
      <b className="font-semibold text-[#0b0b0b]">{valor}</b>
      <span className="text-[#52514e]">{nombre}</span>
    </div>
  )
}

export function Leyenda({ series, forma = 'rect' }: { series: { nombre: string; color: string }[]; forma?: 'rect' | 'linea' }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#52514e]">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={forma === 'rect' ? 'w-3 h-3 rounded-sm' : 'w-4 h-0.5 rounded'} style={{ background: s.color }} />
          {s.nombre}
        </li>
      ))}
    </ul>
  )
}

/** Tarjeta de gráfico con título, leyenda opcional y botón "Ver tabla". */
export function TarjetaGrafico({ titulo, subtitulo, leyenda, tabla, children }: {
  titulo: string
  subtitulo?: string
  leyenda?: ReactNode
  tabla: { columnas: string[]; filas: (string | number)[][] }
  children: ReactNode
}) {
  const [verTabla, setVerTabla] = useState(false)
  return (
    <section className="bg-white border border-borde rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{titulo}</h2>
          {subtitulo && <p className="text-sm text-suave">{subtitulo}</p>}
        </div>
        <button className="text-sm font-semibold text-marca cursor-pointer" onClick={() => setVerTabla((v) => !v)} aria-pressed={verTabla}>
          {verTabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>
      {!verTabla && leyenda}
      {verTabla ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-suave">
              <tr>{tabla.columnas.map((c, i) => <th key={c} className={`py-2 font-medium ${i ? 'text-right' : ''}`}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {tabla.filas.map((f, i) => (
                <tr key={i} className="border-t border-borde">
                  {f.map((v, j) => <td key={j} className={`py-2 ${j ? 'text-right' : ''}`}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : children}
    </section>
  )
}

const MARGEN = { arriba: 12, derecha: 12, abajo: 28, izquierda: 64 }

/** Columnas agrupadas (una o varias series) sobre un mismo eje. */
export function GraficoColumnas({ categorias, series, alto = 260, formato, prefijoEje = 'RD$', titulo }: {
  categorias: string[]
  series: Serie[]
  alto?: number
  formato: (v: number) => string
  prefijoEje?: string
  titulo: string
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>()
  const [activo, setActivo] = useState<number | null>(null)
  const todos = series.flatMap((s) => s.valores)
  const escala = ticks(Math.min(0, ...todos), Math.max(1, ...todos))
  const yMin = escala[0], yMax = escala[escala.length - 1]
  const w = ancho - MARGEN.izquierda - MARGEN.derecha
  const h = alto - MARGEN.arriba - MARGEN.abajo
  const y = (v: number) => MARGEN.arriba + h - ((v - yMin) / (yMax - yMin)) * h
  const banda = w / Math.max(1, categorias.length)
  const grosor = Math.min(24, Math.max(4, (banda * 0.7 - 2 * (series.length - 1)) / series.length))
  const grupo = grosor * series.length + 2 * (series.length - 1)
  const cada = Math.ceil(categorias.length / Math.max(1, Math.floor(w / 56)))

  return (
    <div ref={ref} className="relative">
      <svg width={ancho} height={alto} role="img" aria-label={titulo}>
        {escala.map((t) => (
          <g key={t}>
            <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y(t)} y2={y(t)} stroke={t === 0 ? COLORES.base : COLORES.rejilla} strokeWidth={1} />
            <text x={MARGEN.izquierda - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={COLORES.apagado} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {compacto(t, prefijoEje)}
            </text>
          </g>
        ))}
        {categorias.map((c, i) => {
          const x0 = MARGEN.izquierda + i * banda + (banda - grupo) / 2
          return (
            <g key={c} opacity={activo == null || activo === i ? 1 : 0.55}>
              {series.map((s, j) => {
                const v = s.valores[i] ?? 0
                if (!v) return null
                const x = x0 + j * (grosor + 2)
                const yt = y(Math.max(v, 0)), yb = y(Math.min(v, 0))
                const r = Math.min(4, (yb - yt) / 2, grosor / 2)
                // Extremo de datos redondeado; la base queda recta.
                const d = v >= 0
                  ? `M${x},${yb} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + grosor - r} Q${x + grosor},${yt} ${x + grosor},${yt + r} V${yb} Z`
                  : `M${x},${yt} V${yb - r} Q${x},${yb} ${x + r},${yb} H${x + grosor - r} Q${x + grosor},${yb} ${x + grosor},${yb - r} V${yt} Z`
                return <path key={s.nombre} d={d} fill={s.color} />
              })}
              {i % cada === 0 && (
                <text x={MARGEN.izquierda + i * banda + banda / 2} y={alto - 8} textAnchor="middle" fontSize={11} fill={COLORES.apagado}>{c}</text>
              )}
              <rect
                x={MARGEN.izquierda + i * banda} y={MARGEN.arriba} width={banda} height={h} fill="transparent" tabIndex={0}
                aria-label={`${c}: ${series.map((s) => `${s.nombre} ${formato(s.valores[i] ?? 0)}`).join(', ')}`}
                onPointerEnter={() => setActivo(i)} onPointerLeave={() => setActivo(null)}
                onFocus={() => setActivo(i)} onBlur={() => setActivo(null)}
                className="outline-none focus-visible:stroke-[#2a78d6]"
              />
            </g>
          )
        })}
      </svg>
      {activo != null && (
        <Tooltip x={MARGEN.izquierda + activo * banda + banda / 2} y={MARGEN.arriba} ancho={ancho}>
          <p className="text-xs text-[#52514e] mb-1">{categorias[activo]}</p>
          {series.map((s) => <FilaTooltip key={s.nombre} color={s.color} nombre={s.nombre} valor={formato(s.valores[activo] ?? 0)} />)}
        </Tooltip>
      )}
    </div>
  )
}

/** Línea de una serie con área suave, punto final con su valor y cruz que sigue al mouse. */
export function GraficoLinea({ categorias, valores, color, alto = 240, formato, titulo }: {
  categorias: string[]
  valores: number[]
  color: string
  alto?: number
  formato: (v: number) => string
  titulo: string
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>()
  const [activo, setActivo] = useState<number | null>(null)
  const escala = ticks(Math.min(0, ...valores), Math.max(0, ...valores))
  const yMin = escala[0], yMax = escala[escala.length - 1]
  const margenDer = 84
  const w = ancho - MARGEN.izquierda - margenDer
  const h = alto - MARGEN.arriba - MARGEN.abajo
  const n = valores.length
  const x = (i: number) => MARGEN.izquierda + (n === 1 ? w / 2 : (i / (n - 1)) * w)
  const y = (v: number) => MARGEN.arriba + h - ((v - yMin) / (yMax - yMin)) * h
  const linea = valores.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const area = `${linea} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`
  const cada = Math.ceil(n / Math.max(1, Math.floor(w / 56)))

  const mover = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left
    const i = n === 1 ? 0 : Math.round(((px - MARGEN.izquierda) / w) * (n - 1))
    setActivo(Math.min(n - 1, Math.max(0, i)))
  }

  return (
    <div ref={ref} className="relative">
      <svg
        width={ancho} height={alto} role="img" aria-label={titulo} tabIndex={0}
        onPointerMove={(e) => mover(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActivo(null)}
        onFocus={() => setActivo(n - 1)} onBlur={() => setActivo(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setActivo((a) => Math.max(0, (a ?? n - 1) - 1))
          if (e.key === 'ArrowRight') setActivo((a) => Math.min(n - 1, (a ?? 0) + 1))
        }}
        className="outline-none"
      >
        {escala.map((t) => (
          <g key={t}>
            <line x1={MARGEN.izquierda} x2={ancho - margenDer} y1={y(t)} y2={y(t)} stroke={t === 0 ? COLORES.base : COLORES.rejilla} strokeWidth={1} />
            <text x={MARGEN.izquierda - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={COLORES.apagado} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {compacto(t)}
            </text>
          </g>
        ))}
        {categorias.map((c, i) => i % cada === 0 && (
          <text key={c} x={x(i)} y={alto - 8} textAnchor="middle" fontSize={11} fill={COLORES.apagado}>{c}</text>
        ))}
        <path d={area} fill={color} opacity={0.1} />
        <path d={linea} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {activo != null && <line x1={x(activo)} x2={x(activo)} y1={MARGEN.arriba} y2={MARGEN.arriba + h} stroke={COLORES.base} strokeWidth={1} />}
        {activo != null && <circle cx={x(activo)} cy={y(valores[activo])} r={4} fill={color} stroke={COLORES.superficie} strokeWidth={2} />}
        <circle cx={x(n - 1)} cy={y(valores[n - 1])} r={4} fill={color} stroke={COLORES.superficie} strokeWidth={2} />
        <text x={x(n - 1) + 8} y={y(valores[n - 1])} dy="0.32em" fontSize={12} fontWeight={600} fill={COLORES.tinta}>
          {compacto(valores[n - 1])}
        </text>
      </svg>
      {activo != null && (
        <Tooltip x={x(activo)} y={y(valores[activo]) - 40} ancho={ancho}>
          <p className="text-xs text-[#52514e] mb-1">{categorias[activo]}</p>
          <FilaTooltip color={color} nombre={titulo} valor={formato(valores[activo])} />
        </Tooltip>
      )}
    </div>
  )
}

/** Barras horizontales ordenadas, con el valor en la punta. */
export function GraficoBarras({ items, color, formato, titulo }: {
  items: { etiqueta: string; valor: number; detalle?: string }[]
  color: string
  formato: (v: number) => string
  titulo: string
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>()
  const [activo, setActivo] = useState<number | null>(null)
  const fila = 34
  const etiquetaAncho = Math.min(160, Math.max(90, ancho * 0.28))
  const valorAncho = 96
  const w = Math.max(40, ancho - etiquetaAncho - valorAncho)
  const max = Math.max(1, ...items.map((i) => i.valor))
  const alto = items.length * fila + 4
  return (
    <div ref={ref} className="relative">
      <svg width={ancho} height={alto} role="img" aria-label={titulo}>
        {items.map((it, i) => {
          const largo = Math.max(2, (it.valor / max) * w)
          const yb = i * fila + (fila - 18) / 2
          const r = Math.min(4, largo / 2)
          const x0 = etiquetaAncho
          const d = `M${x0},${yb} H${x0 + largo - r} Q${x0 + largo},${yb} ${x0 + largo},${yb + r} V${yb + 18 - r} Q${x0 + largo},${yb + 18} ${x0 + largo - r},${yb + 18} H${x0} Z`
          return (
            <g key={it.etiqueta} opacity={activo == null || activo === i ? 1 : 0.55}>
              <text x={etiquetaAncho - 10} y={yb + 9} dy="0.32em" textAnchor="end" fontSize={12} fill={COLORES.tinta2}>
                {it.etiqueta.length > 22 ? `${it.etiqueta.slice(0, 21)}…` : it.etiqueta}
              </text>
              <path d={d} fill={color} />
              <text x={x0 + largo + 8} y={yb + 9} dy="0.32em" fontSize={12} fontWeight={600} fill={COLORES.tinta} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formato(it.valor)}
              </text>
              <rect
                x={0} y={i * fila} width={ancho} height={fila} fill="transparent" tabIndex={0}
                aria-label={`${it.etiqueta}: ${formato(it.valor)}${it.detalle ? `, ${it.detalle}` : ''}`}
                onPointerEnter={() => setActivo(i)} onPointerLeave={() => setActivo(null)}
                onFocus={() => setActivo(i)} onBlur={() => setActivo(null)}
                className="outline-none"
              />
            </g>
          )
        })}
      </svg>
      {activo != null && items[activo].detalle && (
        <Tooltip x={etiquetaAncho + (items[activo].valor / max) * w} y={activo * fila - 30} ancho={ancho}>
          <p className="text-xs text-[#52514e] mb-1">{items[activo].etiqueta}</p>
          <FilaTooltip color={color} nombre={items[activo].detalle!} valor={formato(items[activo].valor)} />
        </Tooltip>
      )}
    </div>
  )
}
