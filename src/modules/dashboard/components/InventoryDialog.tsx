import { useState } from 'react'
import {
  adminInventory,
  blockTickets,
  unblockTickets,
  exportInventory,
} from '../../raffles/services/server'
import { useAdminQuery, useAdminAction } from '../hooks/useAdmin'
import { labels, parseSelection } from '../lib/admin'
import { Feedback, ActionFeedback } from './Feedback'
import { AdminDialog } from './AdminDialog'
import type { AdminRaffle } from './RaffleEditor'

export function InventoryDialog({
  raffle,
  onClose,
}: {
  raffle: AdminRaffle
  onClose: () => void
}) {
  const [from, setFrom] = useState(raffle.startNumber),
    [search, setSearch] = useState(String(raffle.startNumber)),
    [selection, setSelection] = useState('')
  const [receipt, setReceipt] = useState('')
  const query = useAdminQuery('inventory', `${raffle.id}:${from}`, () =>
      adminInventory({ data: { id: raffle.id, from, limit: 100 } }),
    ),
    action = useAdminAction()
  const immutable = ['drawn', 'archived'].includes(raffle.status)
  async function bulk(blocked: boolean) {
    await action.run(async () => {
      const tickets = parseSelection(
        selection,
        raffle.startNumber,
        raffle.ticketCount,
      )
      const result = await (blocked ? blockTickets : unblockTickets)({
        data: { raffleId: raffle.id, tickets },
      })
      setSelection('')
      setReceipt(`${tickets.length} números actualizados por servidor`)
      return result
    }, 'Inventario actualizado.')
  }
  async function csv() {
    await action.run(async () => {
      const text = await exportInventory({ data: { id: raffle.id } })
      const url = URL.createObjectURL(
        new Blob([text], { type: 'text/csv;charset=utf-8' }),
      )
      const a = document.createElement('a')
      a.href = url
      a.download = `inventario-${raffle.id}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setReceipt(
        `${text.trim().split('\n').length - 1} filas exportadas sin datos personales.`,
      )
      return true
    }, 'CSV generado desde la base de datos.')
  }
  return (
    <AdminDialog label="Inventario" onClose={onClose} busy={action.busy}>
      <header>
        <h2>Inventario: {raffle.title}</h2>
        <button disabled={action.busy} onClick={onClose}>
          Cerrar
        </button>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void action.run(async () => {
            const n = parseSelection(
              search,
              raffle.startNumber,
              raffle.ticketCount,
            )
            if (n.length !== 1)
              throw new Error('Busca un único número inicial.')
            setFrom(n[0])
            setSelection('')
            setReceipt('')
            return true
          }, 'Página actualizada.')
        }}
      >
        <label>
          Buscar número (incluye 0)
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button>Buscar</button>
      </form>
      <Feedback pending={query.isPending} error={query.error} />
      <div className="ticket-grid">
        {query.data?.tickets.map((t) => (
          <button
            key={t.number}
            disabled={
              immutable ||
              action.busy ||
              !['available', 'blocked'].includes(t.state)
            }
            title={labels[t.state]}
            onClick={() =>
              setSelection((old) =>
                old ? `${old},${t.number}` : String(t.number),
              )
            }
          >
            {String(t.number).padStart(
              String(raffle.startNumber + raffle.ticketCount - 1).length,
              '0',
            )}{' '}
            · {labels[t.state]}
          </button>
        ))}
      </div>
      <div className="pagination">
        <button
          disabled={from <= raffle.startNumber}
          onClick={() => {
            setFrom(Math.max(raffle.startNumber, from - 100))
            setSelection('')
            setReceipt('')
          }}
        >
          Anterior
        </button>
        <button
          disabled={from + 100 >= raffle.startNumber + raffle.ticketCount}
          onClick={() => {
            setFrom(from + 100)
            setSelection('')
            setReceipt('')
          }}
        >
          Siguiente
        </button>
      </div>
      <label>
        Números o rangos, sin duplicados; máximo 1000
        <textarea
          disabled={immutable || action.busy}
          placeholder="0,2-10"
          value={selection}
          onChange={(e) => {
            setSelection(e.target.value)
            setReceipt('')
          }}
        />
      </label>
      <p>
        El servidor rechaza atómicamente toda selección que incluya vendidos,
        reservados o en revisión.
      </p>
      <button
        disabled={immutable || action.busy || !selection}
        onClick={() => void bulk(true)}
      >
        Bloquear
      </button>
      <button
        disabled={immutable || action.busy || !selection}
        onClick={() => void bulk(false)}
      >
        Desbloquear
      </button>
      <button disabled={action.busy} onClick={() => void csv()}>
        Descargar CSV real
      </button>
      <button
        disabled={action.busy}
        onClick={() => {
          setSelection('')
          setReceipt('')
          void query.refetch()
        }}
      >
        Actualizar y limpiar selección
      </button>
      <p role="status">{receipt}</p>
      <ActionFeedback {...action} />
    </AdminDialog>
  )
}
