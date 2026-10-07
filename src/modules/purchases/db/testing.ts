import { randomUUID } from 'node:crypto'
import { readFileSync,readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import type { PurchaseStatus } from '../domain'

// Tests only: no db/index, dotenv, DATABASE_URL, disk data directory, or external service.
export async function testDatabase() {
  const pg=new PGlite(),database=drizzle(pg,{schema})
  const directory=new URL('../../../../drizzle/',import.meta.url)
  for(const name of readdirSync(directory).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort()) await pg.exec(readFileSync(new URL(name,directory),'utf8'))
  await database.insert(schema.user).values([{id:'u',name:'Fixture',email:'u@example.invalid',emailVerified:true,role:'client'},{id:'a',name:'Fixture admin',email:'a@example.invalid',emailVerified:true,role:'admin'},{id:'other',name:'Other fixture',email:'other@example.invalid',emailVerified:true,role:'client'}])
  async function raffle(options:Partial<typeof schema.raffles.$inferInsert>={}) {
    const [row]=await database.insert(schema.raffles).values({id:randomUUID(),title:'Fixture prize',description:'',status:'active',startNumber:0,ticketCount:10,priceCents:100,feeBps:500,prizeCostCents:200,expensesCents:100,salesDeadline:new Date(100),drawAt:new Date(100),...options}).returning()
    return row
  }
  async function order(raffleId:string,status:PurchaseStatus='awaiting_proof',tickets=[0],options:Partial<typeof schema.purchases.$inferInsert>={}) {
    const [row]=await database.insert(schema.purchases).values({id:randomUUID(),raffleId,userId:'u',idempotencyKey:randomUUID(),payloadDigest:'fixture',status,priceCents:100,feeBps:500,subtotalCents:100*tickets.length,feeCents:5*tickets.length,totalCents:100*tickets.length,expiresAt:new Date(1000),createdAt:new Date(0),paymentSnapshot:{bank:'Fixture bank',beneficiary:'Fixture organizer',account:'fixture',instructions:'Fixture instructions'},...(status==='paid'||status==='rejected'?{reviewerId:'a',reviewedAt:new Date(99)}:{}),...options}).returning()
    await database.insert(schema.orderTickets).values(tickets.map(ticketNumber=>({orderId:row.id,ticketNumber})))
    if(['awaiting_proof','reviewing','paid'].includes(status))await database.insert(schema.occupancy).values(tickets.map(ticketNumber=>({orderId:row.id,raffleId,ticketNumber,state:status==='paid'?'sold' as const:status==='reviewing'?'reviewing' as const:'reserved' as const})))
    if(status==='reviewing'||status==='paid'||status==='rejected') {
      const id=randomUUID(),key=`proofs/${id}`
      await database.insert(schema.mediaAssets).values({id,key,kind:'proof',purchaseId:row.id,ownerId:row.userId,status:'verified',mime:'application/pdf',sizeBytes:20,digest:'a'.repeat(64),createdAt:new Date(0),verifiedAt:new Date(50)})
      await database.update(schema.purchases).set({proofAssetId:id,proofKey:key,proofDigest:'a'.repeat(64),proofReceivedAt:new Date(50)}).where(eq(schema.purchases.id,row.id))
    }
    return row
  }
  return {pg,database,raffle,order}
}
