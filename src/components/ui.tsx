import { useEffect, useRef, type ReactNode } from 'react'

export const inputCls =
  'h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-[15px] outline-none focus:border-marca focus:ring-2 focus:ring-marca/20'
export const btnPrincipal =
  'h-11 px-4 rounded-lg bg-marca text-white font-semibold hover:bg-marca-oscuro disabled:opacity-60 cursor-pointer'
export const btnSecundario =
  'h-11 px-4 rounded-lg border border-gray-300 bg-white font-semibold hover:bg-gray-50 cursor-pointer'
export const tarjeta = 'bg-white border border-borde rounded-2xl'

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-sm font-semibold">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-xs text-suave">{ayuda}</span>}
    </label>
  )
}

export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'ok'; children: ReactNode }) {
  return tipo === 'error' ? (
    <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-peligro">{children}</p>
  ) : (
    <p role="status" className="rounded-lg bg-marca-claro px-3 py-2 text-sm text-marca-oscuro">{children}</p>
  )
}

export function Modal({ titulo, abierto, onCerrar, children }: {
  titulo: string
  abierto: boolean
  onCerrar: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (abierto && !d.open) d.showModal()
    if (!abierto && d.open) d.close()
  }, [abierto])

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-2xl p-0 backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-borde px-6 py-4">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <button onClick={onCerrar} aria-label="Cerrar" className="w-9 h-9 rounded-lg hover:bg-gray-100 text-xl cursor-pointer">×</button>
      </div>
      <div className="p-6">{abierto && children}</div>
    </dialog>
  )
}

export function Encabezado({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">{titulo}</h1>
        {subtitulo && <p className="text-sm text-suave mt-1">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  )
}
