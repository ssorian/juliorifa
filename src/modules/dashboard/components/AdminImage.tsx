import { useState } from 'react'

export function AdminImage({ url, alt }: { url: string; alt: string }) {
  const [state, setState] = useState('loading')
  return (
    <>
      {state === 'loading' && <span>Cargando imagen…</span>}
      {state === 'error' ? (
        <span>Imagen no disponible</span>
      ) : (
        <img
          src={url}
          alt={alt}
          width="96"
          height="96"
          loading="lazy"
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
        />
      )}
    </>
  )
}
