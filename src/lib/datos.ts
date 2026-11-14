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
  carga_id?: string | null
  mantenimiento_id?: string | null
  pago_deuda_id?: string | null
}

export type NuevoMovimiento = Omit<Movimiento, 'id' | 'jornada_id' | 'carga_id' | 'mantenimiento_id' | 'pago_deuda_id'>

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
    .select('id,tipo,monto_centavos,cuenta_id,cuenta_destino_id,monto_destino_centavos,categoria_id,fecha,nota,jornada_id,carga_id,mantenimiento_id,pago_deuda_id')
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

// ---------- Vehículo ----------
export type TipoCombustible = 'gasolina_regular' | 'gasolina_premium' | 'gasoil' | 'glp' | 'electrico' | 'hibrido'
export const NOMBRES_COMBUSTIBLE: Record<TipoCombustible, string> = {
  gasolina_regular: 'Gasolina regular',
  gasolina_premium: 'Gasolina premium',
  gasoil: 'Gasoil',
  glp: 'GLP (gas)',
  electrico: 'Eléctrico',
  hibrido: 'Híbrido',
}

export interface Vehiculo {
  id: string
  marca: string
  modelo: string
  anio: number | null
  placa: string | null
  km_registro: number
  combustible: TipoCombustible
}

export interface CargaCombustible {
  id: string
  fecha: string
  galones: number
  total_centavos: number
  km: number | null
  tanque_lleno: boolean
  cuenta_id: string | null
  nota: string | null
}

export interface Mantenimiento {
  id: string
  tipo: string
  fecha: string
  km: number | null
  costo_centavos: number
  cuenta_id: string | null
  taller: string | null
  nota: string | null
}

export interface Recordatorio {
  id: string
  tipo: string
  cada_km: number | null
  cada_meses: number | null
  ultimo_km: number | null
  ultima_fecha: string | null
}

export type TipoDocumento = 'seguro' | 'marbete' | 'licencia' | 'matricula' | 'otro'
export const NOMBRES_DOCUMENTO: Record<TipoDocumento, string> = {
  seguro: 'Seguro',
  marbete: 'Marbete',
  licencia: 'Licencia de conducir',
  matricula: 'Matrícula',
  otro: 'Otro',
}

export interface Documento {
  id: string
  tipo: TipoDocumento
  nombre: string | null
  vence: string
  nota: string | null
}

export interface DatosVehiculo {
  vehiculo: Vehiculo
  kmActual: number
  cargas: CargaCombustible[]
  mantenimientos: Mantenimiento[]
  recordatorios: Recordatorio[]
  documentos: Documento[]
}

/** Carga el vehículo activo con todo su historial (null si aún no hay vehículo). */
export async function obtenerDatosVehiculo(): Promise<DatosVehiculo | null> {
  const vehiculo = revisar(
    await supabase.from('vehiculos').select('id,marca,modelo,anio,placa,km_registro,combustible')
      .eq('activo', true).order('creado_en').limit(1).maybeSingle(),
  ) as Vehiculo | null
  if (!vehiculo) return null
  const [km, cargas, mants, recs, docs] = await Promise.all([
    supabase.from('vehiculos_km').select('km_actual').eq('vehiculo_id', vehiculo.id).maybeSingle(),
    supabase.from('cargas_combustible').select('id,fecha,galones,total_centavos,km,tanque_lleno,cuenta_id,nota')
      .eq('vehiculo_id', vehiculo.id).order('fecha', { ascending: false }).order('creado_en', { ascending: false }),
    supabase.from('mantenimientos').select('id,tipo,fecha,km,costo_centavos,cuenta_id,taller,nota')
      .eq('vehiculo_id', vehiculo.id).order('fecha', { ascending: false }),
    supabase.from('recordatorios').select('id,tipo,cada_km,cada_meses,ultimo_km,ultima_fecha')
      .eq('vehiculo_id', vehiculo.id).order('cada_km', { ascending: true, nullsFirst: false }),
    supabase.from('documentos').select('id,tipo,nombre,vence,nota').order('vence'),
  ])
  return {
    vehiculo,
    kmActual: Number((revisar(km) as { km_actual: number } | null)?.km_actual ?? vehiculo.km_registro),
    cargas: (revisar(cargas) as CargaCombustible[]).map((c) => ({
      ...c, galones: Number(c.galones), total_centavos: Number(c.total_centavos),
    })),
    mantenimientos: (revisar(mants) as Mantenimiento[]).map((m) => ({ ...m, costo_centavos: Number(m.costo_centavos) })),
    recordatorios: revisar(recs) as Recordatorio[],
    documentos: revisar(docs) as Documento[],
  }
}

