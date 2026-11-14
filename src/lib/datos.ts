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
}

export type NuevoMovimiento = Omit<Movimiento, 'id'>

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
    .select('id,tipo,monto_centavos,cuenta_id,cuenta_destino_id,monto_destino_centavos,categoria_id,fecha,nota')
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
