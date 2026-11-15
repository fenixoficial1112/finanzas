import { useEffect, useState } from 'react'
import { escritorio, type EstadoActualizacion } from './escritorio'

/** Estado de las actualizaciones automáticas del programa (null en el navegador). */
export function useActualizacion(): EstadoActualizacion | null {
  const [estado, setEstado] = useState<EstadoActualizacion | null>(null)
  useEffect(() => {
    if (!escritorio) return
    escritorio.app.estadoActualizacion().then(setEstado).catch(() => undefined)
    return escritorio.app.alActualizar(setEstado)
  }, [])
  return estado
}