export async function guardarVehiculo(v: Omit<Vehiculo, 'id'> & { id?: string }) {
  const { id, ...resto } = v
  if (id) revisar(await supabase.from('vehiculos').update(resto).eq('id', id))
  else revisar(await supabase.from('vehiculos').insert(resto))
}

type SinId<T> = Omit<T, 'id'>

async function guardarEn<T extends object>(tabla: string, fila: T, id?: string) {
  if (id) revisar(await supabase.from(tabla).update(fila).eq('id', id))
  else revisar(await supabase.from(tabla).insert(fila))
}
async function borrarDe(tabla: string, id: string) {
  revisar(await supabase.from(tabla).delete().eq('id', id))
}

export const guardarCarga = (vehiculoId: string, c: SinId<CargaCombustible>, id?: string) =>
  guardarEn('cargas_combustible', id ? c : { ...c, vehiculo_id: vehiculoId }, id)
export const borrarCarga = (id: string) => borrarDe('cargas_combustible', id)

export const guardarMantenimiento = (vehiculoId: string, m: SinId<Mantenimiento>, id?: string) =>
  guardarEn('mantenimientos', id ? m : { ...m, vehiculo_id: vehiculoId }, id)
export const borrarMantenimiento = (id: string) => borrarDe('mantenimientos', id)

export const guardarRecordatorio = (vehiculoId: string, r: SinId<Recordatorio>, id?: string) =>
  guardarEn('recordatorios', id ? r : { ...r, vehiculo_id: vehiculoId }, id)
export const borrarRecordatorio = (id: string) => borrarDe('recordatorios', id)

export const guardarDocumento = (vehiculoId: string, d: SinId<Documento>, id?: string) =>
  guardarEn('documentos', id ? d : { ...d, vehiculo_id: d.tipo === 'licencia' ? null : vehiculoId }, id)
export const borrarDocumento = (id: string) => borrarDe('documentos', id)

// ---------- Meta diaria ----------
export type TipoObligacion = 'casa' | 'servicios' | 'comida' | 'deuda' | 'vehiculo' | 'familia' | 'ahorro' | 'otro'
export const NOMBRES_OBLIGACION: Record<TipoObligacion, string> = {
  casa: 'Casa / alquiler',
  servicios: 'Luz, agua, internet, teléfono',
  comida: 'Comida',
  deuda: 'Deuda / préstamo',
  vehiculo: 'Vehículo (cuota, seguro)',
  familia: 'Familia / hijos',
  ahorro: 'Ahorro',
  otro: 'Otro',
}

export interface Obligacion {
  id: string
  nombre: string
  tipo: TipoObligacion
  monto_centavos: number
  activa: boolean
}

export async function listarObligaciones(): Promise<Obligacion[]> {
  const filas = revisar(
    await supabase.from('obligaciones').select('id,nombre,tipo,monto_centavos,activa').order('creado_en'),
  ) as Obligacion[]
  return filas.map((o) => ({ ...o, monto_centavos: Number(o.monto_centavos) }))
}

export async function guardarObligacion(o: Omit<Obligacion, 'id' | 'activa'>, id?: string) {
  if (id) revisar(await supabase.from('obligaciones').update(o).eq('id', id))
  else revisar(await supabase.from('obligaciones').insert(o))
}

export async function borrarObligacion(id: string) {
  revisar(await supabase.from('obligaciones').delete().eq('id', id))
}

export interface PreferenciasMeta {
  dias_trabajo_semana: number
  margen_pct: number
}

export async function obtenerPreferenciasMeta(): Promise<PreferenciasMeta> {
  const p = revisar(
    await supabase.from('perfiles').select('dias_trabajo_semana,margen_pct').maybeSingle(),
  ) as PreferenciasMeta | null
  return p ?? { dias_trabajo_semana: 6, margen_pct: 10 }
}

