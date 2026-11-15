// Motor de la base de datos local: SQLite (sql.js) dentro de la app.
// En el programa de Windows el archivo vive en el disco duro (carpeta de datos de la app);
// en el navegador (modo desarrollo) se guarda en el almacenamiento del navegador.
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { escritorio } from '../escritorio'
import esquemaV1 from './esquema.sql?raw'

/** Migraciones en orden: la posición + 1 es la versión (PRAGMA user_version). */
const MIGRACIONES: string[] = [esquemaV1]

/** Columnas guardadas como 0/1 que la app usa como true/false. */
const BOOLEANAS = new Set(['archivada', 'activa', 'tanque_lleno', 'incluir_en_meta', 'pagada'])

let db: Database | null = null
let enTransaccion = 0
let guardando: Promise<void> = Promise.resolve()

// ---------- Dónde se guarda el archivo ----------
const almacen = {
  async leer(): Promise<Uint8Array | null> {
    if (escritorio) return escritorio.bd.leer()
    return leerIndexedDB()
  },
  async guardar(bytes: Uint8Array): Promise<void> {
    if (escritorio) return escritorio.bd.guardar(bytes)
    return guardarIndexedDB(bytes)
  },
}

function abrirIndexedDB(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open('fenix-app', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('bd')
    r.onsuccess = () => ok(r.result)
    r.onerror = () => mal(r.error)
  })
}
async function leerIndexedDB(): Promise<Uint8Array | null> {
  const idb = await abrirIndexedDB()
  return new Promise((ok, mal) => {
    const r = idb.transaction('bd').objectStore('bd').get('principal')
    r.onsuccess = () => ok((r.result as Uint8Array | undefined) ?? null)
    r.onerror = () => mal(r.error)
  })
}
async function guardarIndexedDB(bytes: Uint8Array): Promise<void> {
  const idb = await abrirIndexedDB()
  return new Promise((ok, mal) => {
    const t = idb.transaction('bd', 'readwrite')
    t.objectStore('bd').put(bytes, 'principal')
    t.oncomplete = () => ok()
    t.onerror = () => mal(t.error)
  })
}

// ---------- Abrir y preparar ----------
async function cargarMotor() {
  if (escritorio) {
    // Dentro del programa la app se abre como archivo local: el motor se entrega por el puente.
    const wasmBinary = await escritorio.bd.motor()
    return initSqlJs({ wasmBinary: wasmBinary as unknown as ArrayBuffer })
  }
  return initSqlJs({ locateFile: () => wasmUrl })
}

function migrar(base: Database): boolean {
  const version = Number(base.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0)
  if (version > MIGRACIONES.length) {
    throw new Error('Estos datos son de una versión más nueva de FENIX APP. Actualiza el programa para abrirlos.')
  }
  for (let v = version; v < MIGRACIONES.length; v++) {
    base.exec('BEGIN')
    try {
      base.exec(MIGRACIONES[v])
      base.exec(`PRAGMA user_version = ${v + 1}`)
      base.exec('COMMIT')
    } catch (e) {
      base.exec('ROLLBACK')
      throw e
    }
  }
  return version < MIGRACIONES.length
}

/** Abre (o crea) la base de datos. Se llama una vez al iniciar la app. */
export async function iniciarBD(): Promise<void> {
  if (db) return
  const SQL = await cargarMotor()
  const bytes = await almacen.leer()
  const base = bytes ? new SQL.Database(bytes) : new SQL.Database()
  base.exec('PRAGMA foreign_keys = ON')
  const cambio = migrar(base)
  db = base
  if (cambio) await persistir()
}

function bd(): Database {
  if (!db) throw new Error('La base de datos todavía no está lista.')
  return db
}

