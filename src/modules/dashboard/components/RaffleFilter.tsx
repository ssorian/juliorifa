import { useState } from 'react'
import { adminRaffles } from '../../raffles/services/server'
import { useAdminQuery } from '../hooks/useAdmin'
import { Feedback, Pager } from './Feedback'

export function RaffleFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [page, setPage] = useState(0)
  const query = useAdminQuery('raffle-options', String(page), () =>
    adminRaffles({ data: { offset: page * 100, limit: 100 } }),
  )
  return (
    <div>
      <label>
        Filtrar por rifa
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Todas las rifas</option>
          {value && !query.data?.some((r) => r.id === value) && (
            <option value={value}>{value}</option>
          )}
          {query.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      <Feedback error={query.error} />
      <Pager
        page={page}
        setPage={setPage}
        hasNext={query.data?.length === 100}
      />
    </div>
  )
}
