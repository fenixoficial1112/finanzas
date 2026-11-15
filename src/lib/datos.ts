// Capa de acceso a datos: las pantallas nunca tocan la base de datos directamente.
// Todo se guarda en la base de datos local (SQLite en el disco duro).
import { consultar, ejecutar, nuevoId, transaccion, uno } from './bd'
import type { Moneda } from './dinero'
import { escritorio } from './escritorio'

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

// ---------- Ayudas para escribir ----------
type Fila = Record<string, string | number | boolean | null | undefined>

/** INSERT con las columnas del objeto. Devuelve el id (generado si no viene). */
async function insertar(tabla: string, fila: Fila): Promise<string> {
  const id = (fila.id as string | undefined) ?? nuevoId()
  const datos = { ...fila, id }
  const cols = Object.keys(datos)
  await ejecutar(`INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(datos))
  return id
}

/** UPDATE de las columnas del objeto en la fila con ese id. */
async function actualizar(tabla: string, id: string, cambios: Fila) {
  const cols = Object.keys(cambios).filter((c) => cambios[c] !== undefined)
  if (!cols.length) return
  await ejecutar(`UPDATE ${tabla} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => cambios[c]), id])
}

const borrar = (tabla: string, id: string) => ejecutar(`DELETE FROM ${tabla} WHERE id = ?`, [id])

// ---------- Cuentas ----------
export async function listarCuentas(incluirArchivadas = false): Promise<CuentaConSaldo[]> {
  return consultar<CuentaConSaldo>(
    `SELECT c.id, c.nombre, c.tipo, c.moneda, c.saldo_inicial_centavos, c.archivada, s.saldo_centavos
     FROM cuentas c JOIN saldos_cuentas s ON s.cuenta_id = c.id
     ${incluirArchivadas ? '' : 'WHERE c.archivada = 0'}
     ORDER BY c.creado_en`,
  )
}

export async function guardarCuenta(c: Omit<Cuenta, 'id' | 'archivada'> & { id?: string }) {
  const { id, ...resto } = c
  if (id) await actualizar('cuentas', id, resto)
  else await insertar('cuentas', resto)
}

export async function archivarCuenta(id: string, archivada: boolean) {
  await actualizar('cuentas', id, { archivada })
}

/** Borra una cuenta (solo funciona si no tiene movimientos). */
export async function borrarCuenta(id: string) {
  await borrar('cuentas', id)
}

/** Crea la cuenta de una tarjeta de crédito (saldo negativo = lo que se debe) y devuelve su id. */
export async function crearCuentaTarjeta(nombre: string, debeCentavos: number): Promise<string> {
  return insertar('cuentas', { nombre, tipo: 'tarjeta', moneda: 'DOP', saldo_inicial_centavos: -debeCentavos })
}

// ---------- Categorías ----------
export async function listarCategorias(): Promise<Categoria[]> {
  return consultar<Categoria>('SELECT id, nombre, tipo FROM categorias ORDER BY nombre')
}

export async function crearCategoria(nombre: string, tipo: Categoria['tipo']) {
  await insertar('categorias', { nombre: nombre.trim(), tipo })
}

export async function borrarCategoria(id: string) {
  await borrar('categorias', id)
}

async function categoriaId(nombre: string, tipo: 'ingreso' | 'gasto'): Promise<string> {
  const existente = uno<{ id: string }>('SELECT id FROM categorias WHERE tipo = ? AND nombre = ?', [tipo, nombre])
  return existente ? existente.id : insertar('categorias', { nombre, tipo })
}

// ---------- Movimientos ----------
export interface FiltroMovimientos {
  desde: string
  hasta: string
  cuentaId?: string
  tipo?: TipoMovimiento
}

const COLUMNAS_MOV = `id, tipo, monto_centavos, cuenta_id, cuenta_destino_id, monto_destino_centavos, categoria_id, fecha, nota,
  jornada_id, carga_id, mantenimiento_id, pago_deuda_id, aporte_meta_id, inversion_id, origen`

export async function listarMovimientos(f: FiltroMovimientos): Promise<Movimiento[]> {
  const cond = ['fecha >= ?', 'fecha <= ?']
  const params: (string | null)[] = [f.desde, f.hasta]
  if (f.cuentaId) {
    cond.push('(cuenta_id = ? OR cuenta_destino_id = ?)')
    params.push(f.cuentaId, f.cuentaId)
  }
  if (f.tipo) {
    cond.push('tipo = ?')
    params.push(f.tipo)
  }
  return consultar<Movimiento>(
    `SELECT ${COLUMNAS_MOV} FROM movimientos WHERE ${cond.join(' AND ')} ORDER BY fecha DESC, creado_en DESC`,
    params,
  )
}

