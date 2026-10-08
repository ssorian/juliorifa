import { useState } from 'react'

export function AdminImage({ url, alt }: { url?: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  return !url || failed ? (
    <span
      className="image-unavailable"
      role="img"
      aria-label={`${alt}: imagen no disponible`}
    >
      N
    </span>
  ) : (
    <img
      src={url}
      alt={alt}
      width="96"
      height="96"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
