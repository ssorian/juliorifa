export function proofSelectionError(file: { type: string; size: number }) {
  return ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(
    file.type,
  ) &&
    file.size > 0 &&
    file.size <= 10 * 1024 * 1024
    ? null
    : 'Selecciona PNG, JPEG, WebP o PDF, máximo 10 MB.'
}
