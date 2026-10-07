import { DomainError } from '../../purchases/domain'

export function assertImageAttachment(
  asset:
    | {
        kind: string
        key: string
        status: string
        ownerId: string
        raffleId: string | null
        purchaseId: string | null
        verifiedAt: Date | null
      }
    | undefined,
  raffleId: string,
  actorId: string,
) {
  if (
    !asset ||
    asset.kind !== 'image' ||
    asset.status !== 'verified' ||
    !asset.verifiedAt ||
    asset.ownerId !== actorId ||
    asset.raffleId !== raffleId ||
    asset.purchaseId !== null ||
    !/^images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      asset.key,
    )
  )
    throw new DomainError('INVALID_IMAGE_ASSET')
}
