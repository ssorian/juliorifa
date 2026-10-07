import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { makeCheckout, recoverCheckout } from './checkout'
import { purchaseSearch } from '../../purchases/lib/route-search'

const key = 'a'.repeat(32)
const raw = JSON.stringify(makeCheckout('r1', [1, 2], 100, key))
test('lost POST response recovers original before reserved inventory without creating', async () => {
  const calls: string[] = []
  const result = await recoverCheckout(
    raw,
    key,
    {
      lookup: async (id) => {
        calls.push(id)
        return { id: 'original' }
      },
      available: async () => {
        throw new Error('reserved inventory must not be consulted')
      },
    },
    101,
  )
  assert.deepEqual(result, { kind: 'owned', purchase: { id: 'original' } })
  assert.deepEqual(calls, [key])
  for (const path of [
    'src/modules/raffles/Public.tsx',
    'src/modules/raffles/hooks/useCheckoutIntent.ts',
  ]) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /await recoverCheckout\(/)
    assert.match(source, /lookupOwnReservationByKey\(/)
  }
})
test('null owner-scoped lookup revalidates subsets; unknown retains intent by rejecting', async () => {
  const result = await recoverCheckout(
    raw,
    key,
    {
      lookup: async () => null,
      available: async () => [2],
    },
    101,
  )
  assert.deepEqual(result, { kind: 'cart', cart: JSON.parse(raw), picks: [2] })
  await assert.rejects(
    recoverCheckout(
      raw,
      key,
      {
        lookup: async () => {
          throw new Error('unknown')
        },
        available: async () => [],
      },
      101,
    ),
    /unknown/,
  )
})
test('corrupt expired and mismatched cart never look up or filter', async () => {
  for (const value of [
    'oops',
    JSON.stringify(makeCheckout('r1', [1], -2000000, key)),
    JSON.stringify(makeCheckout('r1', [1], 100, 'b'.repeat(32))),
  ]) {
    assert.deepEqual(
      await recoverCheckout(
        value,
        key,
        {
          lookup: async () => {
            throw new Error('unexpected')
          },
          available: async () => {
            throw new Error('unexpected')
          },
        },
        101,
      ),
      { kind: 'discard' },
    )
  }
})
test('purchase route wires fresh actor and page, without scaffold; UUID search is safe', () => {
  const source = readFileSync('src/routes/mis-compras.tsx', 'utf8')
  assert.doesNotMatch(source, /Hello/)
  assert.match(source, /await currentUser\(\)/)
  assert.match(source, /redirect\(\{ href: '\/login' \}\)/)
  assert.match(source, /<PurchasesPage user=\{user\} id=\{id\}/)
  assert.deepEqual(purchaseSearch({ id: 'bad' }), {})
  assert.deepEqual(
    purchaseSearch({ id: '11111111-1111-4111-8111-111111111111' }),
    { id: '11111111-1111-4111-8111-111111111111' },
  )
})
