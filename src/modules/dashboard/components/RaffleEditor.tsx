import { useEffect, useRef, useState } from 'react'
import { createRaffle, updateRaffle } from '../../raffles/services/server'
import { decimalCents, mexicoISO, mexicoInput } from '../lib/admin'
import { useAdminAction } from '../hooks/useAdmin'
import { ActionFeedback } from './Feedback'
import { AdminDialog } from './AdminDialog'
import { RaffleEditorPreview } from './RaffleEditorPreview'
import { editorSummary, statusLabel } from '../lib/raffle-editor'
import type { z } from 'zod'
import type { raffleInput } from '../../raffles/schemas/backend'

export type AdminRaffle = Awaited<ReturnType<typeof createRaffle>>
export function RaffleEditor({
  raffle,
  onClose,
}: {
  raffle: AdminRaffle | null
  onClose: () => void
}) {
  const [saved, setSaved] = useState(raffle)
  const [files, setFiles] = useState<File[]>([])
  const [images, setImages] = useState(raffle?.images ?? [])
  const [fields, setFields] = useState({
    title: raffle?.title ?? '',
    description: raffle?.description ?? '',
    price: ((raffle?.priceCents ?? 2500) / 100).toFixed(2),
    fee: String(raffle?.feeBps ?? 0),
    cost: ((raffle?.prizeCostCents ?? 0) / 100).toFixed(2),
    expenses: ((raffle?.expensesCents ?? 0) / 100).toFixed(2),
    count: String(raffle?.ticketCount ?? 10000),
    start: String(raffle?.startNumber ?? 0),
    deadline: raffle ? mexicoInput(raffle.salesDeadline) : '',
    draw: raffle ? mexicoInput(raffle.drawAt) : '',
    status:
      raffle?.status === 'drawn' ? 'archived' : (raffle?.status ?? 'draft'),
  })
  const [features, setFeatures] = useState(raffle?.features ?? [])
  const [localImages, setLocalImages] = useState<{ file: File; url: string }[]>(
    [],
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [imageError, setImageError] = useState('')
  const objectURLs = useRef(new Map<File, string>())
  useEffect(() => {
    const urls = objectURLs.current
    for (const [file, url] of urls) {
      if (!files.includes(file)) {
        URL.revokeObjectURL(url)
        urls.delete(file)
      }
    }
    setLocalImages(
      files.map((file) => {
        const url = urls.get(file) ?? URL.createObjectURL(file)
        urls.set(file, url)
        return { file, url }
      }),
    )
  }, [files])
  useEffect(
    () => () => {
      for (const url of objectURLs.current.values()) URL.revokeObjectURL(url)
      objectURLs.current.clear()
    },
    [],
  )
  const action = useAdminAction()
  const immutable = raffle?.status === 'drawn' || raffle?.status === 'archived'
  function field(name: keyof typeof fields, value: string) {
    setFields((old) => ({ ...old, [name]: value }))
  }
  function addFiles(incoming: File[]) {
    if (action.busy || immutable) return
    const valid = incoming.filter(
      (file) =>
        ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) &&
        file.size > 0 &&
        file.size <= 2097152,
    )
    setImageError(
      valid.length !== incoming.length
        ? 'Imagen inválida: PNG/JPEG/WebP de hasta 2 MB.'
        : '',
    )
    setFiles((old) => [...old, ...valid])
  }
  const thumbnails = [
    ...images.map((image) => ({
      id: image.key,
      url: image.mediaUrl,
      alt: image.alt,
    })),
    ...localImages.map(({ file, url }) => ({ id: url, url, alt: file.name })),
  ]
  const preview =
    thumbnails.find((image) => image.id === selected) ?? thumbnails.at(0)
  async function save() {
    await action.run(async () => {
      const data: z.infer<typeof raffleInput> = {
        title: fields.title,
        description: fields.description,
        priceCents: decimalCents(fields.price),
        feeBps: Number(fields.fee),
        prizeCostCents: decimalCents(fields.cost),
        expensesCents: decimalCents(fields.expenses),
        ticketCount: Number(fields.count),
        startNumber: Number(fields.start),
        salesDeadline:
          saved && fields.deadline === mexicoInput(saved.salesDeadline)
            ? saved.salesDeadline
            : mexicoISO(fields.deadline),
        drawAt:
          saved && fields.draw === mexicoInput(saved.drawAt)
            ? saved.drawAt
            : mexicoISO(fields.draw),
        status: fields.status,
        features,
        images: images.map(({ key, alt }) => ({ key, alt })),
      }
      let current = saved
      if (!current) {
        current = await createRaffle({
          data: { ...data, status: 'draft', images: [] },
        })
        setSaved(current)
        await action.refresh()
      }
      if (
        saved &&
        JSON.stringify(current.images.map((i) => i.key)) !==
          JSON.stringify(images.map((i) => i.key))
      ) {
        current = await updateRaffle({
          data: {
            ...data,
            id: current.id,
            status: current.status === 'draft' ? 'draft' : data.status,
          },
        })
        setSaved(current)
      }
      // An existing UUID is retained after every successful step, including partial failures.
      for (const file of files) {
        if (
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
          file.size > 2097152 ||
          !file.size
        )
          throw new Error(
            'Imagen inválida: PNG/JPEG/WebP de hasta 2 MB. El borrador permanece guardado.',
          )
        const response = await fetch(`/api/uploads/images/${current.id}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        if (!response.ok)
          throw new Error(
            `No se pudo subir ${file.name}. Rifa ${current.id} guardada; reintenta desde el borrador.`,
          )
        const asset: { key: string } = await response.json()
        current = await updateRaffle({
          data: {
            ...data,
            id: current.id,
            status: current.status === 'draft' ? 'draft' : data.status,
            images: [
              ...current.images.map(({ key, alt }) => ({ key, alt })),
              { key: asset.key, alt: file.name.slice(0, 200) },
            ],
          },
        })
        setSaved(current)
        setImages(current.images)
        setFiles((old) => old.filter((f) => f !== file))
        await action.refresh()
      }
      current = await updateRaffle({
        data: {
          ...data,
          id: current.id,
          images: current.images.map(({ key, alt }) => ({ key, alt })),
        },
      })
      setSaved(current)
      return current
    }, 'Rifa guardada en servidor.')
  }
  return (
    <AdminDialog
      className="raffle-editor editor-dialog"
      label="Editor de rifa"
      onClose={onClose}
      busy={action.busy}
    >
      <header className="dialog-header">
        <div>
          <p className="small-eyebrow">// EDITOR DE RIFAS</p>
          <h2>{saved ? 'Editar rifa' : 'Crear nueva rifa'}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Cerrar"
          disabled={action.busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {saved && (
        <p>
          Rifa guardada: {saved.id}. Si una imagen falla puedes cerrar y
          reintentar; no se elimina el borrador.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="editor-layout">
          <div className="editor-fields">
            <fieldset disabled={action.busy || immutable}>
              <section className="form-section">
                <h3>
                  <span>01</span>Producto y contenido
                </h3>
                <label>
                  Nombre del producto
                  <input
                    required
                    maxLength={200}
                    value={fields.title}
                    onChange={(e) => field('title', e.target.value)}
                  />
                </label>
                <label>
                  Descripción
                  <textarea
                    value={fields.description}
                    onChange={(e) => field('description', e.target.value)}
                  />
                </label>
                <h4>Imagen del producto</h4>
                <label
                  className="upload-zone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    addFiles(Array.from(e.dataTransfer.files))
                  }}
                >
                  <div>
                    <strong>Sube una imagen o arrástrala aquí</strong>
                    <span>PNG, JPG o WebP · Máximo 2 MB</span>
                  </div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="file-input"
                    aria-label="Imágenes reales PNG/JPEG/WebP, máximo 2 MB cada una"
                    onChange={(e) => {
                      addFiles(Array.from(e.target.files ?? []))
                      e.target.value = ''
                    }}
                  />
                </label>
                {imageError && <p role="alert">{imageError}</p>}
                <div className="image-library">
                  {thumbnails.map((image) => (
                    <div key={image.id}>
                      <button
                        type="button"
                        aria-label={`Seleccionar ${image.alt}`}
                        aria-pressed={preview?.id === image.id}
                        className={preview?.id === image.id ? 'selected' : ''}
                        onClick={() => setSelected(image.id)}
                      >
                        <img src={image.url} alt={image.alt} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Quitar ${image.alt}`}
                        onClick={() => {
                          setImages((old) =>
                            old.filter((item) => item.key !== image.id),
                          )
                          setFiles((old) =>
                            old.filter(
                              (file) =>
                                !localImages.some(
                                  (item) =>
                                    item.file === file && item.url === image.id,
                                ),
                            ),
                          )
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="field-row">
                  <h4>Características</h4>
                  <button
                    type="button"
                    disabled={features.length >= 50}
                    onClick={() =>
                      setFeatures((old) => [
                        ...old,
                        { title: '', description: '' },
                      ])
                    }
                  >
                    Añadir característica
                  </button>
                </div>
                {features.map((f, i) => (
                  <div className="feature-row" key={i}>
                    <input
                      aria-label={`Característica ${i + 1}`}
                      value={f.title}
                      onChange={(e) =>
                        setFeatures((old) =>
                          old.map((x, j) =>
                            j === i ? { ...x, title: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label={`Detalle ${i + 1}`}
                      value={f.description}
                      onChange={(e) =>
                        setFeatures((old) =>
                          old.map((x, j) =>
                            j === i ? { ...x, description: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Quitar característica ${i + 1}`}
                      onClick={() =>
                        setFeatures((old) => old.filter((_, j) => j !== i))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </section>
              <section className="form-section">
                <h3>
                  <span>02</span>Fecha y estado
                </h3>
                <div className="form-grid">
                  <label>
                    Fecha del sorteo
                    <input
                      type="datetime-local"
                      required
                      value={fields.draw}
                      onChange={(e) => field('draw', e.target.value)}
                    />
                  </label>
                  <label>
                    Estado
                    <select
                      value={fields.status}
                      onChange={(e) => field('status', e.target.value)}
                    >
                      {(immutable
                        ? ['archived']
                        : [
                            'draft',
                            'active',
                            'scheduled',
                            'paused',
                            'closed',
                            'archived',
                          ]
                      ).map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cierre de ventas
                    <input
                      type="datetime-local"
                      required
                      value={fields.deadline}
                      onChange={(e) => field('deadline', e.target.value)}
                    />
                  </label>
                </div>
                <p className="field-help">
                  Hora civil de Ciudad de México (UTC−06), normalizada a ISO UTC
                  al guardar. Sorteo no anterior al cierre.
                </p>
              </section>
              <section className="form-section">
                <h3>
                  <span>03</span>Configuración de boletos
                </h3>
                <div className="form-grid">
                  {(['price', 'count', 'start'] as const).map((name) => (
                    <label key={name}>
                      {
                        {
                          price: 'Precio MXN por boleto',
                          count: 'Cantidad de boletos',
                          start: 'Número inicial (0 permitido)',
                        }[name]
                      }
                      <input
                        required
                        inputMode={name === 'price' ? 'decimal' : 'numeric'}
                        value={fields[name]}
                        onChange={(e) => field(name, e.target.value)}
                      />
                    </label>
                  ))}
                  <div className="numbering-preview">
                    <span>Rango de números</span>
                    <strong>
                      {
                        editorSummary(
                          fields.price,
                          fields.count,
                          fields.start,
                          fields.cost,
                          fields.expenses,
                        ).range
                      }
                    </strong>
                  </div>
                </div>
                <p className="field-help">
                  Los boletos comienzan disponibles. El backend impide renumerar
                  rifas con historial, aunque sus compras estén canceladas.
                </p>
              </section>
              <section className="form-section">
                <h3>
                  <span>04</span>Costos de la rifa
                </h3>
                <div className="form-grid">
                  {(['cost', 'expenses'] as const).map((name) => (
                    <label key={name}>
                      {name === 'cost' ? 'Costo premio MXN' : 'Gastos MXN'}
                      <input
                        required
                        inputMode="decimal"
                        value={fields[name]}
                        onChange={(e) => field(name, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <details>
                  <summary>Opcionales avanzados</summary>
                  <label>
                    Fee bps (gasto administrativo; NO recargo)
                    <input
                      required
                      inputMode="numeric"
                      value={fields.fee}
                      onChange={(e) => field('fee', e.target.value)}
                    />
                  </label>
                </details>
              </section>
            </fieldset>

            <p>
              Crear guarda primero un borrador, después adjunta imágenes
              verificadas y solo entonces publica si elegiste Activa. Archivar
              conserva compras e historial; no existe borrado definitivo.
            </p>
            <ActionFeedback {...action} />
          </div>
          <RaffleEditorPreview fields={fields} image={preview} />
        </div>
        <footer className="dialog-footer">
          <button type="button" disabled={action.busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={action.busy}>
            Guardar rifa
          </button>
        </footer>
      </form>
    </AdminDialog>
  )
}