// ---------- Guardar en disco ----------
function persistir(): Promise<void> {
  const base = bd()
  const bytes = base.export()
  // export() reabre la base y reinicia los PRAGMA: se vuelve a activar la revisión de relaciones.
  base.exec('PRAGMA foreign_keys = ON')
  // Los guardados van en fila; si uno falla, el siguiente igual se intenta.
  const intento = guardando.catch(() => undefined).then(() => almacen.guardar(bytes))
  guardando = intento
  return intento
}

/** Espera a que terminen de escribirse los cambios pendientes. */
export const esperarGuardado = () => guardando

// ---------- Consultas ----------
type Param = SqlValue | boolean | undefined

const aSql = (p: Param[]): SqlValue[] => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v))

function convertir<T>(fila: Record<string, SqlValue>): T {
  const res: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fila)) res[k] = BOOLEANAS.has(k) && v != null ? v === 1 : v
  return res as T
}

/** Filas de una consulta como objetos. */
export function consultar<T = Record<string, unknown>>(sql: string, params: Param[] = []): T[] {
  const st = bd().prepare(sql)
  try {
    st.bind(aSql(params))
    const filas: T[] = []
    while (st.step()) filas.push(convertir<T>(st.getAsObject()))
    return filas
  } catch (e) {
    throw traducir(e)
  } finally {
    st.free()
  }
}

/** Primera fila (o null). */
export function uno<T = Record<string, unknown>>(sql: string, params: Param[] = []): T | null {
  return consultar<T>(sql, params)[0] ?? null
}

/** Ejecuta un cambio y lo guarda en disco (salvo dentro de una transacción, que guarda al final). */
export async function ejecutar(sql: string, params: Param[] = []): Promise<void> {
  try {
    bd().run(sql, aSql(params))
  } catch (e) {
    throw traducir(e)
  }
  if (!enTransaccion) await persistir()
}

/** Varios cambios que se aplican todos o ninguno. */
export async function transaccion<T>(fn: () => T | Promise<T>): Promise<T> {
  const base = bd()
  if (enTransaccion) return fn()
  base.exec('BEGIN')
  enTransaccion++
  try {
    const r = await fn()
    base.exec('COMMIT')
    enTransaccion--
    await persistir()
    return r
  } catch (e) {
    enTransaccion--
    try { base.exec('ROLLBACK') } catch { /* ya se deshizo */ }
    throw traducir(e)
  }
}

/** Identificador nuevo (igual que los que genera la base de datos). */
export const nuevoId = () => crypto.randomUUID().replace(/-/g, '')

// ---------- Copias de seguridad ----------
/** Bytes de toda la base de datos (para exportar una copia). */
export function exportarBytes(): Uint8Array {
  const bytes = bd().export()
  bd().exec('PRAGMA foreign_keys = ON')
  return bytes
}

/** Reemplaza todos los datos por los de una copia, después de comprobar que es válida. */
export async function restaurarBytes(bytes: Uint8Array): Promise<void> {
  const SQL = await cargarMotor()
  let prueba: Database
  try {
    prueba = new SQL.Database(bytes)
    prueba.exec('SELECT 1 FROM preferencias LIMIT 1; SELECT 1 FROM movimientos LIMIT 1')
  } catch {
    throw new Error('Ese archivo no es una copia de seguridad de FENIX APP.')
  }
  prueba.exec('PRAGMA foreign_keys = ON')
  migrar(prueba)
  db?.close()
  db = prueba
  await persistir()
}

// ---------- Mensajes de error en español ----------
function traducir(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/FOREIGN KEY constraint failed/i.test(msg)) {
    return new Error('No se puede: hay otros registros que dependen de este (por ejemplo, movimientos de esa cuenta).')
  }
  if (/UNIQUE constraint failed/i.test(msg)) return new Error('Ya existe un registro con ese nombre.')
  if (/CHECK constraint failed/i.test(msg)) return new Error('Algún dato no es válido. Revisa los montos, las fechas y los números.')
  if (/NOT NULL constraint failed/i.test(msg)) return new Error('Falta completar un dato obligatorio.')
  return e instanceof Error ? e : new Error(msg)
}
