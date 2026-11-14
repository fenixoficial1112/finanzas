// Capa de acceso a datos: las pantallas nunca llaman a Supabase directamente.
import type { Moneda } from './dinero'
import { supabase } from './supabase'

export type TipoCuenta = 'efectivo' | 'banco' | 'tarjeta' | 'ahorro' | 'inversion'
export type TipoMovimiento = 'ingreso' | 'gasto' | 'transferencia'

export interface Cuenta {
  id: string
  nombre: string
  tipo: TipoCuenta
  moneda: Moneda
  saldo_inicial_centavos: number
  archivada: boolean
}

export interface CuentaConSaldo extends Cuenta {
  saldo_centavos: number
}

export interface Categoria {
  id: string
  nombre: string
  tipo: 'ingreso' | 'gasto'
}

export interface Movimiento {
  id: string
  tipo: TipoMovimiento
  monto_centavos: number
  cuenta_id: string
  cuenta_destino_id: string | null
  monto_destino_centavos: number | null
  categoria_id: string | null
  fecha: string
  nota: string | null
  jornada_id?: string | null
}

export type NuevoMovimiento = Omit<Movimiento, 'id' | 'jornada_id'>

export const NOMBRES_TIPO_CUENTA: Record<TipoCuenta, string> = {
  efectivo: 'Efectivo',
  banco: 'Banco',
  tarjeta: 'Tarjeta de crédito',
  ahorro: 'Ahorro',
  inversion: 'Inversión',
}

function revisar<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

// ---------- Cuentas ----------
export async function listarCuentas(incluirArchivadas = false): Promise<CuentaConSaldo[]> {
  let q = supabase.from('cuentas').select('id,nombre,tipo,moneda,saldo_inicial_centavos,archivada').order('creado_en')
  if (!incluirArchivadas) q = q.eq('archivada', false)
  const cuentas = revisar(await q) as Cuenta[]
  const saldos = revisar(await supabase.from('saldos_cuentas').select('cuenta_id,saldo_centavos')) as {
    cuenta_id: string
    saldo_centavos: number
  }[]
  const mapa = new Map(saldos.map((s) => [s.cuenta_id, Number(s.saldo_centavos)]))
  return cuentas.map((c) => ({
    ...c,
    saldo_inicial_centavos: Number(c.saldo_inicial_centavos),
    saldo_centavos: mapa.get(c.id) ?? Number(c.saldo_inicial_centavos),
  }))
}

export async function guardarCuenta(c: Omit<Cuenta, 'id' | 'archivada'> & { id?: string }) {
  if (c.id) {
    const { id, ...resto } = c
    revisar(await supabase.from('cuentas').update(resto).eq('id', id))
  } else {
    revisar(await supabase.from('cuentas').insert(c))
  }
}

export async function archivarCuenta(id: string, archivada: boolean) {
  revisar(await supabase.from('cuentas').update({ archivada }).eq('id', id))
}

// ---------- Categorías ----------
export async function listarCategorias(): Promise<Categoria[]> {
  return revisar(await supabase.from('categorias').select('id,nombre,tipo').order('nombre')) as Categoria[]
}

export async function crearCategoria(nombre: string, tipo: Categoria['tipo']) {
  revisar(await supabase.from('categorias').insert({ nombre: nombre.trim(), tipo }))
}

export async function borrarCategoria(id: string) {
  revisar(await supabase.from('categorias').delete().eq('id', id))
}

// ---------- Movimientos ----------
export interface FiltroMovimientos {
  desde: string
  hasta: string
  cuentaId?: string
  tipo?: TipoMovimiento
}

export async function listarMovimientos(f: FiltroMovimientos): Promise<Movimiento[]> {
  let q = supabase
    .from('movimientos')
    .select('id,tipo,monto_centavos,cuenta_id,cuenta_destino_id,monto_destino_centavos,categoria_id,fecha,nota,jornada_id')
    .gte('fecha', f.desde)
    .lte('fecha', f.hasta)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
  if (f.cuentaId) q = q.or(`cuenta_id.eq.${f.cuentaId},cuenta_destino_id.eq.${f.cuentaId}`)
  if (f.tipo) q = q.eq('tipo', f.tipo)
  const filas = revisar(await q) as Movimiento[]
  return filas.map((m) => ({
    ...m,
    monto_centavos: Number(m.monto_centavos),
    monto_destino_centavos: m.monto_destino_centavos == null ? null : Number(m.monto_destino_centavos),
  }))
}

export async function guardarMovimiento(m: NuevoMovimiento, id?: string) {
  if (id) revisar(await supabase.from('movimientos').update(m).eq('id', id))
  else revisar(await supabase.from('movimientos').insert(m))
}

export async function borrarMovimiento(id: string) {
  revisar(await supabase.from('movimientos').delete().eq('id', id))
}

// ---------- Tasa del dólar ----------
export async function obtenerTasaUSD(): Promise<number | null> {
  const fila = revisar(
    await supabase.from('tasas_cambio').select('pesos_por_unidad').eq('moneda', 'USD').maybeSingle(),
  ) as { pesos_por_unidad: number } | null
  return fila ? Number(fila.pesos_por_unidad) : null
}

export async function guardarTasaUSD(pesos: number) {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Sesión no válida')
  revisar(
    await supabase.from('tasas_cambio').upsert({
      usuario_id: data.user.id,
      moneda: 'USD',
      pesos_por_unidad: pesos,
      actualizada_en: new Date().toISOString(),
    }),
  )
}

// ---------- Plataformas (InDrive, Uber, …) ----------
export interface Plataforma {
  id: string
  nombre: string
  comision_pct: number
  activa: boolean
}

