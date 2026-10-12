import { labels } from './admin'

export function purchaseDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'No disponible'
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23',
  }).format(new Date(value))
}

export function purchaseEvent(type: string) {
  return ({ reserved: 'Apartado creado', reviewing: 'Comprobante recibido',
    expired: 'Apartado vencido', paid: 'Pago confirmado', rejected: 'Compra rechazada',
    cancelled: 'Compra cancelada', proof_received: 'Comprobante recibido',
  } as Record<string, string>)[type] ?? labels[type] ?? type
}

export function purchaseReason(reason: string | null) {
  return reason === 'proof_received' ? 'Comprobante recibido para revisión manual.' : reason ?? 'Sin motivo registrado'
}
