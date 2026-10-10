import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
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
let cart: any = {selected:[],restoring:false,setSelected:()=>{},setMessage:()=>{}}
// Mock only transport/hooks before imports; never load dotenv or a real DB.
mock.module('../hooks/useRaffleAvailability.ts', { namedExports:{ useRaffleAvailability:()=>summary, useSuggestedTickets:()=>suggestionData, useRaffleAvailabilityRefresh:()=>async (refresh:()=>Promise<unknown>)=>refresh() } })
mock.module('../hooks/usePublicRaffles.ts', { namedExports:{ usePublicDraw:()=>({data:null,isSuccess:true,isError:false,refetch:async()=>{}}) } })
mock.module('../hooks/useInventoryPage.ts', { namedExports:{ useInventoryPage:()=>({isSuccess:true,data:{salesOpen:true,tickets:[]},refetch:async()=>{}}) } })
mock.module('../hooks/useCheckoutIntent.ts', { namedExports:{ useCheckoutIntent:()=>cart } })
mock.module('../services/server.ts', { namedExports:{ availableInventory:async()=>{}, suggestedTickets:async()=>{} } })
mock.module('../../auth/services/session.ts', { namedExports:{ currentUser:async()=>null } })
mock.module('../../purchases/server.ts', { namedExports:{ createReservation:async()=>{} } })
mock.module('../../purchases/components/PurchaseDetail.tsx', { namedExports:{ PurchaseDetail:()=>null } })
mock.module('@tanstack/react-query', { namedExports:{useQueryClient:()=>({invalidateQueries:async()=>{}})} })
const { ProductDetail } = await import('./ProductDetail')
const raffle: PublicRaffleDTO = {
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
 assert.match(html,/Venta cerrada/)
 assert.match(html,/disabled=""[^>]*>CONTINUAR/)
 summary={...summary,data:{...summary.data,salesOpen:true}}
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
 assert.match(html,/disabled=""[^>]*>CONTINUAR/)
})
}
