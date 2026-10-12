import test from 'node:test'
import assert from 'node:assert/strict'
import { methodInput, updateMethodInput, snapshotMethods } from './domain'

const input = {
  type: 'clabe' as const,
  bank: 'Banco',
  beneficiary: 'Persona',
  number: '012345678901234567',
  instructions: '',
}
test('bounded strict payment destination validation', () => {
  assert.equal(methodInput.parse(input).number, input.number)
  for (const value of [
    { ...input, id: 'client-id' },
    { ...input, active: false },
    { ...input, number: '123' },
    { ...input, bank: '' },
    { ...input, type: 'crypto' },
  ])
    assert.equal(methodInput.safeParse(value).success, false)
  assert.equal(
    methodInput.safeParse({
      ...input,
      type: 'card',
      number: '1234567890123456',
    }).success,
    true,
  )
  assert.equal(
    methodInput.safeParse({ ...input, type: 'account', number: '1234567' })
      .success,
    true,
  )
  assert.equal(
    methodInput.safeParse({ ...input, type: 'account', number: '1'.repeat(21) })
      .success,
    false,
  )
  assert.equal(
    updateMethodInput.safeParse({ ...input, id: 'bad' }).success,
    false,
  )
})
test('snapshots distinguish never configured from explicitly disabled and copy multiple same type', () => {
  assert.equal(snapshotMethods([]), null)
  const rows = [
    { ...input, id: 'a', active: true },
    { ...input, id: 'b', active: true },
  ]
  const snapshot = snapshotMethods(rows)!
  assert.equal(snapshot.length, 2)
  rows[0].number = '999999999999999999'
  rows[1].active = false
  assert.equal(snapshot[0].number, input.number)
  assert.equal(snapshot.length, 2)
  assert.deepEqual(
    snapshotMethods(rows.map((row) => ({ ...row, active: false }))),
    [],
  )
})
