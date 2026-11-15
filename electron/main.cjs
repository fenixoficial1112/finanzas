// FENIX APP · Programa de escritorio (Electron).
// Muestra la app web compilada (carpeta dist/) en una ventana propia. Los datos siguen en la nube
// (Supabase). El inicio de sesión con Google se hace en el navegador del sistema (Google no permite
// iniciar sesión dentro de ventanas incrustadas) y vuelve a la app con el enlace fenixapp://auth.
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')

const PROTOCOLO = 'fenixapp'
let ventana = null
let enlacePendiente = null

// Registrar fenixapp:// para que el navegador pueda devolver al usuario a la app.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOLO, process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient(PROTOCOLO)
}

const buscarEnlace = (argv) => argv.find((a) => typeof a === 'string' && a.startsWith(`${PROTOCOLO}://`)) ?? null

function entregarEnlace(url) {
  if (!url) return
  if (ventana && !ventana.webContents.isLoading()) {
    ventana.webContents.send('auth-callback', url)
    if (ventana.isMinimized()) ventana.restore()
    ventana.focus()
  } else {
    enlacePendiente = url
  }
}

// Solo una ventana de FENIX APP a la vez: si se abre otra (por ejemplo, desde el enlace del
// navegador en Windows), se le pasa el enlace a la que ya está abierta.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_evento, argv) => entregarEnlace(buscarEnlace(argv)))
  app.on('open-url', (evento, url) => { evento.preventDefault(); entregarEnlace(url) }) // macOS

  app.whenReady().then(() => {
    enlacePendiente = buscarEnlace(process.argv)
    crearVentana()
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
  ventana.once('ready-to-show', () => ventana.show())
  ventana.webContents.on('did-finish-load', () => {
    if (enlacePendiente) {
      ventana.webContents.send('auth-callback', enlacePendiente)
      enlacePendiente = null
    }
  })

  // Enlaces externos (Supabase, Anthropic, Google…) se abren en el navegador, nunca dentro de la app.
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

// La interfaz pide abrir una URL de inicio de sesión (Google) en el navegador del sistema.
ipcMain.handle('abrir-externo', (_evento, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) return shell.openExternal(url)
  throw new Error('URL no permitida')
})
