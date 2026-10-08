export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    active: 'Activa',
    scheduled: 'Programada',
    paused: 'Pausada',
    closed: 'Cerrada',
    drawn: 'Sorteada',
    archived: 'Archivada',
  }
  return labels[status] ?? status
}

export function editorSummary(
  price: string,
  quantity: string,
  initial: string,
  prize: string,
  expenses: string,
) {
  const count = Number(quantity)
  const start = Number(initial)
  const end = start + count - 1
  const valid =
    Number.isSafeInteger(count) &&
    count > 0 &&
    Number.isSafeInteger(start) &&
    start >= 0 &&
    Number.isSafeInteger(end)
  const width = Math.max(String(end).length, 1)
  const amount = (value: string) =>
    Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0
  return {
    range: valid
      ? `${String(start).padStart(width, '0')} — ${String(end).padStart(width, '0')}`
      : 'Rango inválido',
    count: valid ? count : 0,
    gross: amount(price) * (valid ? count : 0),
    costs: amount(prize) + amount(expenses),
  }
}
