// Copia automática en una carpeta que elija el usuario (Google Drive, OneDrive…), avisos de Windows
// y abrir el programa al encender la PC.
const { app, dialog, ipcMain, Notification } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const CADA_MS = 10 * 60 * 1000 // como mucho una copia cada 10 minutos mientras se usa
const NOMBRE_COPIA = 'FENIX-APP-copia.db'

const archivoConfig = () => path.join(app.getPath('userData'), 'config.json')
function leerConfig() {
  try { return JSON.parse(fs.readFileSync(archivoConfig(), 'utf8')) } catch { return {} }
}
function guardarConfig(cambios) {
  const c = { ...leerConfig(), ...cambios }
  fs.mkdirSync(path.dirname(archivoConfig()), { recursive: true })
  fs.writeFileSync(archivoConfig(), JSON.stringify(c, null, 2))
  return c
}

let ultimaCopia = 0
let ultimoError = null
let pendiente = null

/** Copia el archivo de datos a la carpeta elegida (archivo temporal + reemplazo, para no dejarlo a medias). */
function copiarAhora(archivoDatos) {
  const { carpetaCopia } = leerConfig()
  if (!carpetaCopia || !fs.existsSync(archivoDatos)) return null
  try {
    if (!fs.existsSync(carpetaCopia)) throw new Error('No encuentro la carpeta. ¿Está conectado Google Drive / OneDrive?')
    const destino = path.join(carpetaCopia, NOMBRE_COPIA)
    fs.copyFileSync(archivoDatos, `${destino}.tmp`)
    fs.renameSync(`${destino}.tmp`, destino)
    ultimaCopia = Date.now()
    ultimoError = null
    guardarConfig({ ultimaCopia: new Date(ultimaCopia).toISOString() })
    return destino
  } catch (e) {
    ultimoError = e.message
    return null
  }
}

/** Después de cada cambio: copia si pasaron 10 minutos; si no, la deja programada. */
function alGuardar(archivoDatos) {
  if (!leerConfig().carpetaCopia) return
  const falta = ultimaCopia + CADA_MS - Date.now()
  if (falta <= 0) return copiarAhora(archivoDatos)
  if (!pendiente) pendiente = setTimeout(() => { pendiente = null; copiarAhora(archivoDatos) }, falta)
}

function iniciar({ archivoDatos, ventana, ventanaPadre }) {
  app.on('before-quit', () => {
    if (pendiente) { clearTimeout(pendiente); pendiente = null }
    copiarAhora(archivoDatos())
  })

  ipcMain.handle('copia:estado', () => {
    const c = leerConfig()
    return { carpeta: c.carpetaCopia ?? null, ultima: c.ultimaCopia ?? null, error: ultimoError }
  })
  ipcMain.handle('copia:elegir', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ventanaPadre(), {
      title: 'Elige la carpeta de Google Drive, OneDrive o una memoria USB',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (canceled || !filePaths[0]) return null
    guardarConfig({ carpetaCopia: filePaths[0] })
    if (!copiarAhora(archivoDatos())) {
      if (ultimoError) throw new Error(ultimoError)
    }
    return filePaths[0]
  })
  ipcMain.handle('copia:quitar', () => { guardarConfig({ carpetaCopia: null, ultimaCopia: null }); ultimoError = null })
  ipcMain.handle('copia:ahora', () => {
    const r = copiarAhora(archivoDatos())
    if (!r && ultimoError) throw new Error(ultimoError)
    return r
  })

  // ----- Avisos de Windows -----
  ipcMain.handle('app:avisar', (_e, { titulo, cuerpo, ruta }) => {
    if (!Notification.isSupported()) return false
    const n = new Notification({ title: String(titulo).slice(0, 120), body: String(cuerpo).slice(0, 400), icon: path.join(__dirname, 'icono.png') })
    n.on('click', () => {
      const v = ventana()
      if (!v) return
      if (v.isMinimized()) v.restore()
      v.show()
      v.focus()
      if (typeof ruta === 'string' && ruta.startsWith('/')) v.webContents.send('navegar', ruta)
    })
    n.show()
    return true
  })

  // ----- Abrir al encender la PC -----
  ipcMain.handle('app:inicio-windows', () => app.getLoginItemSettings({ args: ['--minimizado'] }).openAtLogin)
  ipcMain.handle('app:inicio-windows-poner', (_e, activo) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(activo), args: ['--minimizado'] })
    return app.getLoginItemSettings({ args: ['--minimizado'] }).openAtLogin
  })
}

module.exports = { iniciar, alGuardar }
