function copyWithSelection(text: string): boolean {
  if (typeof document === 'undefined') return false
  const focus = document.activeElement
  const selection = document.getSelection()
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) =>
        selection.getRangeAt(i).cloneRange(),
      )
    : []
  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true
  field.style.position = 'fixed'
  field.style.opacity = '0'
  try {
    document.body.appendChild(field)
    field.select()
    return document.execCommand('copy') === true
  } finally {
    field.remove()
    if (focus instanceof HTMLElement) focus.focus({ preventScroll: true })
    selection?.removeAllRanges()
    for (const range of ranges) selection?.addRange(range)
  }
}

export async function copyText(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = typeof navigator ===
  'undefined'
    ? undefined
    : navigator.clipboard,
  fallback: (text: string) => boolean = copyWithSelection,
): Promise<boolean> {
  try {
    if (clipboard) {
      await clipboard.writeText(text)
      return true
    }
  } catch {
    // A denied native API may still allow copying the user's selection.
  }
  try {
    return fallback(text) === true
  } catch {
    return false
  }
}
