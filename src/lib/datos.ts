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
  aporte_meta_id?: string | null
  inversion_id?: string | null
  origen?: string | null
}

export type NuevoMovimiento = Omit<Movimiento, 'id' | 'jornada_id' | 'carga_id' | 'mantenimiento_id' | 'pago_deuda_id' | 'aporte_meta_id' | 'inversion_id' | 'origen'>

export const NOMBRES_TIPO_CUENTA: Record<TipoCuenta, string> = {
  efectivo: 'Efectivo',
  banco: 'Banco',
  tarjeta: 'Tarjeta de crédito',
  ahorro: 'Ahorro',
  inversion: 'Inversión',
}

function revisar<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) {
    // Tabla inexistente: la base de datos del proyecto todavía no está preparada.
    if (/schema cache|does not exist/i.test(r.error.message)) {
      throw new Error('Tu base de datos todavía no está preparada. En Supabase abre SQL Editor, pega el archivo supabase/instalar_todo.sql del proyecto y dale a Run. Luego vuelve a abrir FENIX APP.')
    }
    throw new Error(r.error.message)
  }
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
    .select('id,tipo,monto_centavos,cuenta_id,cuenta_destino_id,monto_destino_centavos,categoria_id,fecha,nota,jornada_id,carga_id,mantenimiento_id,pago_deuda_id,aporte_meta_id,inversion_id,origen')
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
  prestamista: 'Prestamista / préstamo callejero',
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
  creado_en?: string
  frecuencia: FrecuenciaPago
  dia_pago_2: number | null
  dia_semana: number | null
  limite_credito_centavos: number | null
  dia_corte: number | null
  cuenta_tarjeta_id: string | null
}

export type FrecuenciaPago = 'mensual' | 'quincenal' | 'semanal' | 'diaria'
export const NOMBRES_FRECUENCIA: Record<FrecuenciaPago, string> = {
  mensual: 'Mensual',
  quincenal: 'Quincenal (2 veces al mes)',
  semanal: 'Semanal',
  diaria: 'Diaria',
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
    supabase.from('deudas').select('id,nombre,tipo,acreedor,saldo_inicial_centavos,tasa_anual,cuota_centavos,dia_pago,incluir_en_meta,pagada,creado_en,frecuencia,dia_pago_2,dia_semana,limite_credito_centavos,dia_corte,cuenta_tarjeta_id').order('creado_en'),
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
      frecuencia: d.frecuencia ?? 'mensual',
      limite_credito_centavos: d.limite_credito_centavos == null ? null : Number(d.limite_credito_centavos),
      saldo_centavos: Number(e.saldo_centavos ?? d.saldo_inicial_centavos),
      pagado_centavos: Number(e.pagado_centavos ?? 0),
      intereses_pagados_centavos: Number(e.intereses_pagados_centavos ?? 0),
      cargos_centavos: Number(e.cargos_centavos ?? 0),
      ultimo_pago: (e.ultimo_pago as string | null) ?? null,
    }
  })
}

