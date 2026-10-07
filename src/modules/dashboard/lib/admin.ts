export const adminKey = (actorId: string, kind: string, id = '') =>
  ['private-admin', actorId, kind, id] as const
export function canRenderAdmin(
  user: { id: string; role: string } | null | undefined,
  identity: string | null,
) {
  return !!identity && user?.id === identity && user.role === 'admin'
}
export function canReview(order: {
  status: string
  proofReceivedAt: string | null
}) {
  return order.status === 'reviewing' && !!order.proofReceivedAt
}
export function decimalCents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error('Usa un importe positivo con máximo dos decimales.')
  const [whole, fraction = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new Error('Importe fuera de rango.')
  return cents
}
// Current Mexico City civil time is UTC−06; explicit offset avoids host/SSR timezone differences.
export function mexicoISO(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Fecha inválida.')
  const local = new Date(value + 'Z')
  if (
    !Number.isFinite(local.getTime()) ||
    local.toISOString().slice(0, 16) !== value
  )
    throw new Error('Fecha inválida.')
  return new Date(local.getTime() + 6 * 3600000).toISOString()
}
export function mexicoInput(iso: string) {
  return new Date(Date.parse(iso) - 6 * 3600000).toISOString().slice(0, 16)
}
export function parseSelection(value: string, start: number, count: number) {
  const numbers = new Set<number>()
  for (const part of value.split(',')) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim())
    if (!match)
      throw new Error('Usa números o rangos enteros separados por comas.')
    const from = Number(match[1]),
      to = Number(match.at(2) ?? match[1])
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < start ||
      to >= start + count ||
      from > to ||
      to - from >= 1000
    )
      throw new Error('Rango inválido; máximo 1000 números.')
    for (let n = from; n <= to; n++) {
      if (numbers.has(n))
        throw new Error('No repitas números ni superpongas rangos.')
      numbers.add(n)
      if (numbers.size > 1000) throw new Error('Máximo 1000 números.')
    }
  }
  return [...numbers].sort((a, b) => a - b)
}
export const labels: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activa',
  scheduled: 'Programada',
  paused: 'Pausada',
  closed: 'Cerrada',
  drawn: 'Sorteada',
  archived: 'Archivada',
  awaiting_proof: 'Pendiente de comprobante',
  reviewing: 'En revisión',
  paid: 'Pagada',
  rejected: 'Rechazada',
  expired: 'Vencida',
  cancelled: 'Cancelada',
  available: 'Disponible',
  blocked: 'Bloqueado',
  reserved: 'Reservado',
  sold: 'Vendido',
}
export function adminError(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  const messages: Record<string, string> = {
    BACKEND_UNAVAILABLE:
      'Servicio no disponible. Reintenta; no se mostraron datos ficticios.',
    FORBIDDEN: 'Sesión sin permiso administrativo.',
    UNAUTHORIZED: 'Verifica tu sesión.',
    PAYMENT_NOT_CONFIGURED:
      'Completa la configuración bancaria antes de aceptar reservas.',
    STORAGE_NOT_CONFIGURED:
      'Almacenamiento sin configurar. El borrador permanece disponible.',
    DEADLINE_PASSED: 'La fecha de venta ya pasó.',
    INVALID_RANGE: 'Rango fuera del inventario.',
    DRAWN_IMMUTABLE: 'El resultado y su historia son inmutables.',
    RAFFLE_IMMUTABLE: 'Esta rifa ya no admite cambios de inventario.',
    TICKET_UNAVAILABLE:
      'Los boletos ya no están disponibles. Actualiza el inventario.',
    DRAW_TOO_EARLY:
      'Todavía no llega la fecha del sorteo o el cierre de ventas. Actualiza después de la fecha indicada.',
    NUMBERING_IMMUTABLE:
      'No se puede renumerar una rifa con historial o boletos ocupados.',
    NO_CANDIDATES:
      'No hay boletos pagados para sortear. No se registra un ganador.',
    DRAW_NOT_DUE: 'Todavía no llega la fecha del sorteo.',
    UNRESOLVED_PURCHASES:
      'Hay compras pendientes o en revisión. Resuélvelas antes del sorteo.',
    NO_PAID_TICKETS: 'No hay boletos pagados para sortear.',
  }
  return (
    messages[code] ||
    code ||
    'No se pudo completar la operación. Actualiza y reintenta.'
  )
}
