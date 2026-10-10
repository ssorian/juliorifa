import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { QueryClient, QueryObserver } from '@tanstack/react-query'

if (!process.execArgv.includes('--experimental-test-module-mocks')) {
  test('availability refresh isolated subprocess', () => {
    const result = spawnSync(process.execPath, [
      '--experimental-test-module-mocks', '--import', 'tsx', '--test', fileURLToPath(import.meta.url),
    ], { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /explicit suggestions refresh/)
    assert.match(result.stdout, /explicit inventory refresh/)
    assert.match(result.stdout, /failed summary stays an error/)
  })
} else {
  // No server module, dotenv or real DB is loaded.
  mock.module('../services/server.ts', {
    namedExports: { raffleAvailability: async () => {}, suggestedTickets: async () => {} },
  })
  const { refreshRaffleAvailability } = await import('./useRaffleAvailability')
  const id = '11111111-1111-4111-8111-111111111111'
  const summaryKey = ['public-inventory', id, 'summary']

  for (const kind of ['suggestions', 'inventory']) {
    test(`explicit ${kind} refresh updates the active product snapshot before resolving`, async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      let snapshot = { sold: 1, available: 9, ticketCount: 10, salesOpen: true }
      let reads = 0
      const observer = new QueryObserver(client, {
        queryKey: summaryKey,
        queryFn: async () => { reads++; return { ...snapshot } },
      })
      const unsubscribe = observer.subscribe(() => {})
      try {
        await client.fetchQuery({ queryKey: summaryKey })
        client.setQueryData(['public-inventory', 'other', 'summary'], { sold: 5 })
        const result = await refreshRaffleAvailability(client, id, async () => {
          snapshot = { ...snapshot, sold: 2, available: 8, salesOpen: false }
          return { ...snapshot, suggestions: [3, 4] }
        })
        assert.equal(result.sold, 2)
        assert.deepEqual(observer.getCurrentResult().data, snapshot)
        assert.equal(reads, 2)
        assert.deepEqual(client.getQueryData(['public-inventory', 'other', 'summary']), { sold: 5 })
      } finally { unsubscribe(); observer.destroy(); client.clear() }
    })
  }

  test('failed summary stays an error; cached values cannot masquerade as a fresh snapshot', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let fail = false
    const observer = new QueryObserver(client, {
      queryKey: summaryKey,
      queryFn: async () => {
        if (fail) throw new Error('read unavailable')
        return { sold: 1, available: 9 }
      },
    })
    const unsubscribe = observer.subscribe(() => {})
    try {
      await client.fetchQuery({ queryKey: summaryKey })
      fail = true
      await refreshRaffleAvailability(client, id, async () => ({ sold: 2, available: 8 }))
      assert.equal(observer.getCurrentResult().isError, true)
      fail = false
      await refreshRaffleAvailability(client, id, async () => null)
      assert.equal(observer.getCurrentResult().isSuccess, true)
    } finally { unsubscribe(); observer.destroy(); client.clear() }
  })

  test('rejected refresh still revalidates summary and preserves the original rejection', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let sold = 1
    const observer = new QueryObserver(client, { queryKey: summaryKey, queryFn: async () => ({ sold }) })
    const unsubscribe = observer.subscribe(() => {})
    try {
      await client.fetchQuery({ queryKey: summaryKey })
      sold = 2
      await assert.rejects(refreshRaffleAvailability(client, id, async () => { throw new Error('refresh unavailable') }), /refresh unavailable/)
      assert.equal(observer.getCurrentResult().data?.sold, 2)
    } finally { unsubscribe(); observer.destroy(); client.clear() }
  })
}
