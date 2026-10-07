import { DomainError } from '../../purchases/domain'

export function assertRole(actor:{id:string;role:string}|null,role:'client'|'admin') {
  if (!actor) throw new DomainError('UNAUTHORIZED')
  if (actor.role!==role) throw new DomainError('FORBIDDEN')
  return actor
}
export const publicStates = ['active','paused','scheduled','closed','drawn'] as const
export function isPublic(state:string) { return (publicStates as readonly string[]).includes(state) }
export function assertBlockable(states:string[]) {
  if(states.some(s=>s!=='blocked')) throw new DomainError('TICKET_UNAVAILABLE')
}
export function assertNumbering(previous:number,next:number,history:boolean,occupied:number[],previousStart=1,nextStart=1) {
  if ((history && (next!==previous || nextStart!==previousStart)) || occupied.some(n=>n<nextStart || n>=nextStart+next)) throw new DomainError('NUMBERING_IMMUTABLE')
}
