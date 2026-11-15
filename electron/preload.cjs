// Puente seguro entre el programa de escritorio y la interfaz: solo expone lo necesario.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fenix', {
  esEscritorio: true,
  /** Abre una URL https en el navegador del sistema. */
  abrirExterno: (url) => ipcRenderer.invoke('abrir-externo', url),
  /** Avisa cuando el navegador devuelve a la app con fenixapp://auth?… (inicio de sesión). */
  alVolverDelNavegador: (callback) => {
    const manejador = (_evento, url) => callback(url)
    ipcRenderer.on('auth-callback', manejador)
    return () => ipcRenderer.removeListener('auth-callback', manejador)
  },
})
