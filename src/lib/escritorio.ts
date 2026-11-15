// Integración con el programa de escritorio (Electron). En el navegador, todo esto queda inactivo.

interface PuenteEscritorio {
  esEscritorio: true
  abrirExterno: (url: string) => Promise<void>
  alVolverDelNavegador: (callback: (url: string) => void) => () => void
}

declare global {
  interface Window {
    fenix?: PuenteEscritorio
  }
}

export const escritorio: PuenteEscritorio | null = typeof window !== 'undefined' ? window.fenix ?? null : null

/** Adónde vuelve el usuario después de entrar con Google o de abrir un enlace del correo. */
export function urlRetorno(): string {
  return escritorio ? 'fenixapp://auth' : window.location.origin
}
