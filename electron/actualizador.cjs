// FENIX APP · Actualizaciones automáticas desde GitHub Releases.
// Al abrir el programa revisa si hay una versión nueva; si la hay, la descarga en segundo plano
// y se instala al cerrar FENIX APP (o al tocar "Reiniciar y actualizar").
const { app, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')

let estado = { estado: 'sin-revisar', version: app.getVersion() }
let obtenerVentana = () => null

function avisar(nuevo) {
  estado = { ...estado, ...nuevo }
  const v = obtenerVentana()
  if (v && !v.isDestroyed()) v.webContents.send('actualizacion', estado)
}

function revisar() {
  if (!app.isPackaged) return avisar({ estado: 'desarrollo' })
  return autoUpdater.checkForUpdates().catch((e) => avisar({ estado: 'error', mensaje: String(e?.message ?? e) }))
}

function iniciar(ventana) {
  obtenerVentana = ventana
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => avisar({ estado: 'revisando' }))
  autoUpdater.on('update-not-available', () => avisar({ estado: 'al-dia' }))
  autoUpdater.on('update-available', (i) => avisar({ estado: 'descargando', nueva: i.version, progreso: 0 }))
  autoUpdater.on('download-progress', (p) => avisar({ estado: 'descargando', progreso: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => avisar({ estado: 'lista', nueva: i.version }))
  autoUpdater.on('error', (e) => avisar({ estado: 'error', mensaje: String(e?.message ?? e) }))
  // Esperamos unos segundos para no frenar el arranque.
  setTimeout(revisar, 5000)
  // Y volvemos a revisar cada 6 horas si el programa queda abierto.
  setInterval(revisar, 6 * 60 * 60 * 1000)
}

ipcMain.handle('app:estado-actualizacion', () => estado)
ipcMain.handle('app:buscar-actualizacion', () => revisar())
ipcMain.handle('app:instalar-actualizacion', () => autoUpdater.quitAndInstall())

module.exports = { iniciar }
