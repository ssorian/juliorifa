import { useEffect, useRef, useState } from 'react'
import { seed } from '../model'
import { parseStore, saveSnapshot } from '../lib/storage'
import type { Store } from '../model'

const KEY = 'nova-react-demo-v1'
export function useStore() {
  const [store, setStore] = useState<Store>(seed),
    [notice, setNotice] = useState('')
  const snapshot = useRef<string | null>(null)
  const ready = useRef(false)
  useEffect(() => {
    function load(raw: string | null) {
      snapshot.current = raw
      try {
        setStore(raw ? parseStore(raw) : seed)
        setNotice(raw ? 'Datos locales cargados.' : '')
      } catch {
        setStore(seed)
        setNotice('Datos locales inválidos: se usa la demo inicial.')
      }
    }
    try {
      load(localStorage.getItem(KEY))
    } catch {
      setNotice('Almacenamiento no disponible: demo solo en esta sesión.')
    }
    ready.current = true
    function onStorage(event: StorageEvent) {
      if (
        event.storageArea === localStorage &&
        (event.key === KEY || event.key === null)
      )
        load(event.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  function save(next: Store) {
    if (!ready.current) {
      setNotice('Espera a que se carguen los datos locales.')
      return false
    }
    let valid: Store
    try {
      valid = parseStore(JSON.stringify(next))
    } catch {
      setNotice('No se guardó: configuración o inventario inválidos.')
      return false
    }
    try {
      const current = localStorage.getItem(KEY)
      if (current !== snapshot.current) {
        snapshot.current = current
        try {
          setStore(current ? parseStore(current) : seed)
        } catch {
          setStore(seed)
        }
        setNotice(
          'Otra pestaña modificó los datos. Revisa los cambios y vuelve a intentar; no se sobrescribieron.',
        )
        return false
      }
      const raw = saveSnapshot(localStorage, KEY, valid, snapshot.current)
      snapshot.current = raw
      setStore(valid)
      setNotice('Guardado en este navegador.')
      return true
    } catch {
      setNotice(
        'No se pudo guardar: almacenamiento deshabilitado o sin espacio. Los datos anteriores se conservan.',
      )
      return false
    }
  }
  return { store, save, notice }
}
