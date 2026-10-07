import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sendEmail } from './service'

const message = { to: 'test@example.invalid', subject: 'Test', text: 'Test' }
test('notification delivery uses deterministic provider idempotency header', async()=>{
  await sendEmail({...message,idempotencyKey:'event-123'},async (_url,init)=>{
    assert.equal(new Headers(init?.headers).get('Idempotency-Key'),'event-123')
    return new Response('{}',{status:200})
  },{key:'stub',from:'fixed@example.invalid'})
})
test('missing configuration fails without network', async () => {
  await assert.rejects(
    sendEmail(
      message,
      async () => {
        throw new Error('must not call')
      },
      { key: undefined, from: undefined },
    ),
    /Email delivery unavailable/,
  )
})
test('provider failure is sanitized; sender is server configuration', async () => {
  const stub: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    assert.equal(body.from, 'fixed@example.invalid')
    assert.deepEqual(body.to, [message.to])
    return new Response('provider secret error', { status: 422 })
  }
  await assert.rejects(
    sendEmail(message, stub, {
      key: 'fake-unit-key',
      from: 'fixed@example.invalid',
    }),
    { message: 'Email delivery unavailable' },
  )
  await sendEmail(message, async () => new Response('{}', { status: 200 }), {
    key: 'fake-unit-key',
    from: 'fixed@example.invalid',
  })
})
