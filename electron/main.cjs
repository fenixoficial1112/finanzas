// FENIX APP · Programa de escritorio (Electron).
// Muestra la app (carpeta dist/) en una ventana propia y guarda todos los datos en un archivo
// SQLite en el disco duro: %APPDATA%\FENIX APP\fenix.db, con una copia automática por día.
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const asesor = require('./asesor.cjs')
const actualizador = require('./actualizador.cjs')
const extras = require('./extras.cjs')

const MAX_RESPALDOS = 30
let ventana = null

const carpetaDatos = () => app.getPath('userData')
const archivoDatos = () => path.join(carpetaDatos(), 'fenix.db')
const carpetaRespaldos = () => path.join(carpetaDatos(), 'respaldos')
const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Solo una ventana de FENIX APP a la vez (dos ventanas escribiendo el mismo archivo lo dañarían).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!ventana) return
    if (ventana.isMinimized()) ventana.restore()
    ventana.focus()
  })
  // Necesario en Windows para que los avisos salgan con el nombre del programa.
  app.setAppUserModelId('com.fenixapp.finanzas')
  extras.iniciar({ archivoDatos, ventana: () => ventana, ventanaPadre: () => ventana })
  app.whenReady().then(() => {
    crearVentana()
    actualizador.iniciar(() => ventana)
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) crearVentana() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 660,
    title: 'FENIX APP',
    backgroundColor: '#f4f5f7',
    icon: path.join(__dirname, 'icono.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // Si se abrió solo al encender la PC, queda minimizado en la barra de tareas.
  const minimizado = process.argv.includes('--minimizado')
  ventana.once('ready-to-show', () => (minimizado ? ventana.minimize() : ventana.show()))
  ventana.on('closed', () => { ventana = null })

  // Enlaces externos se abren en el navegador, nunca dentro de la app.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (!url.startsWith('file://')) {
      evento.preventDefault()
      if (/^https?:\/\//.test(url)) shell.openExternal(url)
    }
  })

  ventana.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

// ---------- Archivo de datos ----------
/** Copia del archivo actual una vez por día, antes del primer cambio del día. Guarda las últimas 30. */
function respaldoDiario() {
  if (!fs.existsSync(archivoDatos())) return
  fs.mkdirSync(carpetaRespaldos(), { recursive: true })
  const destino = path.join(carpetaRespaldos(), `fenix-${hoy()}.db`)
  if (fs.existsSync(destino)) return
  fs.copyFileSync(archivoDatos(), destino)
  const viejos = fs.readdirSync(carpetaRespaldos()).filter((f) => /^fenix-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse()
  for (const f of viejos.slice(MAX_RESPALDOS)) fs.rmSync(path.join(carpetaRespaldos(), f), { force: true })
}

/** Escribe de forma segura: primero un archivo temporal y luego lo reemplaza (si se va la luz, no se daña). */
function escribirSeguro(destino, bytes) {
  const temporal = `${destino}.tmp`
  fs.writeFileSync(temporal, bytes)
  fs.renameSync(temporal, destino)
}

const aBytes = (datos) => {
  if (!(datos instanceof Uint8Array)) throw new Error('Datos no válidos')
  return Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength)
}

ipcMain.handle('bd:motor', () => fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')))

ipcMain.handle('bd:leer', () => (fs.existsSync(archivoDatos()) ? fs.readFileSync(archivoDatos()) : null))

ipcMain.handle('bd:guardar', (_evento, datos) => {
  fs.mkdirSync(carpetaDatos(), { recursive: true })
  respaldoDiario()
  escribirSeguro(archivoDatos(), aBytes(datos))
  extras.alGuardar(archivoDatos())
})

ipcMain.handle('bd:ubicacion', () => ({
  carpeta: carpetaDatos(),
  archivo: archivoDatos(),
  respaldos: carpetaRespaldos(),
  cantidadRespaldos: fs.existsSync(carpetaRespaldos()) ? fs.readdirSync(carpetaRespaldos()).filter((f) => f.endsWith('.db')).length : 0,
}))

ipcMain.handle('bd:abrir-carpeta', () => shell.openPath(carpetaDatos()))

ipcMain.handle('bd:exportar', async (_evento, datos) => {
  const { canceled, filePath } = await dialog.showSaveDialog(ventana, {
    title: 'Guardar copia de seguridad de FENIX APP',
    defaultPath: path.join(app.getPath('documents'), `FENIX-APP-copia-${hoy()}.db`),
    filters: [{ name: 'Copia de FENIX APP', extensions: ['db'] }],
  })
  if (canceled || !filePath) return null
  escribirSeguro(filePath, aBytes(datos))
  return filePath
})

ipcMain.handle('bd:importar', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(ventana, {
    title: 'Restaurar una copia de seguridad de FENIX APP',
    defaultPath: carpetaRespaldos(),
    filters: [{ name: 'Copia de FENIX APP', extensions: ['db'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths[0]) return null
  // Antes de restaurar, se guarda una copia de lo actual por si acaso.
  if (fs.existsSync(archivoDatos())) {
    fs.mkdirSync(carpetaRespaldos(), { recursive: true })
    fs.copyFileSync(archivoDatos(), path.join(carpetaRespaldos(), `antes-de-restaurar-${Date.now()}.db`))
  }
  return fs.readFileSync(filePaths[0])
})

// ---------- Asesor IA ----------
ipcMain.handle('asesor:estado', () => asesor.estado())
ipcMain.handle('asesor:guardar-clave', (_evento, clave) => asesor.guardarClave(clave))
ipcMain.handle('asesor:borrar-clave', () => asesor.borrarClave())
ipcMain.handle('asesor:preguntar', (_evento, datos) => asesor.preguntar(datos))

// ---------- Otros ----------
ipcMain.handle('abrir-externo', (_evento, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) return shell.openExternal(url)
  throw new Error('URL no permitida')
})
