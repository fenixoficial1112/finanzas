import type { ReactNode } from 'react'

/** Muestra **negritas** como <strong>, sin usar HTML crudo. */
function enLinea(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith('**') && parte.endsWith('**') && parte.length > 4
      ? <strong key={i}>{parte.slice(2, -2)}</strong>
      : parte,
  )
}

/** Formato sencillo para las respuestas del asesor: párrafos, listas con guiones y negritas. */
export default function TextoIA({ texto }: { texto: string }) {
  const bloques: ReactNode[] = []
  let lista: string[] = []
  let numerada = false
  const cerrarLista = () => {
    if (!lista.length) return
    const items = lista.map((l, i) => <li key={i}>{enLinea(l)}</li>)
    bloques.push(numerada
      ? <ol key={bloques.length} className="list-decimal pl-5 space-y-1">{items}</ol>
      : <ul key={bloques.length} className="list-disc pl-5 space-y-1">{items}</ul>)
    lista = []
  }
  for (const linea of texto.split('\n')) {
    const vineta = linea.match(/^\s*[-•*]\s+(.*)/)
    const numero = linea.match(/^\s*\d+[.)]\s+(.*)/)
    if (vineta || numero) {
      const esNumero = Boolean(numero)
      if (lista.length && esNumero !== numerada) cerrarLista()
      numerada = esNumero
      lista.push((vineta ?? numero)![1])
    } else {
      cerrarLista()
      const limpio = linea.replace(/^#+\s*/, '').trim()
      if (limpio) bloques.push(<p key={bloques.length}>{enLinea(limpio)}</p>)
    }
  }
  cerrarLista()
  return <div className="space-y-2.5 leading-relaxed">{bloques}</div>
}
