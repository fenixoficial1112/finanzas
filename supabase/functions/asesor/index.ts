// FENIX APP · Función "asesor": recibe la pregunta y el resumen de datos del usuario,
// llama a Claude y guarda la conversación. La clave de Anthropic vive solo aquí, como
// secreto de Supabase (ANTHROPIC_API_KEY); nunca llega al navegador.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import { INSTRUCCIONES, LIMITE_CONTEXTO, LIMITE_MENSAJE, MENSAJES_HISTORIAL, tituloDesde } from './prompt.ts'

const MODELO = 'claude-opus-5-5'
const LIMITE_DIARIO = Number(Deno.env.get('ASESOR_LIMITE_DIARIO') ?? '30')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return responder({ error: 'El asesor no está configurado: falta el secreto ANTHROPIC_API_KEY en Supabase.' }, 500)
  }

  // Cliente de Supabase "como el usuario": la seguridad por filas (RLS) se aplica a todo lo que haga.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return responder({ error: 'Sesión no válida. Vuelve a iniciar sesión.' }, 401)

  let cuerpo: { conversacion_id?: string; mensaje?: string; contexto?: unknown }
  try {
    cuerpo = await req.json()
  } catch {
    return responder({ error: 'Solicitud no válida' }, 400)
  }
  const mensaje = (cuerpo.mensaje ?? '').trim()
  if (!mensaje) return responder({ error: 'Escribe tu pregunta.' }, 400)
  if (mensaje.length > LIMITE_MENSAJE) return responder({ error: 'La pregunta es demasiado larga.' }, 400)
  const contexto = JSON.stringify(cuerpo.contexto ?? {})
  if (contexto.length > LIMITE_CONTEXTO) return responder({ error: 'Demasiados datos para enviar al asesor.' }, 400)

  // Límite diario de preguntas por usuario (protege tu saldo de Anthropic).
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: errCuenta } = await supabase
    .from('mensajes_ia').select('id', { count: 'exact', head: true })
    .eq('rol', 'user').gte('creado_en', desde)
  if (errCuenta) return responder({ error: errCuenta.message }, 500)
  if ((count ?? 0) >= LIMITE_DIARIO) {
    return responder({ error: `Llegaste al límite de ${LIMITE_DIARIO} preguntas en 24 horas. Vuelve a intentarlo más tarde.` }, 429)
  }

  // Conversación: la existente o una nueva.
  let conversacionId = cuerpo.conversacion_id ?? null
  if (!conversacionId) {
    const { data, error } = await supabase.from('conversaciones_ia').insert({ titulo: tituloDesde(mensaje) }).select('id').single()
    if (error) return responder({ error: error.message }, 500)
    conversacionId = data.id as string
  }
  const { data: anteriores, error: errHist } = await supabase
    .from('mensajes_ia').select('rol,contenido')
    .eq('conversacion_id', conversacionId)
    .order('creado_en', { ascending: false }).limit(MENSAJES_HISTORIAL)
  if (errHist) return responder({ error: errHist.message }, 500)

  const historial: Anthropic.Beta.BetaMessageParam[] = (anteriores ?? [])
    .reverse()
    .map((m) => ({ role: m.rol as 'user' | 'assistant', content: m.contenido as string }))
  // La conversación debe empezar con un mensaje del usuario.
  while (historial.length && historial[0].role !== 'user') historial.shift()

  let respuesta: string
  let tokens: { entrada: number; salida: number }
  try {
    const stream = anthropic.beta.messages.stream({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // Si los filtros de seguridad rechazan la consulta, la API la reintenta sola con otro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      system: [
        { type: 'text', text: INSTRUCCIONES },
        { type: 'text', text: `<datos_del_usuario>\n${contexto}\n</datos_del_usuario>` },
      ],
      messages: [...historial, { role: 'user', content: mensaje }],
    })
    const final = await stream.finalMessage()
    tokens = {
      entrada: (final.usage.input_tokens ?? 0) + (final.usage.cache_read_input_tokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0),
      salida: final.usage.output_tokens ?? 0,
    }
    if (final.stop_reason === 'refusal') {
      respuesta = 'No puedo ayudarte con esa pregunta. Prueba a preguntarme de otra forma sobre tus finanzas, tus deudas o tu trabajo como conductor.'
    } else {
      respuesta = final.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      if (final.stop_reason === 'max_tokens') respuesta += '\n\n(La respuesta quedó cortada. Pídeme que continúe.)'
      if (!respuesta) respuesta = 'No pude generar una respuesta. Intenta de nuevo.'
    }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return responder({ error: 'La clave de Anthropic no es válida. Revísala en los secretos de Supabase.' }, 500)
    }
    if (error instanceof Anthropic.RateLimitError) {
      return responder({ error: 'El asesor está muy ocupado. Espera un minuto y vuelve a intentarlo.' }, 503)
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Error de Anthropic', error.status, error.message)
      return responder({ error: 'El asesor no está disponible en este momento. Intenta más tarde.' }, 502)
    }
    console.error('Error inesperado', error)
    return responder({ error: 'Ocurrió un error inesperado.' }, 500)
  }

  // Horas explícitas para que la pregunta siempre quede antes que la respuesta.
  const ahora = Date.now()
  const { error: errGuardar } = await supabase.from('mensajes_ia').insert([
    { conversacion_id: conversacionId, rol: 'user', contenido: mensaje, creado_en: new Date(ahora).toISOString() },
    {
      conversacion_id: conversacionId, rol: 'assistant', contenido: respuesta, creado_en: new Date(ahora + 1).toISOString(),
      tokens_entrada: tokens.entrada, tokens_salida: tokens.salida,
    },
  ])
  if (errGuardar) console.error('No se pudo guardar la conversación', errGuardar.message)

  return responder({ conversacion_id: conversacionId, respuesta })
})
