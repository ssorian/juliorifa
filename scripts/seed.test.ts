import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSeed } from './seed'

test('CLI guards production, unknown flags and dry-run before loading DB', async () => {
  let loads = 0
  const execute = async () => {
    loads++
    return 'created' as const
  }
  assert.match(await runSeed([], 'development', execute), /Plan/)
  assert.equal(loads, 0)
  await assert.rejects(
    runSeed(['--execute'], 'production', execute),
    /environment/,
  )
  await assert.rejects(
    runSeed(['--execute'], undefined, execute),
    /environment/,
  )
  await assert.rejects(runSeed(['--unknown'], 'test', execute), /Usage/)
  await assert.rejects(
    runSeed(['--execute', '--execute'], 'test', execute),
    /Usage/,
  )
  assert.equal(loads, 0)
  assert.match(await runSeed(['--execute'], 'test', execute), /created/)
  assert.equal(loads, 1)
})
