import { useEffect, useRef, useState } from 'react'
import { proofSelectionError } from '../lib/proof-selection'

export function ProofUpload({
  busy,
  onSend,
}: {
  busy: boolean
  onSend: (file: File) => Promise<boolean>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(
    null,
  )
  const [error, setError] = useState('')
  const sending = useRef(false)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!file || file.type === 'application/pdf') {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])
  async function send() {
    if (!file || busy || sending.current) return
    sending.current = true
    setPending(true)
    try {
      if (await onSend(file)) setFile(null)
    } finally {
      sending.current = false
      setPending(false)
    }
  }
  return (
    <section className="proof-upload">
      <label>
        Subir comprobante (PNG, JPEG, WebP o PDF; máximo 10 MB)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          disabled={busy || pending}
          onChange={(event) => {
            const selected = event.target.files?.[0]
            event.target.value = ''
            if (!selected) return
            const invalid = proofSelectionError(selected)
            setError(invalid || '')
            setFile(invalid ? null : selected)
          }}
        />
      </label>
      {file && (
        <>
          <p>
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </p>
          {preview?.file === file && (
            <img
              src={preview.url}
              alt="Vista previa del comprobante seleccionado"
              style={{ maxWidth: '100%', maxHeight: 240 }}
            />
          )}
          {file.type === 'application/pdf' && (
            <p>
              PDF seleccionado. Vista previa no disponible; revisa el archivo
              original antes de enviar.
            </p>
          )}
          <button disabled={busy || pending} onClick={() => setFile(null)}>
            Quitar archivo
          </button>
          <button disabled={busy || pending} onClick={() => void send()}>
            Enviar comprobante
          </button>
          <p>
            Seleccionar un archivo no lo envía. El pago requiere revisión
            manual.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
