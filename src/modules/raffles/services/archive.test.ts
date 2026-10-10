import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (!process.execArgv.includes('--experimental-test-module-mocks')) {
  test('archive transport-isolated server contract', () => {
    const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--import', 'tsx', '--test', fileURLToPath(import.meta.url)], {
      encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /archive authorizes freshly/)
  })
} else {
  const calls: string[] = []
  let denied = false
  const evidence = { hasResult: true, paid: false, pending: false, occupied: false }
  const row = {
    id: '11111111-1111-4111-8111-111111111111', status: 'drawn',
    title: 'Fixture', description: '', ticketCount: 10, startNumber: 0,
    priceCents: 100, features: [], images: [], feeBps: 0,
    prizeCostCents: 0, expensesCents: 0,
    createdAt: new Date(0), updatedAt: new Date(0),
    salesDeadline: new Date(0), drawAt: new Date(0),
  }
  const tx = {
    select: () => ({ from: () => ({ where: async () => {
      calls.push('evidence'); return [{ id: row.id, ...evidence }]
    } }) }),
    update: () => ({ set: (values: object) => ({ where: () => ({ returning: async () => {
      calls.push('update'); Object.assign(row, values); return [row]
    } }) }) }),
  }
  mock.module('@tanstack/react-start/server-only', { namedExports: {} })
  mock.module('../../../db/index.ts', { namedExports: { db: {
    transaction: async (operation: (value: typeof tx) => unknown) => {
      calls.push('transaction'); const value = await operation(tx); calls.push('commit'); return value
    },
  } } })
  mock.module('../../auth/services/authorization.ts', { namedExports: {
    requireAdmin: async () => { calls.push('admin'); if (denied) throw new Error('FORBIDDEN'); return { id: 'admin' } },
  } })
  mock.module('../../purchases/repository.ts', { namedExports: {
    lockRaffle: async () => { calls.push('lock'); return row },
    expireReservations: async () => { calls.push('expire') },
  } })
  const { archive, update } = await import('./backend')
  test('archive authorizes freshly, locks, requires result and retries without writes', async () => {
    denied = true
    await assert.rejects(archive(row.id), /FORBIDDEN/)
    assert.deepEqual(calls.splice(0), ['admin'])
    denied = false; evidence.hasResult = false
    await assert.rejects(archive(row.id), /DRAW_REQUIRED_BEFORE_ARCHIVE/)
    assert.deepEqual(calls.splice(0), ['admin', 'transaction', 'lock', 'expire', 'evidence', 'commit'])
    evidence.hasResult = true
    await archive(row.id)
    assert.equal(row.status, 'archived')
    assert.deepEqual(calls.splice(0), ['admin', 'transaction', 'lock', 'expire', 'evidence', 'update', 'commit'])
    const updatedAt = row.updatedAt
    await archive(row.id)
    assert.equal(row.updatedAt, updatedAt)
    assert.deepEqual(calls.splice(0), ['admin', 'transaction', 'lock', 'commit'])
  })
  test('empty exception revalidates locked dates, payments and pending; update cannot bypass it', async () => {
    evidence.hasResult = false
    for (const reason of ['paid', 'pending', 'occupied', 'future'] as const) {
      row.status = 'active'; evidence.paid = reason === 'paid'; evidence.pending = reason === 'pending'; evidence.occupied = reason === 'occupied'
      row.drawAt = reason === 'future' ? new Date(Date.now() + 60000) : new Date(0)
      await assert.rejects(archive(row.id), /DRAW_REQUIRED_BEFORE_ARCHIVE/)
      assert.equal(row.status, 'active')
      assert.deepEqual(calls.splice(0), ['admin', 'transaction', 'lock', 'expire', 'evidence', 'commit'])
    }
    evidence.pending = true; row.drawAt = new Date(0)
    await assert.rejects(update({ ...row, status: 'archived', salesDeadline: row.salesDeadline.toISOString(), drawAt: row.drawAt.toISOString() }), /DRAW_REQUIRED_BEFORE_ARCHIVE/)
    calls.splice(0); evidence.pending = false
    await archive(row.id)
    assert.equal(row.status, 'archived')
    assert.deepEqual(calls.splice(0), ['admin', 'transaction', 'lock', 'expire', 'evidence', 'update', 'commit'])
  })
}