export async function listarPlataformas(): Promise<Plataforma[]> {
  const filas = revisar(
    await supabase.from('plataformas').select('id,nombre,comision_pct,activa').order('nombre'),
  ) as Plataforma[]
  return filas.map((p) => ({ ...p, comision_pct: Number(p.comision_pct) }))
}

export async function actualizarPlataforma(id: string, cambios: Partial<Pick<Plataforma, 'comision_pct' | 'activa'>>) {
  revisar(await supabase.from('plataformas').update(cambios).eq('id', id))
}

export async function crearPlataforma(nombre: string, comision_pct: number) {
  const limpio = nombre.trim()
  let cat = revisar(
    await supabase.from('categorias').select('id').eq('tipo', 'ingreso').eq('nombre', limpio).maybeSingle(),
  ) as { id: string } | null
  if (!cat) {
    cat = revisar(
      await supabase.from('categorias').insert({ nombre: limpio, tipo: 'ingreso' }).select('id').single(),
    ) as { id: string }
  }
  revisar(await supabase.from('plataformas').insert({ nombre: limpio, comision_pct, categoria_id: cat.id }))
}

// ---------- Jornadas ----------
export interface JornadaResumen {
  id: string
  fecha: string
  minutos: number
  km_inicial: number | null
  km_final: number | null
  km: number | null
  nota: string | null
  viajes: number
  bruto_centavos: number
  comision_centavos: number
  gastos_centavos: number
  neto_centavos: number
}

export interface JornadaPlataforma {
  plataforma_id: string
  viajes: number
  efectivo_centavos: number
  app_centavos: number
  comision_centavos: number
}

export interface GastoJornada {
  categoria_id: string | null
  monto_centavos: number
  cuenta_id: string
  nota: string | null
}

export interface Jornada {
  id?: string
  fecha: string
  minutos: number
  km_inicial: number | null
  km_final: number | null
  cuenta_efectivo_id: string
  cuenta_app_id: string | null
  nota: string | null
  plataformas: JornadaPlataforma[]
  gastos: GastoJornada[]
}

const num = (v: unknown) => (v == null ? null : Number(v))

export async function listarJornadas(desde: string, hasta: string): Promise<JornadaResumen[]> {
  const filas = revisar(
    await supabase.from('jornadas_resumen').select('*').gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false }),
  ) as JornadaResumen[]
  return filas.map((j) => ({
    ...j,
    km: num(j.km), km_inicial: num(j.km_inicial), km_final: num(j.km_final),
    bruto_centavos: Number(j.bruto_centavos), comision_centavos: Number(j.comision_centavos),
    gastos_centavos: Number(j.gastos_centavos), neto_centavos: Number(j.neto_centavos),
  }))
}

/** Totales por plataforma en un rango de fechas (para comparar InDrive vs Uber). */
export async function totalesPorPlataforma(desde: string, hasta: string) {
  const filas = revisar(
    await supabase
      .from('jornada_plataformas')
      .select('plataforma_id,viajes,efectivo_centavos,app_centavos,comision_centavos,jornadas!inner(fecha)')
      .gte('jornadas.fecha', desde)
      .lte('jornadas.fecha', hasta),
  ) as JornadaPlataforma[]
  const mapa = new Map<string, { viajes: number; bruto: number; comision: number; dias: number }>()
  for (const f of filas) {
    const t = mapa.get(f.plataforma_id) ?? { viajes: 0, bruto: 0, comision: 0, dias: 0 }
    t.viajes += Number(f.viajes)
    t.bruto += Number(f.efectivo_centavos) + Number(f.app_centavos)
    t.comision += Number(f.comision_centavos)
    t.dias += 1
    mapa.set(f.plataforma_id, t)
  }
  return mapa
}

export async function obtenerJornada(id: string): Promise<Jornada> {
  const j = revisar(
    await supabase
      .from('jornadas')
      .select('id,fecha,minutos,km_inicial,km_final,cuenta_efectivo_id,cuenta_app_id,nota,jornada_plataformas(plataforma_id,viajes,efectivo_centavos,app_centavos,comision_centavos)')
      .eq('id', id)
      .single(),
  ) as Omit<Jornada, 'plataformas' | 'gastos'> & { jornada_plataformas: JornadaPlataforma[] }
  const gastos = revisar(
    await supabase.from('movimientos').select('categoria_id,monto_centavos,cuenta_id,nota')
      .eq('jornada_id', id).eq('origen', 'jornada_gasto'),
  ) as GastoJornada[]
  const { jornada_plataformas, ...resto } = j
  return {
    ...resto,
    plataformas: jornada_plataformas.map((p) => ({
      ...p,
      efectivo_centavos: Number(p.efectivo_centavos),
      app_centavos: Number(p.app_centavos),
      comision_centavos: Number(p.comision_centavos),
    })),
    gastos: gastos.map((g) => ({ ...g, monto_centavos: Number(g.monto_centavos) })),
  }
}

export async function guardarJornada(j: Jornada): Promise<string> {
  return revisar(await supabase.rpc('guardar_jornada', { p: j })) as string
}

export async function borrarJornada(id: string) {
  revisar(await supabase.from('jornadas').delete().eq('id', id))
}

/** Datos para prellenar una jornada nueva: último km final y cuentas usadas la última vez. */
export async function ultimaJornada() {
  return revisar(
    await supabase.from('jornadas').select('km_final,cuenta_efectivo_id,cuenta_app_id')
      .order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(1).maybeSingle(),
  ) as { km_final: number | null; cuenta_efectivo_id: string | null; cuenta_app_id: string | null } | null
}
