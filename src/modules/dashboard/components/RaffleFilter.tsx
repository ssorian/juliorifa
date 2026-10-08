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
    <div className="raffle-filter">
      <select
        aria-label="Filtrar por rifa"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
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
      <Feedback error={query.error} />
      {(page > 0 || query.data?.length === 100) && (
        <Pager
          page={page}
          setPage={setPage}
          hasNext={query.data?.length === 100}
        />
      )}
    </div>
  )
}
