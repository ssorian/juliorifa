import { useEffect, useState } from 'react'

export function ProofPreview({ id }: { id: string }) {
  const [preview, setPreview] = useState<{ url: string; mime: string } | null>(
    null,
  )
  const [error, setError] = useState('')
  useEffect(() => {
    const abort = new AbortController()
    let objectUrl: string | undefined
    setPreview(null)
    setError('')
    void (async () => {
      try {
        const response = await fetch(`/api/media/proofs/${id}`, {
          credentials: 'same-origin',
          signal: abort.signal,
          cache: 'no-store',
        })
        if (!response.ok)
          throw new Error('No se pudo cargar el comprobante privado.')
        const blob = await response.blob()
        if (
          ![
            'image/png',
            'image/jpeg',
            'image/webp',
            'application/pdf',
          ].includes(blob.type)
        )
          throw new Error('Formato de comprobante no permitido.')
        if (abort.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setPreview({ url: objectUrl, mime: blob.type })
      } catch (failure) {
        if (!abort.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : 'No se pudo cargar el comprobante.',
          )
      }
    })()
    return () => {
      abort.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])
  return (
    <section className="proof-preview">
      <h3>Comprobante subido</h3>
      {error ? (
        <p role="alert">{error}</p>
      ) : !preview ? (
        <p role="status">Cargando comprobante…</p>
      ) : preview.mime === 'application/pdf' ? (
        <object
          data={preview.url}
          type="application/pdf"
          aria-label="Comprobante PDF"
        >
          <p>Tu navegador no puede mostrar el PDF. Usa la descarga.</p>
        </object>
      ) : (
        <img
          src={preview.url}
          alt="Comprobante de transferencia subido por el comprador"
        />
      )}
      <a
        className="button ghost"
        href={`/api/media/proofs/${id}`}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
      >
        Abrir / descargar comprobante privado
      </a>
    </section>
  )
}