export async function guardarPreferenciasMeta(p: PreferenciasMeta) {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Sesión no válida')
  revisar(await supabase.from('perfiles').update(p).eq('id', data.user.id))
}

// ---------- Deudas ----------
export type TipoDeuda = 'tarjeta' | 'prestamo_personal' | 'prestamo_vehiculo' | 'prestamista' | 'familiar' | 'tienda' | 'otro'
export const NOMBRES_DEUDA: Record<TipoDeuda, string> = {
  tarjeta: 'Tarjeta de crédito',
  prestamo_personal: 'Préstamo personal',
  prestamo_vehiculo: 'Préstamo del vehículo',
  prestamista: 'Prestamista',
  familiar: 'Familiar / amigo',
  tienda: 'Tienda / financiamiento',
  otro: 'Otro',
}

export interface Deuda {
  id: string
  nombre: string
  tipo: TipoDeuda
  acreedor: string | null
  saldo_inicial_centavos: number
  tasa_anual: number
  cuota_centavos: number
  dia_pago: number | null
  incluir_en_meta: boolean
  pagada: boolean
}

export interface DeudaConEstado extends Deuda {
  saldo_centavos: number
  pagado_centavos: number
  intereses_pagados_centavos: number
  cargos_centavos: number
  ultimo_pago: string | null
}

export interface PagoDeuda {
  id: string
  deuda_id: string
  tipo: 'pago' | 'cargo'
  fecha: string
  monto_centavos: number
  interes_centavos: number
  cuenta_id: string | null
  nota: string | null
}

export async function listarDeudas(): Promise<DeudaConEstado[]> {
  const [ds, est] = await Promise.all([
    supabase.from('deudas').select('id,nombre,tipo,acreedor,saldo_inicial_centavos,tasa_anual,cuota_centavos,dia_pago,incluir_en_meta,pagada').order('creado_en'),
    supabase.from('deudas_estado').select('*'),
  ])
  const estados = new Map((revisar(est) as Record<string, unknown>[]).map((e) => [e.deuda_id as string, e]))
  return (revisar(ds) as Deuda[]).map((d) => {
    const e = estados.get(d.id) ?? {}
    return {
      ...d,
      saldo_inicial_centavos: Number(d.saldo_inicial_centavos),
      tasa_anual: Number(d.tasa_anual),
      cuota_centavos: Number(d.cuota_centavos),
      saldo_centavos: Number(e.saldo_centavos ?? d.saldo_inicial_centavos),
      pagado_centavos: Number(e.pagado_centavos ?? 0),
      intereses_pagados_centavos: Number(e.intereses_pagados_centavos ?? 0),
      cargos_centavos: Number(e.cargos_centavos ?? 0),
      ultimo_pago: (e.ultimo_pago as string | null) ?? null,
    }
  })
}

export async function guardarDeuda(d: Omit<Deuda, 'id' | 'pagada'>, id?: string) {
  if (id) revisar(await supabase.from('deudas').update(d).eq('id', id))
  else revisar(await supabase.from('deudas').insert(d))
}

export async function marcarDeudaPagada(id: string, pagada: boolean) {
  revisar(await supabase.from('deudas').update({ pagada }).eq('id', id))
}

export async function borrarDeuda(id: string) {
  revisar(await supabase.from('deudas').delete().eq('id', id))
}

export async function listarPagosDeuda(deudaId: string): Promise<PagoDeuda[]> {
  const filas = revisar(
    await supabase.from('pagos_deuda').select('id,deuda_id,tipo,fecha,monto_centavos,interes_centavos,cuenta_id,nota')
      .eq('deuda_id', deudaId).order('fecha', { ascending: false }).order('creado_en', { ascending: false }),
  ) as PagoDeuda[]
  return filas.map((p) => ({ ...p, monto_centavos: Number(p.monto_centavos), interes_centavos: Number(p.interes_centavos) }))
}

export async function guardarPagoDeuda(p: Omit<PagoDeuda, 'id'>) {
  revisar(await supabase.from('pagos_deuda').insert(p))
}

