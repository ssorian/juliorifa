import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyText } from './clipboard'

test('clipboard confirms native success and falls back on absence or rejection', async () => {
  let copied = ''
  assert.equal(
    await copyText(
      'full-uuid',
      {
        writeText: async (text) => {
          copied = text
        },
      },
      () => false,
    ),
    true,
  )
  assert.equal(copied, 'full-uuid')
  assert.equal(await copyText('75.25', undefined, () => true), true)
  assert.equal(
    await copyText(
      'account',
      {
        writeText: async () => {
          throw Error('denied')
        },
      },
      () => true,
    ),
    true,
  )
  assert.equal(await copyText('account', undefined, () => false), false)
  assert.equal(
    await copyText('account', undefined, () => {
      throw Error('denied')
    }),
    false,
  )
})
