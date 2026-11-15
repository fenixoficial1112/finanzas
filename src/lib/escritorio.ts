// Integración con el programa de escritorio (Electron). En el navegador, todo esto queda inactivo.

export interface PuenteEscritorio {
  esEscritorio: true
  /** Abre una URL https en el navegador del sistema. */
  abrirExterno: (url: string) => Promise<void>
  bd: {
    /** Motor SQLite (WebAssembly). */
    motor: () => Promise<Uint8Array>
    /** Contenido del archivo de datos, o null si es la primera vez. */
    leer: () => Promise<Uint8Array | null>
    /** Guarda el archivo de datos en el disco (y hace la copia de seguridad del día). */
    guardar: (bytes: Uint8Array) => Promise<void>
    /** Carpeta y archivo donde se guardan los datos. */
    ubicacion: () => Promise<{ carpeta: string; archivo: string; respaldos: string; cantidadRespaldos: number }>
    abrirCarpeta: () => Promise<void>
    /** Pide dónde guardar una copia y la escribe. Devuelve la ruta o null si se canceló. */
    exportar: (bytes: Uint8Array) => Promise<string | null>
    /** Pide un archivo de copia y devuelve su contenido (null si se canceló). */
    importar: () => Promise<Uint8Array | null>
  }
  asesor: {
    estado: () => Promise<{ tieneClave: boolean; cifrado: boolean }>
    guardarClave: (clave: string) => Promise<void>
    borrarClave: () => Promise<void>
    preguntar: (datos: {
      historial: { rol: 'user' | 'assistant'; contenido: string }[]
      mensaje: string
      contexto: unknown
    }) => Promise<{ respuesta: string; tokensEntrada: number; tokensSalida: number }>
  }
}

declare global {
  interface Window {
    fenix?: PuenteEscritorio
  }
}

export const escritorio: PuenteEscritorio | null = typeof window !== 'undefined' ? window.fenix ?? null : null
