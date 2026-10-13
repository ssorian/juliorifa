import assert from 'node:assert/strict'
import test from 'node:test'
import { healthResponse, maintenanceResponse } from './http'

const secret = 'fixture-only-secret'
const result = { expire: { expired: 2 }, storage: { claimed: 3, deleted: 1, retry: 1, stale: 1 } }
function fixture(overrides: Record<string, string | undefined> = {}) {
  let loads = 0, executions = 0
  const logs: unknown[] = []
  const deps = {
    env: () => ({ JOBS_ENABLED: 'true', CRON_SECRET: secret, ...overrides }),
    loadRunner: async () => { loads++; return { runJobs: async (input: unknown) => {
      executions++; assert.deepEqual(input, { kind: 'all', batch: 10 }); return result
    } } },
    log: (entry: unknown) => { logs.push(entry) },
  }
  return { deps, logs, counts: () => [loads, executions] }
}
const request = (path = '', method = 'GET', token = secret) => new Request(`https://fixture.invalid/api/cron/maintenance${path}`, { method, headers: { authorization: `Bearer ${token}` } })
function headers(response: Response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
}
test('health is basic liveness with no dependencies', async () => {
  const response = healthResponse(new Request('https://fixture.invalid/api/health'))
  assert.equal(response.status, 200); headers(response)
  assert.deepEqual(await response.json(), { code: 'HEALTH_OK' })
})
for (const [name, path, method, token, env, status] of [
  ['method', '', 'POST', secret, {}, 405],
  ['query', '?token=private', 'GET', secret, {}, 400],
  ['disabled', '', 'GET', secret, { JOBS_ENABLED: 'false' }, 503],
  ['unconfigured', '', 'GET', secret, { CRON_SECRET: undefined }, 503],
  ['wrong bearer', '', 'GET', 'wrong', {}, 401],
  ['oversize bearer', '', 'GET', 'x'.repeat(5000), {}, 401],
] as const) test(`maintenance rejects ${name} before loading runner`, async () => {
  const f = fixture(env)
  const response = await maintenanceResponse(request(path, method, token), f.deps)
  assert.equal(response.status, status); headers(response)
  assert.deepEqual(f.counts(), [0, 0])
  assert.deepEqual(Object.keys(await response.json()), ['code'])
  const logs = JSON.stringify(f.logs)
  assert.ok(!logs.includes(secret) && !logs.includes('private') && !logs.includes('fixture.invalid'))
})
test('authorized maintenance uses fixed batch and only allowlisted corroborated counts', async () => {
  const f = fixture()
  const response = await maintenanceResponse(request(), f.deps)
  assert.equal(response.status, 200); headers(response)
  assert.deepEqual(await response.json(), { code: 'MAINTENANCE_OK', ...result })
  assert.deepEqual(f.counts(), [1, 1])
  assert.match((f.logs[0] as { requestId: string }).requestId, /^[0-9a-f-]{36}$/)
})
test('exceptions and invalid counts never escape through response or logs', async () => {
  for (const output of [null, { expire: { expired: 11 }, storage: result.storage }, { expire: result.expire, storage: { ...result.storage, claimed: 0 } }]) {
    const f = fixture()
    f.deps.loadRunner = async () => ({ runJobs: async () => { if (!output) throw new Error('secret bank provider URL'); return output } })
    const response = await maintenanceResponse(request(), f.deps)
    assert.equal(response.status, 500); headers(response)
    assert.deepEqual(await response.json(), { code: 'MAINTENANCE_FAILED' })
    assert.ok(!JSON.stringify(f.logs).includes('secret bank provider'))
  }
})
test('health rejects methods and query without claiming readiness', async () => {
  for (const [url, method, status] of [['https://fixture.invalid/api/health?db=true', 'GET', 400], ['https://fixture.invalid/api/health', 'POST', 405]] as const) {
    const response = healthResponse(new Request(url, { method }))
    assert.equal(response.status, status); headers(response)
  }
})
test('missing or non-bearer authorization never loads runner', async () => {
  for (const authorization of [undefined, secret, `Basic ${secret}`, `bearer ${secret}`]) {
    const f = fixture()
    const response = await maintenanceResponse(new Request('https://fixture.invalid/api/cron/maintenance', { headers: authorization ? { authorization } : {} }), f.deps)
    assert.equal(response.status, 401)
    assert.deepEqual(f.counts(), [0, 0])
  }
})
test('unknown runner fields are discarded', async () => {
  const f = fixture()
  f.deps.loadRunner = async () => ({ runJobs: async () => ({ ...result, user: 'private', expire: { ...result.expire, bank: 'private' } }) })
  const response = await maintenanceResponse(request(), f.deps)
  assert.deepEqual(await response.json(), { code: 'MAINTENANCE_OK', ...result })
  assert.ok(!JSON.stringify(f.logs).includes('private'))
})
