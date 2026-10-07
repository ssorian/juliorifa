import { createHash, randomInt } from 'node:crypto'
import { DomainError } from '../../purchases/domain'

export interface Candidate { ticketNumber:number;orderId:string }
export function orderedCandidates<T extends Candidate>(candidates:T[]) {
  return [...candidates].sort((a,b)=>a.ticketNumber-b.ticketNumber || (a.orderId<b.orderId?-1:a.orderId>b.orderId?1:0))
}
export function candidateDigest(candidates:Candidate[]) {
  const hash=createHash('sha256').update('[')
  orderedCandidates(candidates).forEach((c,i)=>{if(i)hash.update(',');hash.update(JSON.stringify([c.ticketNumber,c.orderId]))})
  return hash.update(']').digest('hex')
}
export function chooseWinner<T extends Candidate>(candidates:T[],random:(max:number)=>number=randomInt) {
  if(!candidates.length) throw new DomainError('NO_CANDIDATES')
  const ordered=orderedCandidates(candidates),index=random(ordered.length)
  if(!Number.isSafeInteger(index)||index<0||index>=ordered.length) throw new DomainError('INVALID_RANDOM_INDEX')
  return {winner:ordered[index],index,count:ordered.length,digest:candidateDigest(ordered),algorithm:'crypto-randomInt-v1' as const}
}
export function assertDrawReady(deadline:number,drawAt:number,now:number,statuses:string[],count:number) {
  if(![deadline,drawAt,now].every(Number.isFinite)||now<deadline||now<drawAt) throw new DomainError('DRAW_TOO_EARLY')
  if(statuses.some(s=>s==='awaiting_proof'||s==='reviewing')) throw new DomainError('UNRESOLVED_PURCHASES')
  if(count<1) throw new DomainError('NO_CANDIDATES')
}
