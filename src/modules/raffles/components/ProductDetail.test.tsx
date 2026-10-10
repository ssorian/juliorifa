import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { formatDate } from '../../../lib/utils/date'
import type { PublicRaffleDTO } from '../types/public'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Keep the ordinary suite command compatible while isolating transport mocks.
if (!process.execArgv.includes('--experimental-test-module-mocks')) {
  test('SSR product transport-isolated subprocess', () => {
    const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--import', 'tsx', '--test', fileURLToPath(import.meta.url)], { encoding:'utf8', env:{...process.env, NODE_TEST_CONTEXT:undefined} })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /SSR product renders real paid-only metrics/)
    assert.match(result.stdout, /SSR selection guards failed reads/)
  })
} else {
let summary: any = { isSuccess:true, data:{salesOpen:true,available:6,sold:1,ticketCount:10} }
let suggestionData: any = { isSuccess:true, data:{salesOpen:true,suggestions:[3,5,6,7,8,9]}, refetch:async()=>{} }
let drawResult: any = null
let cart: any = {selected:[],restoring:false,setSelected:()=>{},setMessage:()=>{}}
// Mock only transport/hooks before imports; never load dotenv or a real DB.
mock.module('../hooks/useRaffleAvailability.ts', { namedExports:{ useRaffleAvailability:()=>summary, useSuggestedTickets:()=>suggestionData, useRaffleAvailabilityRefresh:()=>async (refresh:()=>Promise<unknown>)=>refresh() } })
mock.module('../hooks/usePublicRaffles.ts', { namedExports:{ usePublicDraw:()=>({data:drawResult,isSuccess:true,isError:false,refetch:async()=>{}}) } })
mock.module('../hooks/useInventoryPage.ts', { namedExports:{ useInventoryPage:()=>({isSuccess:true,data:{salesOpen:true,tickets:[]},refetch:async()=>{}}) } })
mock.module('../hooks/useCheckoutIntent.ts', { namedExports:{ useCheckoutIntent:()=>cart } })
mock.module('../services/server.ts', { namedExports:{ availableInventory:async()=>{}, suggestedTickets:async()=>{} } })
mock.module('../../auth/services/session.ts', { namedExports:{ currentUser:async()=>null } })
mock.module('../../purchases/server.ts', { namedExports:{ createReservation:async()=>{} } })
mock.module('../../purchases/components/PurchaseDetail.tsx', { namedExports:{ PurchaseDetail:()=>null } })
mock.module('@tanstack/react-query', { namedExports:{useQueryClient:()=>({invalidateQueries:async()=>{}})} })
const { ProductDetail } = await import('./ProductDetail')
const raffle: PublicRaffleDTO = {
 salesOpen:true,completed:false,canArchive:false,
 id:'11111111-1111-4111-8111-111111111111',title:'Premio fixture',description:'Descripción real',status:'active',startNumber:0,ticketCount:10,priceCents:199,
 features:[{title:'Pantalla',description:'Dato guardado'}],images:[{key:'images/fixture',mediaUrl:'/fixture.png',alt:'Premio'}],
 createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',salesDeadline:'2026-01-02T00:00:00Z',drawAt:'2026-01-03T00:00:00Z',
}
test('SSR product renders real paid-only metrics, features and bounded suggestions without demo/PII', () => {
 const html=renderToStaticMarkup(<ProductDetail raffle={raffle}/>)
 assert.match(html, /PREMIO FIXTURE/)
 assert.match(html, /6 boletos disponibles/)
 assert.match(html, /10% vendidos/)
 assert.match(html, /value="1"/)
 assert.match(html, /Dato guardado/)
 assert.doesNotMatch(html,/Estado del sorteo|Sorteo pendiente|Actualizar resultado|Revisión automática/)
 assert.ok(html.includes(formatDate(raffle.drawAt)))
 assert.ok(html.includes(formatDate(raffle.salesDeadline)))
 assert.match(html, /Otros números/)
 assert.match(html, /0003/)
 assert.match(html, /Ver inventario paginado/)
 assert.doesNotMatch(html, /<details[^>]* open|DEMO|SIMULAR|userId|proofKey|Sugerencias aleatorias de una página/)
 assert.match(html, /disabled=""[^>]*>CONTINUAR/)
})
test('failed summary read hides stale numbers and offers retry, never infers zero availability', () => {
 summary={...summary,isSuccess:false,isError:true,error:new Error('Unavailable'),refetch:async()=>{}}
 const html=renderToStaticMarkup(<ProductDetail raffle={raffle}/>)
 assert.match(html,/Reintentar disponibilidad/)
 assert.doesNotMatch(html,/6 boletos disponibles|10% vendidos/)
})
test('SSR product terminal image strip preserves prize without the public draw panel', () => {
 for (const [salesOpen, available, label] of [[false,0,'RIFA CONCLUIDA'],[true,0,'BOLETOS AGOTADOS']] as const) {
  summary={isSuccess:true,data:{salesOpen,available,sold:1,ticketCount:10}}
  const html=renderToStaticMarkup(<ProductDetail raffle={raffle}/>)
  assert.match(html,new RegExp(`class="detail-sales-strip"[^>]*>[\\s\\S]*${label}`))
  assert.match(html,/Ya no es posible comprar boletos/)
  const strip=html.match(/class="detail-sales-strip"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''
  assert.match(html,new RegExp(`class="product-badge">${label}`))
  if (!salesOpen) {
   assert.ok(strip.includes(`Fecha de cierre de venta: ${formatDate(raffle.salesDeadline)}`))
   assert.ok(!strip.includes(formatDate(raffle.drawAt)))
  } else {
   assert.doesNotMatch(strip,/Fecha|cierre|2026/)
   assert.ok(!strip.includes(formatDate(raffle.salesDeadline)))
  }
  assert.doesNotMatch(html,/RIFA ACTIVA|TU PRÓXIMO UPGRADE|detail-bottom-note|Realizado el:/)
  for (const text of ['PREMIO FIXTURE','Descripción real','Dato guardado','fixture.png','Precio por boleto','Cierre de venta:','Disponibilidad de boletos','CONOCE EL PREMIO','Fecha programada']) assert.ok(html.includes(text),text)
 }
 drawResult={winnerTicket:0,drawnAt:'2026-01-04T00:00:00Z'}
 const htmlWithResult=renderToStaticMarkup(<ProductDetail raffle={raffle}/>)
 assert.doesNotMatch(htmlWithResult,/Estado del sorteo|Sorteo pendiente|Actualizar resultado|Boleto ganador|Revisión automática/)
 assert.match(htmlWithResult,/CONOCE EL PREMIO/)
 assert.match(htmlWithResult,/Dato guardado/)
 drawResult=null
})
test('SSR manually closed sale with future deadline uses a neutral date label', () => {
 summary={isSuccess:true,data:{salesOpen:false,available:6,sold:1,ticketCount:10}}
 const future={...raffle,salesDeadline:'2099-01-02T00:00:00Z',drawAt:'2099-01-03T00:00:00Z'}
 const html=renderToStaticMarkup(<ProductDetail raffle={future}/> )
 const strip=html.match(/class="detail-sales-strip"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''
 assert.ok(strip.includes(`Fecha de cierre de venta: ${formatDate(future.salesDeadline)}`))
 assert.doesNotMatch(strip,/Venta cerrada el/)
 assert.ok(!strip.includes(formatDate(future.drawAt)))
})
test('SSR product without an image reserves a fallback layout for the terminal strip', () => {
 summary={isSuccess:true,data:{salesOpen:false,available:0,sold:1,ticketCount:10}}
 const html=renderToStaticMarkup(<ProductDetail raffle={{...raffle,images:[]}}/>)
 assert.match(html,/class="detail-image detail-image-fallback"/)
 assert.match(html,/Imagen no disponible/)
 assert.match(html,/detail-sales-strip/)
 assert.match(html,/RIFA CONCLUIDA/)
 assert.doesNotMatch(html,/<img/)
})
test('SSR product active, pending and failed reads never show a false terminal strip', () => {
 for (const read of [
  {isSuccess:true,data:{salesOpen:true,available:6,sold:1}},
  {isSuccess:false,isPending:true},
  {isSuccess:false,isError:true,data:{salesOpen:false,available:0},error:new Error('Unavailable'),refetch:async()=>{}},
 ]) {
  summary=read
  const html=renderToStaticMarkup(<ProductDetail raffle={raffle}/>)
  assert.doesNotMatch(html,/detail-sales-strip|RIFA CONCLUIDA|BOLETOS AGOTADOS/)
  assert.match(html,/RIFA ACTIVA/)
  assert.match(html,/TU PRÓXIMO UPGRADE/)
  assert.match(html,/detail-bottom-note/)
 }
})
const { TicketSelection } = await import('./TicketSelection')
test('SSR selection guards failed reads, closed sale and restoration; estimated cents stay local', () => {
 summary={isSuccess:true,data:{salesOpen:true,available:6,sold:1,ticketCount:10}}
 cart={...cart,selected:[0]}
 let html=renderToStaticMarkup(<TicketSelection raffle={raffle}/>)
 assert.doesNotMatch(html,/disabled=""[^>]*>CONTINUAR/)
 assert.match(html,/ESTIMADO/)
 assert.match(html,/1[.,]99/)
 summary={...summary,isSuccess:false,isError:true}
 html=renderToStaticMarkup(<TicketSelection raffle={raffle}/>)
 assert.match(html,/disabled=""[^>]*>CONTINUAR/)
 summary={...summary,isSuccess:true,isError:false,data:{...summary.data,salesOpen:false}}
 html=renderToStaticMarkup(<TicketSelection raffle={raffle}/>)
 assert.match(html,/Esta rifa ha finalizado/)
 assert.match(html,/No es posible comprar boletos/)
 assert.match(html,/href="\/"/)
 assert.doesNotMatch(html,/<form|<input|<details|CONTINUAR|Otros números|Limpiar|CONFIRMAR APARTADO/)
 summary={...summary,data:{...summary.data,salesOpen:true,available:0}}
 html=renderToStaticMarkup(<TicketSelection raffle={raffle}/>)
 assert.match(html,/Boletos agotados/)
 assert.doesNotMatch(html,/<form|<input|<details|CONTINUAR|Otros números|Limpiar|CONFIRMAR APARTADO/)
 summary={...summary,isSuccess:false,isError:true}
 html=renderToStaticMarkup(<TicketSelection raffle={raffle}/>)
 assert.doesNotMatch(html,/Boletos agotados|Esta rifa ha finalizado/)
 summary={...summary,isSuccess:true,isError:false,data:{...summary.data,available:6}}
 suggestionData={...suggestionData,data:{salesOpen:true,suggestions:[]}}
 html=renderToStaticMarkup(<TicketSelection raffle={raffle}/>)
 assert.match(html,/No hay sugerencias disponibles sin seleccionar/)
 assert.match(html,/CONTINUAR/)
 assert.doesNotMatch(html,/Boletos agotados/)
 cart={...cart,restoring:true}
 html=renderToStaticMarkup(<TicketSelection raffle={raffle}/>)
 assert.match(html,/Revalidando selección/)
 assert.match(html,/disabled=""[^>]*>CONTINUAR/)
 cart={...cart,restoring:false}
 suggestionData={...suggestionData,isSuccess:false,isError:true,error:new Error('Unavailable')}
 html=renderToStaticMarkup(<TicketSelection raffle={raffle}/>)
 assert.match(html,/Reintentar sugerencias/)
 assert.match(html,/disabled=""[^>]*>CONTINUAR/)
 assert.doesNotMatch(html,/class="ticket-number"/)
 suggestionData={...suggestionData,isSuccess:true,isError:false,data:{salesOpen:false,suggestions:[]}}
 html=renderToStaticMarkup(<TicketSelection raffle={raffle}/>)
 assert.match(html,/Esta rifa ha finalizado/)
 assert.doesNotMatch(html,/CONTINUAR|CONFIRMAR APARTADO/)
})
}