export async function borrarPagoDeuda(id: string) {
  revisar(await supabase.from('pagos_deuda').delete().eq('id', id))
}

export interface PlanDeudas {
  estrategia_deudas: 'avalancha' | 'bola_nieve'
  pago_extra_deudas_centavos: number
}

export async function obtenerPlanDeudas(): Promise<PlanDeudas> {
  const p = revisar(
    await supabase.from('perfiles').select('estrategia_deudas,pago_extra_deudas_centavos').maybeSingle(),
  ) as PlanDeudas | null
  return p
    ? { ...p, pago_extra_deudas_centavos: Number(p.pago_extra_deudas_centavos) }
    : { estrategia_deudas: 'avalancha', pago_extra_deudas_centavos: 0 }
}

export async function guardarPlanDeudas(p: PlanDeudas) {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Sesión no válida')
  revisar(await supabase.from('perfiles').update(p).eq('id', data.user.id))
}

// ---------- Asesor IA ----------
export interface Conversacion {
  id: string
  titulo: string
  creado_en: string
}

export interface MensajeIA {
  id: string
  rol: 'user' | 'assistant'
  contenido: string
  creado_en: string
}

export async function listarConversaciones(): Promise<Conversacion[]> {
  return revisar(
    await supabase.from('conversaciones_ia').select('id,titulo,creado_en').order('creado_en', { ascending: false }).limit(50),
  ) as Conversacion[]
}

export async function listarMensajesIA(conversacionId: string): Promise<MensajeIA[]> {
  return revisar(
    await supabase.from('mensajes_ia').select('id,rol,contenido,creado_en')
      .eq('conversacion_id', conversacionId).order('creado_en'),
  ) as MensajeIA[]
}

export async function borrarConversacion(id: string) {
  revisar(await supabase.from('conversaciones_ia').delete().eq('id', id))
}

/** Envía la pregunta a la función segura "asesor" de Supabase, que llama a Claude. */
export async function preguntarAsesor(conversacionId: string | null, mensaje: string, contexto: unknown) {
  const { data, error } = await supabase.functions.invoke('asesor', {
    body: { conversacion_id: conversacionId, mensaje, contexto },
  })
  if (error) {
    // Si la función respondió con un error propio, mostramos su mensaje.
    const respuesta = (error as { context?: Response }).context
    if (respuesta && typeof respuesta.json === 'function') {
      const cuerpo = await respuesta.json().catch(() => null)
      if (cuerpo?.error) throw new Error(cuerpo.error)
    }
    throw new Error('No se pudo contactar al asesor. Revisa que la función "asesor" esté publicada en Supabase.')
  }
  return data as { conversacion_id: string; respuesta: string }
}

// ---------- Presupuesto ----------
export interface Presupuesto {
  id: string
  mes: string
  categoria_id: string
  limite_centavos: number
}

export async function listarPresupuestos(mes: string): Promise<Presupuesto[]> {
  const filas = revisar(
    await supabase.from('presupuestos').select('id,mes,categoria_id,limite_centavos').eq('mes', mes),
  ) as Presupuesto[]
  return filas.map((p) => ({ ...p, limite_centavos: Number(p.limite_centavos) }))
}

/** Crea o actualiza los límites de un mes (una fila por categoría). */
export async function guardarLimites(mes: string, limites: { categoria_id: string; limite_centavos: number }[]) {
  if (!limites.length) return
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Sesión no válida')
  revisar(
    await supabase.from('presupuestos').upsert(
      limites.map((l) => ({ ...l, mes, usuario_id: data.user!.id })),
      { onConflict: 'usuario_id,mes,categoria_id' },
    ),
  )
}

export async function borrarPresupuesto(id: string) {
  revisar(await supabase.from('presupuestos').delete().eq('id', id))
}

export async function obtenerUmbralAlerta(): Promise<number> {
  const p = revisar(await supabase.from('perfiles').select('umbral_alerta_pct').maybeSingle()) as { umbral_alerta_pct: number } | null
  return p?.umbral_alerta_pct ?? 80
}

export async function guardarUmbralAlerta(pct: number) {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Sesión no válida')
  revisar(await supabase.from('perfiles').update({ umbral_alerta_pct: pct }).eq('id', data.user.id))
}
