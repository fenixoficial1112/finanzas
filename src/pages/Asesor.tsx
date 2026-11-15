import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import TextoIA from '../components/TextoIA'
import { Aviso, btnPrincipal, tarjeta } from '../components/ui'
import {
  borrarConversacion, listarConversaciones, listarMensajesIA, preguntarAsesor, type MensajeIA,
} from '../lib/datos'
import { construirContexto } from '../lib/contextoIA'
import { useDatos } from '../lib/useDatos'
import { escritorio } from '../lib/escritorio'
import { Link } from 'react-router-dom'

const SUGERENCIAS = [
  '¿Cuánto necesito hacer hoy en InDrive para cumplir con todo?',
  '¿Cómo salgo más rápido de mis deudas?',
  '¿Me conviene más trabajar con InDrive o con Uber?',
  '¿Qué días y cuántas horas me conviene trabajar?',
  'Hazme un resumen de mi semana y qué mejorar',
  '¿En qué gastos puedo recortar este mes?',
  'Tengo un dinero extra, ¿pago deudas o ahorro en dólares?',
]

export default function Asesor() {
  const conversaciones = useDatos(listarConversaciones, [])
  const estadoClave = useDatos(async () => (escritorio ? escritorio.asesor.estado() : null), [])
  const [actual, setActual] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<MensajeIA[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensajes, pensando])

  async function abrir(id: string | null) {
    setActual(id)
    setError(null)
    setMensajes(id ? await listarMensajesIA(id).catch((e) => { setError(e.message); return [] }) : [])
  }

  async function enviar(pregunta: string) {
    const limpia = pregunta.trim()
    if (!limpia || pensando) return
    setError(null)
    setTexto('')
    setPensando(true)
    const temporal: MensajeIA = { id: `tmp-${Date.now()}`, rol: 'user', contenido: limpia, creado_en: new Date().toISOString() }
    setMensajes((m) => [...m, temporal])
    try {
      const contexto = await construirContexto()
      const r = await preguntarAsesor(actual, limpia, contexto)
      setMensajes((m) => [...m, { id: `r-${Date.now()}`, rol: 'assistant', contenido: r.respuesta, creado_en: new Date().toISOString() }])
      if (r.conversacion_id !== actual) {
        setActual(r.conversacion_id)
        conversaciones.recargar()
      }
    } catch (e) {
      setMensajes((m) => m.filter((x) => x.id !== temporal.id))
      setTexto(limpia)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPensando(false)
    }
  }

  const alEnviar = (e: FormEvent) => {
    e.preventDefault()
    enviar(texto)
  }
  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar(texto)
    }
  }

  return (
    <div className="max-w-6xl grid gap-6 lg:grid-cols-[240px_1fr] h-[calc(100vh-64px)] min-h-[560px]">
      <aside className="hidden lg:flex flex-col gap-2 min-h-0">
        <button className={btnPrincipal} onClick={() => abrir(null)}>+ Nueva conversación</button>
        <h2 className="text-xs font-semibold text-suave uppercase tracking-wide mt-3 px-1">Anteriores</h2>
        <ul className="flex-1 overflow-y-auto space-y-1">
          {(conversaciones.datos ?? []).map((c) => (
            <li key={c.id} className="group flex items-center">
              <button
                onClick={() => abrir(c.id)}
                className={`flex-1 text-left text-sm px-3 py-2 rounded-lg truncate cursor-pointer ${c.id === actual ? 'bg-white border border-borde font-semibold' : 'hover:bg-white/70'}`}
                title={c.titulo}
              >
                {c.titulo}
              </button>
              <button
                aria-label={`Borrar conversación ${c.titulo}`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 px-2 text-suave hover:text-peligro cursor-pointer"
                onClick={async () => {
                  if (!confirm('¿Borrar esta conversación?')) return
                  await borrarConversacion(c.id)
                  if (c.id === actual) abrir(null)
                  conversaciones.recargar()
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={`${tarjeta} flex flex-col min-h-0`}>
        <header className="flex items-center gap-3 border-b border-borde px-5 py-4">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-ia-claro text-ia" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
            </svg>
          </span>
          <div className="flex-1">
            <h1 className="font-bold text-lg">Asesor financiero</h1>
            <p className="text-xs text-suave">Conoce tus jornadas, deudas, gastos y metas. Orientación general, no asesoría profesional.</p>
          </div>
          <button className="lg:hidden text-sm font-semibold text-marca cursor-pointer" onClick={() => abrir(null)}>Nueva</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" aria-live="polite">
          {mensajes.length === 0 && !pensando && (
            <div className="max-w-2xl mx-auto text-center space-y-5 py-6">
              <p className="text-lg font-semibold">¿En qué te ayudo hoy?</p>
              <p className="text-sm text-suave">Usaré los datos que tienes en FENIX APP para darte consejos concretos.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGERENCIAS.map((s) => (
                  <button key={s} onClick={() => enviar(s)} className="text-sm rounded-full border border-gray-300 bg-white px-4 py-2 hover:border-marca hover:bg-marca-claro/40 cursor-pointer">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mensajes.map((m) => (
            <div key={m.id} className={`flex ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] ${m.rol === 'user' ? 'bg-marca text-white rounded-br-md whitespace-pre-wrap' : 'bg-gray-50 border border-borde rounded-bl-md'}`}>
                {m.rol === 'user' ? m.contenido : <TextoIA texto={m.contenido} />}
              </div>
            </div>
          ))}
          {pensando && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-gray-50 border border-borde px-4 py-3 text-sm text-suave flex items-center gap-2">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                </span>
                Revisando tus números…
              </div>
            </div>
          )}
          <div ref={finRef} />
        </div>

        <form onSubmit={alEnviar} className="border-t border-borde p-4 space-y-2">
          {!escritorio && <Aviso>El asesor IA funciona en el programa de Windows de FENIX APP.</Aviso>}
          {escritorio && estadoClave.datos && !estadoClave.datos.tieneClave && (
            <Aviso>Para usar el asesor, pon tu clave de Anthropic en <Link to="/ajustes" className="underline font-semibold">Ajustes → Asesor IA</Link>.</Aviso>
          )}
          {error && <Aviso>{error}</Aviso>}
          <div className="flex gap-2 items-end">
            <label htmlFor="pregunta" className="sr-only">Escribe tu pregunta</label>
            <textarea
              id="pregunta"
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={alTeclear}
              maxLength={4000}
              placeholder="Pregúntale algo a tu asesor… (Enter para enviar, Shift+Enter para otra línea)"
              className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-[15px] outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
            />
            <button type="submit" disabled={pensando || !texto.trim()} className={`${btnPrincipal} h-12`}>Enviar</button>
          </div>
        </form>
      </section>
    </div>
  )
}
