import { useQuery } from '@tanstack/react-query'
import { ContactLinks } from './ContactLinks'
import { publicBusinessContact } from './contact-server'

export const publicContactKey = ['public-business-contact'] as const

export function PublicBusinessContact() {
  const query = useQuery({
    queryKey: publicContactKey,
    queryFn: () => publicBusinessContact({ data: {} }),
    staleTime: 0,
    refetchInterval: 30000,
  })
  if (query.isError) {
    return <p role="status">Contacto no disponible por ahora.</p>
  }
  return query.data ? <ContactLinks contact={query.data} /> : null
}
