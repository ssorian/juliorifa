import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function AdminDialog({
  label,
  onClose,
  busy,
  children,
  className = '',
}: {
  label: string
  onClose: () => void
  busy: boolean
  children: ReactNode
  className?: string
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
      className={`panel react-dialog ${className}`}
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
