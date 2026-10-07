import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function AdminDialog({
  label,
  onClose,
  busy,
  children,
}: {
  label: string
  onClose: () => void
  busy: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="panel react-dialog"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      {children}
    </dialog>
  )
}
