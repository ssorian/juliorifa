export function parseTicket(
  raw: string,
  start: number,
  count: number,
): number | null {
  if (!/^\d{1,10}$/.test(raw.trim())) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n >= start && n < start + count ? n : null
}
export function ticketLabel(n: number, start: number, count: number) {
  return String(n).padStart(Math.max(4, String(start + count - 1).length), '0')
}
export function revalidatePicks(
  picks: number[],
  start: number,
  count: number,
  available: Set<number>,
  open: boolean,
) {
  return open
    ? [...new Set(picks)]
        .filter(
          (n) =>
            Number.isSafeInteger(n) &&
            n >= start &&
            n < start + count &&
            available.has(n),
        )
        .slice(0, 1000)
    : []
}
export function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  const messages: Record<string, string> = {
    TICKET_UNAVAILABLE:
      'Algunos boletos ya no están disponibles. Actualiza el inventario y revisa tu selección; no se creó un apartado parcial.',
    PAYMENT_NOT_CONFIGURED:
      'Las instrucciones bancarias aún no están configuradas. No se creó el apartado.',
    BACKEND_UNAVAILABLE: 'El servicio no está disponible. Intenta nuevamente.',
    UNAUTHORIZED: 'Ingresa para continuar.',
    FORBIDDEN: 'Tu sesión no permite esta operación.',
    STORAGE_NOT_CONFIGURED:
      'El almacenamiento aún no está configurado. No se recibió el comprobante.',
    EXPIRED: 'El plazo venció. Actualiza el apartado.',
    RESERVATION_EXPIRED:
      'El plazo venció. No se recibió el comprobante; actualiza el apartado.',
    CANNOT_UPLOAD_PROOF:
      'El estado actual no permite subir comprobante. Actualiza el apartado.',
    FILE_TOO_LARGE: 'El comprobante supera el máximo de 10 MB.',
    INVALID_FILE: 'El formato del comprobante no es válido.',
    NOT_FOUND:
      'No encontramos este recurso o no está disponible para tu sesión.',
    SALES_CLOSED: 'La venta está cerrada. Actualiza la rifa.',
    RATE_LIMITED: 'Demasiados intentos. Espera un minuto y vuelve a intentar.',
  }
  return (
    messages[code] ||
    'No se pudo completar la operación. Actualiza y vuelve a intentar.'
  )
}
