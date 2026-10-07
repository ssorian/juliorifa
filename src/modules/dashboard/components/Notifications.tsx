import { useState } from 'react'
import {
  adminOutboxStatus,
  adminOutboxCounts,
  retryOutboxEvent,
} from '../../notifications/server'
import { useAdminQuery, useAdminAction } from '../hooks/useAdmin'
import { Feedback, Pager, ActionFeedback } from './Feedback'

function label(status: string, attempts: number) {
  return status === 'sent'
    ? 'Enviado'
    : status === 'dead'
      ? 'Deadletter'
      : status === 'leased'
        ? 'En proceso'
        : attempts > 0
          ? 'Reintento'
          : 'Pendiente'
}
export function Notifications() {
  const [page, setPage] = useState(0),
    [filter, setFilter] = useState('all')
  const query = useAdminQuery('outbox', String(page), () =>
      adminOutboxStatus({ data: { offset: page * 20, limit: 20 } }),
    ),
    counts = useAdminQuery('outbox-counts', '', () => adminOutboxCounts()),
    action = useAdminAction()
  const countData = counts.data
  const rows = query.data?.filter(
    (r) => filter === 'all' || label(r.status, r.attempts) === filter,
  )
  return (
    <section className="panel">
      <h2>Notificaciones (outbox durable)</h2>
      <p>
        Confirmar pagos o sorteos encola una notificación; un fallo de entrega
        nunca revierte el pago ni el resultado. Jobs no se ejecutan desde esta
        pantalla.
      </p>
      <p>
        Activación separada documentada en docs/backend.md: cron +
        JOBS_ENABLED=true y confirmación explícita. No habilitados
        automáticamente.
      </p>
      <Feedback pending={counts.isPending} error={counts.error} />
      <dl>
        {countData &&
          ['Pendiente', 'En proceso', 'Enviado', 'Reintento', 'Deadletter'].map(
            (s) => (
              <div key={s}>
                <dt>{s}</dt>
                <dd>
                  {countData
                    .filter((c) => label(c.status, c.attempts) === s)
                    .reduce((sum, c) => sum + c.total, 0)}
                </dd>
              </div>
            ),
          )}
      </dl>
      <label>
        Estado en esta página
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {[
            'all',
            'Pendiente',
            'En proceso',
            'Enviado',
            'Reintento',
            'Deadletter',
          ].map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'Todos' : s}
            </option>
          ))}
        </select>
      </label>
      <Feedback
        pending={query.isPending}
        error={query.error}
        empty={rows?.length === 0}
      />
      {rows && (
        <table>
          <thead>
            <tr>
              <th>Evento</th>
              <th>Estado</th>
              <th>Intentos</th>
              <th>Entrega / disponibilidad</th>
              <th>Error</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.event}
                  <br />
                  {r.id}
                </td>
                <td>{label(r.status, r.attempts)}</td>
                <td>{r.attempts}</td>
                <td>{r.sentAt ?? r.availableAt}</td>
                <td>{r.lastError ?? '—'}</td>
                <td>
                  <button
                    disabled={
                      action.busy || !['ready', 'dead'].includes(r.status)
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          'Reencolar el mismo evento sin enviar correo ahora?',
                        )
                      )
                        void action.run(
                          () => retryOutboxEvent({ data: { id: r.id } }),
                          'Evento reencolado. La entrega depende del worker autorizado.',
                        )
                    }}
                  >
                    Reintentar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager
        page={page}
        setPage={setPage}
        hasNext={query.data?.length === 20}
      />
      <ActionFeedback {...action} />
    </section>
  )
}
