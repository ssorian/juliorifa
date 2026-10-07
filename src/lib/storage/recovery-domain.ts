export function canClean(
  asset: {
    kind: string
    status: string
    createdAt: number
    leaseUntil: number | null
    proofAttached: boolean
    imageAttached: boolean
  },
  now: number,
) {
  if (
    now - asset.createdAt <= 86400000 ||
    asset.proofAttached ||
    asset.imageAttached ||
    (asset.leaseUntil !== null && asset.leaseUntil > now)
  )
    return false
  if (asset.status === 'verified') return asset.kind === 'image'
  return ['pending', 'orphan', 'cleaning'].includes(asset.status)
}
