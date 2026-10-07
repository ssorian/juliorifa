import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import type { db } from '../../db'
import { raffles } from '../raffles/db/schema'
import { purchases } from './db/schema'
import { expireReservations } from './repository'
import { DomainError } from './domain'

export function expireBatch(database:Pick<typeof db,'transaction'>,batch=10,clock=()=>Date.now()) {
  if(!Number.isInteger(batch)||batch<1||batch>25) throw new DomainError('INVALID_BATCH')
  return database.transaction(async tx=>{
    const now=new Date(clock())
    const parents=await tx.select({id:raffles.id}).from(raffles).where(sql`exists(select 1 from ${purchases} where ${purchases.raffleId}=${raffles.id} and ${purchases.status}='awaiting_proof' and ${purchases.expiresAt}<=${now})`).orderBy(raffles.id).limit(batch).for('update',{skipLocked:true})
    let expired=0
    for(const parent of parents) {expired+=await expireReservations(tx,parent.id,now,batch-expired);if(expired>=batch)break}
    return {expired}
  })
}