export async function guardarDeuda(d: Omit<Deuda, 'id' | 'pagada' | 'creado_en'>, id?: string) {
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

// ---------- Metas ----------
export interface Meta {
  id: string
  nombre: string
  monto_objetivo_centavos: number
  moneda: Moneda
  fecha_objetivo: string
  cuenta_id: string | null
  incluir_en_meta: boolean
  estado: 'activa' | 'pausada' | 'lograda'
  creado_en: string
}

export interface MetaConAhorro extends Meta {
  ahorrado_centavos: number
  ultimo_aporte: string | null
}

export interface AporteMeta {
  id: string
  meta_id: string
  tipo: 'aporte' | 'retiro'
  fecha: string
  monto_centavos: number
  cuenta_id: string | null
  nota: string | null
}

export async function listarMetas(): Promise<MetaConAhorro[]> {
  const [ms, est] = await Promise.all([
    supabase.from('metas').select('id,nombre,monto_objetivo_centavos,moneda,fecha_objetivo,cuenta_id,incluir_en_meta,estado,creado_en').order('fecha_objetivo'),
    supabase.from('metas_estado').select('meta_id,ahorrado_centavos,ultimo_aporte'),
  ])
  const estados = new Map((revisar(est) as { meta_id: string; ahorrado_centavos: number; ultimo_aporte: string | null }[]).map((e) => [e.meta_id, e]))
  return (revisar(ms) as Meta[]).map((m) => ({
    ...m,
    monto_objetivo_centavos: Number(m.monto_objetivo_centavos),
    ahorrado_centavos: Number(estados.get(m.id)?.ahorrado_centavos ?? 0),
    ultimo_aporte: estados.get(m.id)?.ultimo_aporte ?? null,
  }))
}

export async function guardarMeta(m: Omit<Meta, 'id' | 'estado' | 'creado_en'>, id?: string) {
  if (id) revisar(await supabase.from('metas').update(m).eq('id', id))
  else revisar(await supabase.from('metas').insert(m))
}

export async function cambiarEstadoMeta(id: string, estado: Meta['estado']) {
  revisar(await supabase.from('metas').update({ estado }).eq('id', id))
}

export async function borrarMeta(id: string) {
  revisar(await supabase.from('metas').delete().eq('id', id))
}

export async function listarAportes(metaId: string): Promise<AporteMeta[]> {
  const filas = revisar(
    await supabase.from('aportes_meta').select('id,meta_id,tipo,fecha,monto_centavos,cuenta_id,nota')
      .eq('meta_id', metaId).order('fecha', { ascending: false }).order('creado_en', { ascending: false }),
  ) as AporteMeta[]
  return filas.map((a) => ({ ...a, monto_centavos: Number(a.monto_centavos) }))
}

export async function guardarAporte(a: Omit<AporteMeta, 'id'>) {
  revisar(await supabase.from('aportes_meta').insert(a))
}

export async function borrarAporte(id: string) {
  revisar(await supabase.from('aportes_meta').delete().eq('id', id))
}

// ---------- Inversiones ----------
export type TipoInversion = 'certificado' | 'ahorro' | 'fondo' | 'bonos' | 'cooperativa' | 'acciones' | 'otra'
export const NOMBRES_INVERSION: Record<TipoInversion, string> = {
  certificado: 'Certificado financiero',
  ahorro: 'Cuenta de ahorro',
  fondo: 'Fondo de inversión',
  bonos: 'Bonos',
  cooperativa: 'Cooperativa',
  acciones: 'Acciones / ETF',
  otra: 'Otra',
}

export interface Inversion {
  id: string
  nombre: string
  tipo: TipoInversion
  entidad: string | null
  moneda: Moneda
  cuenta_id: string
  tasa_anual: number | null
  fecha_inicio: string
  fecha_vencimiento: string | null
  estado: 'activa' | 'cerrada'
  nota: string | null
}

export interface InversionConValor extends Inversion {
  /** Valor actual (saldo de su cuenta). */
  valor_centavos: number
  /** Dinero puesto menos dinero retirado. */
  aportado_centavos: number
  /** Rendimientos cobrados (dentro o fuera de la inversión). */
  rendimientos_centavos: number
  /** Ganancia total = valor − aportado + rendimientos cobrados fuera. */
  ganancia_centavos: number
  movimientos: Movimiento[]
}

const COLUMNAS_MOV = 'id,tipo,monto_centavos,cuenta_id,cuenta_destino_id,monto_destino_centavos,categoria_id,fecha,nota,inversion_id,origen'

export async function listarInversiones(): Promise<InversionConValor[]> {
  const invs = (revisar(
    await supabase.from('inversiones')
      .select('id,nombre,tipo,entidad,moneda,cuenta_id,tasa_anual,fecha_inicio,fecha_vencimiento,estado,nota')
      .order('fecha_inicio'),
  ) as Inversion[]).map((i) => ({ ...i, tasa_anual: i.tasa_anual == null ? null : Number(i.tasa_anual) }))
  if (invs.length === 0) return []
  const ids = invs.map((i) => i.cuenta_id)
  const [cuentas, movs] = await Promise.all([
    listarCuentas(true),
    supabase.from('movimientos').select(COLUMNAS_MOV)
      .or(`cuenta_id.in.(${ids.join(',')}),cuenta_destino_id.in.(${ids.join(',')}),inversion_id.in.(${invs.map((i) => i.id).join(',')})`)
      .order('fecha', { ascending: false }),
  ])
  const lista = (revisar(movs) as Movimiento[]).map((m) => ({ ...m, monto_centavos: Number(m.monto_centavos) }))
  return invs.map((inv) => {
    const cuenta = cuentas.find((c) => c.id === inv.cuenta_id)
    const propios = lista.filter((m) => m.cuenta_id === inv.cuenta_id || m.cuenta_destino_id === inv.cuenta_id || m.inversion_id === inv.id)
    let aportado = cuenta?.saldo_inicial_centavos ?? 0
    let rendimientos = 0
    let rendimientosFuera = 0
    for (const m of propios) {
      if (m.tipo === 'transferencia' && m.cuenta_destino_id === inv.cuenta_id) aportado += m.monto_centavos
      else if (m.tipo === 'transferencia' && m.cuenta_id === inv.cuenta_id) aportado -= m.monto_centavos
      else if (m.origen === 'inversion_rendimiento') {
        rendimientos += m.monto_centavos
        if (m.cuenta_id !== inv.cuenta_id) rendimientosFuera += m.monto_centavos
      }
    }
    const valor = cuenta?.saldo_centavos ?? 0
    return {
      ...inv,
      valor_centavos: valor,
      aportado_centavos: aportado,
      rendimientos_centavos: rendimientos,
      ganancia_centavos: valor - aportado + rendimientosFuera,
      movimientos: propios,
    }
  })
}

export interface NuevaInversion {
  nombre: string
  tipo: TipoInversion
  entidad: string | null
  moneda: Moneda
  tasa_anual: number | null
  fecha_inicio: string
  fecha_vencimiento: string | null
  nota: string | null
  monto_centavos: number
  /** Cuenta de donde sale el dinero; null si ya estaba invertido antes de usar la app. */
  cuenta_origen_id: string | null
}

export async function crearInversion(p: NuevaInversion): Promise<string> {
  return revisar(await supabase.rpc('crear_inversion', { p })) as string
}

export async function actualizarInversion(id: string, cambios: Partial<Pick<Inversion, 'nombre' | 'entidad' | 'tasa_anual' | 'fecha_vencimiento' | 'nota'>>) {
  revisar(await supabase.from('inversiones').update(cambios).eq('id', id))
}

/** Cierra la inversión y archiva su cuenta (el historial se conserva). */
export async function cerrarInversion(inv: Inversion, cerrar = true) {
  revisar(await supabase.from('inversiones').update({ estado: cerrar ? 'cerrada' : 'activa' }).eq('id', inv.id))
  await archivarCuenta(inv.cuenta_id, cerrar)
}

async function categoriaId(nombre: string, tipo: 'ingreso' | 'gasto'): Promise<string> {
  const existente = revisar(
    await supabase.from('categorias').select('id').eq('tipo', tipo).eq('nombre', nombre).maybeSingle(),
  ) as { id: string } | null
  if (existente) return existente.id
  const nueva = revisar(await supabase.from('categorias').insert({ nombre, tipo }).select('id').single()) as { id: string }
  return nueva.id
}

export type OperacionInversion =
  | { tipo: 'depositar'; cuenta_id: string; monto_centavos: number; fecha: string; nota?: string | null }
  | { tipo: 'retirar'; cuenta_id: string; monto_centavos: number; fecha: string; nota?: string | null }
  | { tipo: 'rendimiento'; cuenta_id: string; monto_centavos: number; fecha: string; nota?: string | null }
  | { tipo: 'valor'; valor_centavos: number; fecha: string; nota?: string | null }

export async function operarInversion(inv: InversionConValor, op: OperacionInversion) {
  const base = { fecha: op.fecha, nota: op.nota || null }
  let fila: Record<string, unknown>
  if (op.tipo === 'depositar' || op.tipo === 'retirar') {
    const desde = op.tipo === 'depositar' ? op.cuenta_id : inv.cuenta_id
    const hacia = op.tipo === 'depositar' ? inv.cuenta_id : op.cuenta_id
    fila = {
      ...base, tipo: 'transferencia', monto_centavos: op.monto_centavos, cuenta_id: desde, cuenta_destino_id: hacia,
      nota: base.nota ?? `${op.tipo === 'depositar' ? 'Depósito a' : 'Retiro de'} ${inv.nombre}`,
    }
  } else if (op.tipo === 'rendimiento') {
    fila = {
      ...base, tipo: 'ingreso', monto_centavos: op.monto_centavos, cuenta_id: op.cuenta_id,
      categoria_id: await categoriaId('Rendimientos de inversiones', 'ingreso'),
      origen: 'inversion_rendimiento', inversion_id: inv.id, nota: base.nota ?? `Rendimiento ${inv.nombre}`,
    }
  } else {
    const diferencia = op.valor_centavos - inv.valor_centavos
    if (diferencia === 0) return
    const sube = diferencia > 0
    fila = {
      ...base, tipo: sube ? 'ingreso' : 'gasto', monto_centavos: Math.abs(diferencia), cuenta_id: inv.cuenta_id,
      categoria_id: await categoriaId(sube ? 'Rendimientos de inversiones' : 'Pérdida en inversiones', sube ? 'ingreso' : 'gasto'),
      origen: 'inversion_ajuste', inversion_id: inv.id, nota: base.nota ?? `Actualización de valor de ${inv.nombre}`,
    }
  }
  revisar(await supabase.from('movimientos').insert(fila))
}

/** Todos los pagos y cargos de deudas desde una fecha (para reportes). */
export async function listarPagosDeudaDesde(desde: string): Promise<PagoDeuda[]> {
  const filas = revisar(
    await supabase.from('pagos_deuda').select('id,deuda_id,tipo,fecha,monto_centavos,interes_centavos,cuenta_id,nota').gte('fecha', desde),
  ) as PagoDeuda[]
  return filas.map((p) => ({ ...p, monto_centavos: Number(p.monto_centavos), interes_centavos: Number(p.interes_centavos) }))
}

/** Crea la cuenta de una tarjeta de crédito (saldo negativo = lo que se debe) y devuelve su id. */
export async function crearCuentaTarjeta(nombre: string, debeCentavos: number): Promise<string> {
  const fila = revisar(
    await supabase.from('cuentas').insert({ nombre, tipo: 'tarjeta', moneda: 'DOP', saldo_inicial_centavos: -debeCentavos }).select('id').single(),
  ) as { id: string }
  return fila.id
}

/** Borra una cuenta (solo funciona si no tiene movimientos). */
export async function borrarCuenta(id: string) {
  revisar(await supabase.from('cuentas').delete().eq('id', id))
}
