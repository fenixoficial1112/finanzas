// Puente seguro entre el programa de escritorio y la interfaz: solo expone lo necesario.
const { contextBridge, ipcRenderer } = require('electron')

// Los errores de Electron llegan como "Error invoking remote method '…': Error: mensaje"; dejamos solo el mensaje.
const invocar = async (canal, ...args) => {
  try {
    return await ipcRenderer.invoke(canal, ...args)
  } catch (e) {
    throw new Error(String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  }
}

contextBridge.exposeInMainWorld('fenix', {
  esEscritorio: true,
  abrirExterno: (url) => invocar('abrir-externo', url),
  bd: {
    motor: () => invocar('bd:motor'),
    leer: () => invocar('bd:leer'),
    guardar: (bytes) => invocar('bd:guardar', bytes),
    ubicacion: () => invocar('bd:ubicacion'),
    abrirCarpeta: () => invocar('bd:abrir-carpeta'),
    exportar: (bytes) => invocar('bd:exportar', bytes),
    importar: () => invocar('bd:importar'),
  },
  asesor: {
    estado: () => invocar('asesor:estado'),
    guardarClave: (clave) => invocar('asesor:guardar-clave', clave),
    borrarClave: () => invocar('asesor:borrar-clave'),
    preguntar: (datos) => invocar('asesor:preguntar', datos),
  },
})