export async function guardarMovimiento(m: NuevoMovimiento, id?: string) {
  if (id) await actualizar('movimientos', id, { ...m })
  else await insertar('movimientos', { ...m })
}

export async function borrarMovimiento(id: string) {
  await borrar('movimientos', id)
}

// ---------- Tasa del dólar ----------
export async function obtenerTasaUSD(): Promise<number | null> {
  return uno<{ p: number }>("SELECT pesos_por_unidad AS p FROM tasas_cambio WHERE moneda = 'USD'")?.p ?? null
}

export async function guardarTasaUSD(pesos: number) {
  await ejecutar(
    `INSERT INTO tasas_cambio (moneda, pesos_por_unidad, actualizada_en) VALUES ('USD', ?, ?)
     ON CONFLICT (moneda) DO UPDATE SET pesos_por_unidad = excluded.pesos_por_unidad, actualizada_en = excluded.actualizada_en`,
    [pesos, new Date().toISOString()],
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
  return consultar<Plataforma>('SELECT id, nombre, comision_pct, activa FROM plataformas ORDER BY nombre')
}

export async function actualizarPlataforma(id: string, cambios: Partial<Pick<Plataforma, 'comision_pct' | 'activa'>>) {
  await actualizar('plataformas', id, cambios)
}

export async function crearPlataforma(nombre: string, comision_pct: number) {
  const limpio = nombre.trim()
  await transaccion(async () => {
    const cat = await categoriaId(limpio, 'ingreso')
    await insertar('plataformas', { nombre: limpio, comision_pct, categoria_id: cat })
  })
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

export async function listarJornadas(desde: string, hasta: string): Promise<JornadaResumen[]> {
  return consultar<JornadaResumen>(
    `SELECT r.* FROM jornadas_resumen r JOIN jornadas j ON j.id = r.id
     WHERE r.fecha >= ? AND r.fecha <= ? ORDER BY r.fecha DESC, j.creado_en DESC`,
    [desde, hasta],
  )
}

/** Totales por plataforma en un rango de fechas (para comparar InDrive vs Uber). */
export async function totalesPorPlataforma(desde: string, hasta: string) {
  const filas = consultar<JornadaPlataforma>(
    `SELECT jp.plataforma_id, jp.viajes, jp.efectivo_centavos, jp.app_centavos, jp.comision_centavos
     FROM jornada_plataformas jp JOIN jornadas j ON j.id = jp.jornada_id
     WHERE j.fecha >= ? AND j.fecha <= ?`,
    [desde, hasta],
  )
  const mapa = new Map<string, { viajes: number; bruto: number; comision: number; dias: number }>()
  for (const f of filas) {
    const t = mapa.get(f.plataforma_id) ?? { viajes: 0, bruto: 0, comision: 0, dias: 0 }
    t.viajes += f.viajes
    t.bruto += f.efectivo_centavos + f.app_centavos
    t.comision += f.comision_centavos
    t.dias += 1
    mapa.set(f.plataforma_id, t)
  }
  return mapa
}

export async function obtenerJornada(id: string): Promise<Jornada> {
  const j = uno<Omit<Jornada, 'plataformas' | 'gastos'>>(
    'SELECT id, fecha, minutos, km_inicial, km_final, cuenta_efectivo_id, cuenta_app_id, nota FROM jornadas WHERE id = ?',
    [id],
  )
  if (!j) throw new Error('Jornada no encontrada')
  return {
    ...j,
    plataformas: consultar<JornadaPlataforma>(
      'SELECT plataforma_id, viajes, efectivo_centavos, app_centavos, comision_centavos FROM jornada_plataformas WHERE jornada_id = ?',
      [id],
    ),
    gastos: consultar<GastoJornada>(
      "SELECT categoria_id, monto_centavos, cuenta_id, nota FROM movimientos WHERE jornada_id = ? AND origen = 'jornada_gasto'",
      [id],
    ),
  }
}

/**
 * Guarda una jornada completa (crear o editar) y regenera sus movimientos: ingresos en efectivo y por
 * app, comisiones y gastos del día. Todo o nada.
 */
export async function guardarJornada(j: Jornada): Promise<string> {
  if (!j.cuenta_efectivo_id) throw new Error('Elige la cuenta donde guardas el efectivo')
  const cuentas = [j.cuenta_efectivo_id, j.cuenta_app_id].filter(Boolean) as string[]
  for (const c of cuentas) {
    const cuenta = uno<{ moneda: string }>('SELECT moneda FROM cuentas WHERE id = ?', [c])
    if (!cuenta) throw new Error('Cuenta no válida')
    if (cuenta.moneda !== 'DOP') throw new Error('Las cuentas de la jornada deben ser en pesos (RD$)')
  }
  if (j.plataformas.some((p) => p.app_centavos > 0) && !j.cuenta_app_id) throw new Error('Elige la cuenta donde la app te deposita')

  return transaccion(async () => {
    const datos = {
      fecha: j.fecha, minutos: j.minutos, km_inicial: j.km_inicial, km_final: j.km_final,
      cuenta_efectivo_id: j.cuenta_efectivo_id, cuenta_app_id: j.cuenta_app_id, nota: j.nota?.trim() || null,
    }
    let id = j.id
    if (id) {
      await actualizar('jornadas', id, datos)
      await ejecutar('DELETE FROM jornada_plataformas WHERE jornada_id = ?', [id])
      await ejecutar('DELETE FROM movimientos WHERE jornada_id = ?', [id])
    } else {
      id = await insertar('jornadas', datos)
    }
    const catComision = await categoriaId('Comisiones apps', 'gasto')
    for (const p of j.plataformas) {
      const plat = uno<{ nombre: string; categoria_id: string | null }>('SELECT nombre, categoria_id FROM plataformas WHERE id = ?', [p.plataforma_id])
      if (!plat) throw new Error('Plataforma no válida')
      await insertar('jornada_plataformas', { jornada_id: id, ...p })
      const mov = (tipo: string, monto: number, cuenta: string, categoria: string | null, nota: string, origen: string) =>
        insertar('movimientos', { tipo, monto_centavos: monto, cuenta_id: cuenta, categoria_id: categoria, fecha: j.fecha, nota, jornada_id: id, origen })
      if (p.efectivo_centavos > 0) await mov('ingreso', p.efectivo_centavos, j.cuenta_efectivo_id, plat.categoria_id, `${plat.nombre} · efectivo`, 'jornada_ingreso')
      if (p.app_centavos > 0) await mov('ingreso', p.app_centavos, j.cuenta_app_id!, plat.categoria_id, `${plat.nombre} · pagado por la app`, 'jornada_ingreso')
      if (p.comision_centavos > 0) await mov('gasto', p.comision_centavos, j.cuenta_efectivo_id, catComision, `Comisión ${plat.nombre}`, 'jornada_comision')
    }
    for (const g of j.gastos) {
      await insertar('movimientos', {
        tipo: 'gasto', monto_centavos: g.monto_centavos, cuenta_id: g.cuenta_id || j.cuenta_efectivo_id, categoria_id: g.categoria_id,
        fecha: j.fecha, nota: g.nota?.trim() || null, jornada_id: id, origen: 'jornada_gasto',
      })
    }
    return id
  })
}

export async function borrarJornada(id: string) {
  await borrar('jornadas', id)
}

/** Datos para prellenar una jornada nueva: último km final y cuentas usadas la última vez. */
export async function ultimaJornada() {
  return uno<{ km_final: number | null; cuenta_efectivo_id: string | null; cuenta_app_id: string | null }>(
    'SELECT km_final, cuenta_efectivo_id, cuenta_app_id FROM jornadas ORDER BY fecha DESC, creado_en DESC LIMIT 1',
  )
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
  const vehiculo = uno<Vehiculo>(
    'SELECT id, marca, modelo, anio, placa, km_registro, combustible FROM vehiculos WHERE activo = 1 ORDER BY creado_en LIMIT 1',
  )
  if (!vehiculo) return null
  return {
    vehiculo,
    kmActual: uno<{ k: number }>('SELECT km_actual AS k FROM vehiculos_km WHERE vehiculo_id = ?', [vehiculo.id])?.k ?? vehiculo.km_registro,
    cargas: consultar<CargaCombustible>(
      'SELECT id, fecha, galones, total_centavos, km, tanque_lleno, cuenta_id, nota FROM cargas_combustible WHERE vehiculo_id = ? ORDER BY fecha DESC, creado_en DESC',
      [vehiculo.id],
    ),
    mantenimientos: consultar<Mantenimiento>(
      'SELECT id, tipo, fecha, km, costo_centavos, cuenta_id, taller, nota FROM mantenimientos WHERE vehiculo_id = ? ORDER BY fecha DESC',
      [vehiculo.id],
    ),
    recordatorios: consultar<Recordatorio>(
      'SELECT id, tipo, cada_km, cada_meses, ultimo_km, ultima_fecha FROM recordatorios WHERE vehiculo_id = ? ORDER BY cada_km IS NULL, cada_km',
      [vehiculo.id],
    ),
    documentos: consultar<Documento>('SELECT id, tipo, nombre, vence, nota FROM documentos ORDER BY vence'),
  }
}

export async function guardarVehiculo(v: Omit<Vehiculo, 'id'> & { id?: string }) {
  const { id, ...resto } = v
  if (id) await actualizar('vehiculos', id, resto)
  else await insertar('vehiculos', resto)
}

type SinId<T> = Omit<T, 'id'>

async function guardarEn(tabla: string, fila: Fila, id?: string) {
  if (id) await actualizar(tabla, id, fila)
  else await insertar(tabla, fila)
}

export const guardarCarga = (vehiculoId: string, c: SinId<CargaCombustible>, id?: string) =>
  guardarEn('cargas_combustible', id ? { ...c } : { ...c, vehiculo_id: vehiculoId }, id)
export const borrarCarga = (id: string) => borrar('cargas_combustible', id)

export const guardarMantenimiento = (vehiculoId: string, m: SinId<Mantenimiento>, id?: string) =>
  guardarEn('mantenimientos', id ? { ...m } : { ...m, vehiculo_id: vehiculoId }, id)
export const borrarMantenimiento = (id: string) => borrar('mantenimientos', id)

export const guardarRecordatorio = (vehiculoId: string, r: SinId<Recordatorio>, id?: string) =>
  guardarEn('recordatorios', id ? { ...r } : { ...r, vehiculo_id: vehiculoId }, id)
export const borrarRecordatorio = (id: string) => borrar('recordatorios', id)

export const guardarDocumento = (vehiculoId: string, d: SinId<Documento>, id?: string) =>
  guardarEn('documentos', id ? { ...d } : { ...d, vehiculo_id: d.tipo === 'licencia' ? null : vehiculoId }, id)
export const borrarDocumento = (id: string) => borrar('documentos', id)

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
  return consultar<Obligacion>('SELECT id, nombre, tipo, monto_centavos, activa FROM obligaciones ORDER BY creado_en')
}

export async function guardarObligacion(o: Omit<Obligacion, 'id' | 'activa'>, id?: string) {
  await guardarEn('obligaciones', { ...o }, id)
}

export async function borrarObligacion(id: string) {
  await borrar('obligaciones', id)
}

export interface PreferenciasMeta {
  dias_trabajo_semana: number
  margen_pct: number
}

export async function obtenerPreferenciasMeta(): Promise<PreferenciasMeta> {
  return uno<PreferenciasMeta>('SELECT dias_trabajo_semana, margen_pct FROM preferencias WHERE id = 1') ?? { dias_trabajo_semana: 6, margen_pct: 10 }
}

async function guardarPreferencias(cambios: Fila) {
  const cols = Object.keys(cambios)
  await ejecutar(`UPDATE preferencias SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = 1`, Object.values(cambios))
}

export async function guardarPreferenciasMeta(p: PreferenciasMeta) {
  await guardarPreferencias({ ...p })
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
  return consultar<DeudaConEstado>(
    `SELECT d.id, d.nombre, d.tipo, d.acreedor, d.saldo_inicial_centavos, d.tasa_anual, d.cuota_centavos, d.dia_pago,
            d.incluir_en_meta, d.pagada, d.creado_en, d.frecuencia, d.dia_pago_2, d.dia_semana, d.limite_credito_centavos,
            d.dia_corte, d.cuenta_tarjeta_id,
            e.saldo_centavos, e.pagado_centavos, e.intereses_pagados_centavos, e.cargos_centavos, e.ultimo_pago
     FROM deudas d JOIN deudas_estado e ON e.deuda_id = d.id
     ORDER BY d.creado_en`,
  )
}

export async function guardarDeuda(d: Omit<Deuda, 'id' | 'pagada' | 'creado_en'>, id?: string) {
  await guardarEn('deudas', { ...d }, id)
}

export async function marcarDeudaPagada(id: string, pagada: boolean) {
  await actualizar('deudas', id, { pagada })
}

export async function borrarDeuda(id: string) {
  await borrar('deudas', id)
}

const COLUMNAS_PAGO = 'id, deuda_id, tipo, fecha, monto_centavos, interes_centavos, cuenta_id, nota'

export async function listarPagosDeuda(deudaId: string): Promise<PagoDeuda[]> {
  return consultar<PagoDeuda>(`SELECT ${COLUMNAS_PAGO} FROM pagos_deuda WHERE deuda_id = ? ORDER BY fecha DESC, creado_en DESC`, [deudaId])
}

/** Todos los pagos y cargos de deudas desde una fecha (para reportes). */
export async function listarPagosDeudaDesde(desde: string): Promise<PagoDeuda[]> {
  return consultar<PagoDeuda>(`SELECT ${COLUMNAS_PAGO} FROM pagos_deuda WHERE fecha >= ?`, [desde])
}

export async function guardarPagoDeuda(p: Omit<PagoDeuda, 'id'>) {
  await insertar('pagos_deuda', { ...p })
}

export async function borrarPagoDeuda(id: string) {
  await borrar('pagos_deuda', id)
}

export interface PlanDeudas {
  estrategia_deudas: 'avalancha' | 'bola_nieve'
  pago_extra_deudas_centavos: number
}

export async function obtenerPlanDeudas(): Promise<PlanDeudas> {
  return uno<PlanDeudas>('SELECT estrategia_deudas, pago_extra_deudas_centavos FROM preferencias WHERE id = 1')
    ?? { estrategia_deudas: 'avalancha', pago_extra_deudas_centavos: 0 }
}

export async function guardarPlanDeudas(p: PlanDeudas) {
  await guardarPreferencias({ ...p })
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
  return consultar<Conversacion>('SELECT id, titulo, creado_en FROM conversaciones_ia ORDER BY creado_en DESC LIMIT 50')
}

export async function listarMensajesIA(conversacionId: string): Promise<MensajeIA[]> {
  return consultar<MensajeIA>('SELECT id, rol, contenido, creado_en FROM mensajes_ia WHERE conversacion_id = ? ORDER BY creado_en', [conversacionId])
}

export async function borrarConversacion(id: string) {
  await borrar('conversaciones_ia', id)
}

/** Preguntas por día (protege tu saldo de Anthropic). */
export const LIMITE_DIARIO_ASESOR = 30
const MENSAJES_HISTORIAL = 20

/** Envía la pregunta a Claude (desde el programa de escritorio) y guarda la conversación en tu PC. */
export async function preguntarAsesor(conversacionId: string | null, mensaje: string, contexto: unknown) {
  if (!escritorio) throw new Error('El asesor IA funciona en el programa de Windows de FENIX APP.')
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const hechas = uno<{ n: number }>("SELECT count(*) AS n FROM mensajes_ia WHERE rol = 'user' AND creado_en >= ?", [desde])?.n ?? 0
  if (hechas >= LIMITE_DIARIO_ASESOR) {
    throw new Error(`Llegaste al límite de ${LIMITE_DIARIO_ASESOR} preguntas en 24 horas. Vuelve a intentarlo más tarde.`)
  }
  const historial = conversacionId
    ? consultar<{ rol: 'user' | 'assistant'; contenido: string }>(
        'SELECT rol, contenido FROM (SELECT rol, contenido, creado_en FROM mensajes_ia WHERE conversacion_id = ? ORDER BY creado_en DESC LIMIT ?) ORDER BY creado_en',
        [conversacionId, MENSAJES_HISTORIAL],
      )
    : []
  while (historial.length && historial[0].rol !== 'user') historial.shift()

  const r = await escritorio.asesor.preguntar({ historial, mensaje, contexto })

  return transaccion(async () => {
    let id = conversacionId
    if (!id) {
      const limpio = mensaje.replace(/\s+/g, ' ').trim()
      id = await insertar('conversaciones_ia', { titulo: limpio.length > 60 ? `${limpio.slice(0, 57)}…` : limpio })
    }
    const ahora = Date.now()
    await insertar('mensajes_ia', { conversacion_id: id, rol: 'user', contenido: mensaje, creado_en: new Date(ahora).toISOString() })
    await insertar('mensajes_ia', {
      conversacion_id: id, rol: 'assistant', contenido: r.respuesta, creado_en: new Date(ahora + 1).toISOString(),
      tokens_entrada: r.tokensEntrada, tokens_salida: r.tokensSalida,
    })
    return { conversacion_id: id, respuesta: r.respuesta }
  })
}

// ---------- Presupuesto ----------
export interface Presupuesto {
  id: string
  mes: string
  categoria_id: string
  limite_centavos: number
}

export async function listarPresupuestos(mes: string): Promise<Presupuesto[]> {
  return consultar<Presupuesto>('SELECT id, mes, categoria_id, limite_centavos FROM presupuestos WHERE mes = ?', [mes])
}

/** Crea o actualiza los límites de un mes (una fila por categoría). */
export async function guardarLimites(mes: string, limites: { categoria_id: string; limite_centavos: number }[]) {
  if (!limites.length) return
  await transaccion(async () => {
    for (const l of limites) {
      await ejecutar(
        `INSERT INTO presupuestos (id, mes, categoria_id, limite_centavos) VALUES (?, ?, ?, ?)
         ON CONFLICT (mes, categoria_id) DO UPDATE SET limite_centavos = excluded.limite_centavos`,
        [nuevoId(), mes, l.categoria_id, l.limite_centavos],
      )
    }
  })
}

export async function borrarPresupuesto(id: string) {
  await borrar('presupuestos', id)
}

export async function obtenerUmbralAlerta(): Promise<number> {
  return uno<{ u: number }>('SELECT umbral_alerta_pct AS u FROM preferencias WHERE id = 1')?.u ?? 80
}

export async function guardarUmbralAlerta(pct: number) {
  await guardarPreferencias({ umbral_alerta_pct: pct })
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
  return consultar<MetaConAhorro>(
    `SELECT m.id, m.nombre, m.monto_objetivo_centavos, m.moneda, m.fecha_objetivo, m.cuenta_id, m.incluir_en_meta, m.estado,
            m.creado_en, e.ahorrado_centavos, e.ultimo_aporte
     FROM metas m JOIN metas_estado e ON e.meta_id = m.id
     ORDER BY m.fecha_objetivo`,
  )
}

export async function guardarMeta(m: Omit<Meta, 'id' | 'estado' | 'creado_en'>, id?: string) {
  await guardarEn('metas', { ...m }, id)
}

export async function cambiarEstadoMeta(id: string, estado: Meta['estado']) {
  await actualizar('metas', id, { estado })
}

export async function borrarMeta(id: string) {
  await borrar('metas', id)
}

export async function listarAportes(metaId: string): Promise<AporteMeta[]> {
  return consultar<AporteMeta>(
    'SELECT id, meta_id, tipo, fecha, monto_centavos, cuenta_id, nota FROM aportes_meta WHERE meta_id = ? ORDER BY fecha DESC, creado_en DESC',
    [metaId],
  )
}

export async function guardarAporte(a: Omit<AporteMeta, 'id'>) {
  await insertar('aportes_meta', { ...a })
}

export async function borrarAporte(id: string) {
  await borrar('aportes_meta', id)
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

export async function listarInversiones(): Promise<InversionConValor[]> {
  const invs = consultar<Inversion>(
    'SELECT id, nombre, tipo, entidad, moneda, cuenta_id, tasa_anual, fecha_inicio, fecha_vencimiento, estado, nota FROM inversiones ORDER BY fecha_inicio',
  )
  if (invs.length === 0) return []
  const cuentas = await listarCuentas(true)
  return invs.map((inv) => {
    const cuenta = cuentas.find((c) => c.id === inv.cuenta_id)
    const propios = consultar<Movimiento>(
      `SELECT ${COLUMNAS_MOV} FROM movimientos WHERE cuenta_id = ? OR cuenta_destino_id = ? OR inversion_id = ? ORDER BY fecha DESC`,
      [inv.cuenta_id, inv.cuenta_id, inv.id],
    )
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

/** Crea la inversión con su propia cuenta y, si sale de otra cuenta, la transferencia. Todo o nada. */
export async function crearInversion(p: NuevaInversion): Promise<string> {
  if (p.monto_centavos < 0) throw new Error('Monto no válido')
  if (p.cuenta_origen_id) {
    const origen = uno<{ moneda: string }>('SELECT moneda FROM cuentas WHERE id = ?', [p.cuenta_origen_id])
    if (!origen || origen.moneda !== p.moneda) throw new Error('La cuenta de origen debe estar en la misma moneda que la inversión')
  }
  return transaccion(async () => {
    const cuenta = await insertar('cuentas', {
      nombre: p.nombre, tipo: 'inversion', moneda: p.moneda, saldo_inicial_centavos: p.cuenta_origen_id ? 0 : p.monto_centavos,
    })
    const id = await insertar('inversiones', {
      nombre: p.nombre, tipo: p.tipo, entidad: p.entidad?.trim() || null, moneda: p.moneda, cuenta_id: cuenta, tasa_anual: p.tasa_anual,
      fecha_inicio: p.fecha_inicio, fecha_vencimiento: p.fecha_vencimiento, nota: p.nota?.trim() || null,
    })
    if (p.cuenta_origen_id && p.monto_centavos > 0) {
      await insertar('movimientos', {
        tipo: 'transferencia', monto_centavos: p.monto_centavos, cuenta_id: p.cuenta_origen_id, cuenta_destino_id: cuenta,
        fecha: p.fecha_inicio, nota: `Inversión: ${p.nombre}`,
      })
    }
    return id
  })
}

export async function actualizarInversion(id: string, cambios: Partial<Pick<Inversion, 'nombre' | 'entidad' | 'tasa_anual' | 'fecha_vencimiento' | 'nota'>>) {
  await actualizar('inversiones', id, cambios)
}

/** Cierra la inversión y archiva su cuenta (el historial se conserva). */
export async function cerrarInversion(inv: Inversion, cerrar = true) {
  await transaccion(async () => {
    await actualizar('inversiones', inv.id, { estado: cerrar ? 'cerrada' : 'activa' })
    await archivarCuenta(inv.cuenta_id, cerrar)
  })
}

export type OperacionInversion =
  | { tipo: 'depositar'; cuenta_id: string; monto_centavos: number; fecha: string; nota?: string | null }
  | { tipo: 'retirar'; cuenta_id: string; monto_centavos: number; fecha: string; nota?: string | null }
  | { tipo: 'rendimiento'; cuenta_id: string; monto_centavos: number; fecha: string; nota?: string | null }
  | { tipo: 'valor'; valor_centavos: number; fecha: string; nota?: string | null }

export async function operarInversion(inv: InversionConValor, op: OperacionInversion) {
  await transaccion(async () => {
    const base = { fecha: op.fecha, nota: op.nota || null }
    if (op.tipo === 'depositar' || op.tipo === 'retirar') {
      const desde = op.tipo === 'depositar' ? op.cuenta_id : inv.cuenta_id
      const hacia = op.tipo === 'depositar' ? inv.cuenta_id : op.cuenta_id
      await insertar('movimientos', {
        ...base, tipo: 'transferencia', monto_centavos: op.monto_centavos, cuenta_id: desde, cuenta_destino_id: hacia,
        nota: base.nota ?? `${op.tipo === 'depositar' ? 'Depósito a' : 'Retiro de'} ${inv.nombre}`,
      })
    } else if (op.tipo === 'rendimiento') {
      await insertar('movimientos', {
        ...base, tipo: 'ingreso', monto_centavos: op.monto_centavos, cuenta_id: op.cuenta_id,
        categoria_id: await categoriaId('Rendimientos de inversiones', 'ingreso'),
        origen: 'inversion_rendimiento', inversion_id: inv.id, nota: base.nota ?? `Rendimiento ${inv.nombre}`,
      })
    } else {
      const diferencia = op.valor_centavos - inv.valor_centavos
      if (diferencia === 0) return
      const sube = diferencia > 0
      await insertar('movimientos', {
        ...base, tipo: sube ? 'ingreso' : 'gasto', monto_centavos: Math.abs(diferencia), cuenta_id: inv.cuenta_id,
        categoria_id: await categoriaId(sube ? 'Rendimientos de inversiones' : 'Pérdida en inversiones', sube ? 'ingreso' : 'gasto'),
        origen: 'inversion_ajuste', inversion_id: inv.id, nota: base.nota ?? `Actualización de valor de ${inv.nombre}`,
      })
    }
  })
}
