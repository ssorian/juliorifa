import { useState } from 'react'
import { createRaffle, updateRaffle } from '../../raffles/services/server'
import { decimalCents, mexicoISO, mexicoInput } from '../lib/admin'
import { useAdminAction } from '../hooks/useAdmin'
import { ActionFeedback } from './Feedback'
import { AdminDialog } from './AdminDialog'
import { AdminImage } from './AdminImage'
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
    price: ((raffle?.priceCents ?? 100) / 100).toFixed(2),
    fee: String(raffle?.feeBps ?? 0),
    cost: ((raffle?.prizeCostCents ?? 0) / 100).toFixed(2),
    expenses: ((raffle?.expensesCents ?? 0) / 100).toFixed(2),
    count: String(raffle?.ticketCount ?? 100),
    start: String(raffle?.startNumber ?? 0),
    deadline: raffle ? mexicoInput(raffle.salesDeadline) : '',
    draw: raffle ? mexicoInput(raffle.drawAt) : '',
    status:
      raffle?.status === 'drawn' ? 'archived' : (raffle?.status ?? 'draft'),
  })
  const [features, setFeatures] = useState(raffle?.features ?? [])
  const action = useAdminAction()
  const immutable = raffle?.status === 'drawn' || raffle?.status === 'archived'
  function field(name: keyof typeof fields, value: string) {
    setFields((old) => ({ ...old, [name]: value }))
  }
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
    <AdminDialog label="Editor de rifa" onClose={onClose} busy={action.busy}>
      <header className="panel-heading">
        <h2>{saved ? 'Editar rifa' : 'Crear borrador'}</h2>
        <button disabled={action.busy} onClick={onClose}>
          Cerrar
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
        <fieldset disabled={action.busy || immutable}>
          <label>
            Título
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
          {(
            ['price', 'fee', 'cost', 'expenses', 'count', 'start'] as const
          ).map((name) => (
            <label key={name}>
              {
                {
                  price: 'Precio MXN por boleto',
                  fee: 'Fee bps (gasto administrativo; NO recargo)',
                  cost: 'Costo premio MXN',
                  expenses: 'Gastos MXN',
                  count: 'Cantidad de boletos',
                  start: 'Número inicial (0 permitido)',
                }[name]
              }
              <input
                required
                inputMode={
                  ['price', 'cost', 'expenses'].includes(name)
                    ? 'decimal'
                    : 'numeric'
                }
                value={fields[name]}
                onChange={(e) => field(name, e.target.value)}
              />
            </label>
          ))}
          <p>
            El backend impide renumerar rifas con historial, aunque sus compras
            estén canceladas.
          </p>
          <label>
            Cierre de ventas
            <input
              type="datetime-local"
              required
              value={fields.deadline}
              onChange={(e) => field('deadline', e.target.value)}
            />
          </label>
          <label>
            Fecha del sorteo
            <input
              type="datetime-local"
              required
              value={fields.draw}
              onChange={(e) => field('draw', e.target.value)}
            />
          </label>
          <p>
            Hora civil de Ciudad de México (UTC−06), normalizada a ISO UTC al
            guardar. Sorteo no anterior al cierre.
          </p>
          <h3>Características</h3>
          {features.map((f, i) => (
            <div key={i}>
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
                onClick={() =>
                  setFeatures((old) => old.filter((_, j) => j !== i))
                }
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={features.length >= 50}
            onClick={() =>
              setFeatures((old) => [...old, { title: '', description: '' }])
            }
          >
            Añadir característica
          </button>
          <h3>Biblioteca de esta rifa: imágenes verificadas del servidor</h3>
          {images.map((image) => (
            <div key={image.key}>
              <AdminImage url={image.mediaUrl} alt={image.alt} />
              <button
                type="button"
                onClick={() =>
                  setImages((old) => old.filter((i) => i.key !== image.key))
                }
              >
                Quitar adjunto al guardar
              </button>
            </div>
          ))}
          <label>
            Imágenes reales PNG/JPEG/WebP, máximo 2 MB cada una
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          <p>{files.map((f) => f.name).join(', ')}</p>
        </fieldset>
        <label>
          Estado
          <select
            disabled={action.busy}
            value={fields.status}
            onChange={(e) => field('status', e.target.value)}
          >
            {(immutable
              ? ['archived']
              : ['draft', 'active', 'scheduled', 'paused', 'closed', 'archived']
            ).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <p>
          Crear guarda primero un borrador, después adjunta imágenes verificadas
          y solo entonces publica si elegiste Activa. Archivar conserva compras
          e historial; no existe borrado definitivo.
        </p>
        <ActionFeedback {...action} />
        <button className="button primary" disabled={action.busy}>
          Guardar en servidor
        </button>
      </form>
    </AdminDialog>
  )
}
