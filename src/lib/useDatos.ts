import { useCallback, useEffect, useState } from 'react'

/** Carga datos asíncronos y permite recargarlos después de guardar. */
export function useDatos<T>(cargar: () => Promise<T>, deps: unknown[]) {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cargarMemo = useCallback(cargar, deps)

  useEffect(() => {
    let vigente = true
    cargarMemo()
      .then((d) => {
        if (vigente) {
          setDatos(d)
          setError(null)
        }
      })
      .catch((e: unknown) => vigente && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      vigente = false
    }
  }, [cargarMemo, version])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  return { datos, error, cargando: datos === null && error === null, recargar }
}
