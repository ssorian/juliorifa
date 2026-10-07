import { randomBytes, timingSafeEqual } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import type { Plugin } from 'vite'

Object.assign(process.env, {
  DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1:9/fixture',
  BETTER_AUTH_URL: 'http://127.0.0.1:3212',
  SERVER_URL: 'http://127.0.0.1:3212',
  BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  S3_ENDPOINT: 'http://127.0.0.1:9',
  S3_REGION: 'fixture',
  S3_BUCKET: 'fixture',
  S3_ACCESS_KEY_ID: 'fixture',
  S3_SECRET_ACCESS_KEY: 'fixture',
  NITRO_DEV_RUNNER: 'self',
  RESEND_API_KEY: 'fixture-invalid',
  EMAIL_FROM: 'fixture@fixture.invalid',
  JOBS_ENABLED: 'false',
})
const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Fixture blocked outbound fetch')
  return originalFetch(input, init)
}
const { default: base } = await import('./vite.config')
const root = process.cwd()
const replacements = new Map([
  [resolve(root, 'src/db/index.ts'), resolve(root, 'tests/e2e/db.ts')],
  [
    resolve(root, 'src/config/auth.ts'),
    resolve(root, 'tests/e2e/auth-config.ts'),
  ],
  [
    resolve(root, 'src/lib/email/service.ts'),
    resolve(root, 'tests/e2e/email.ts'),
  ],
  [
    resolve(root, 'src/lib/storage/s3.ts'),
    resolve(root, 'tests/e2e/storage.ts'),
  ],
])
const fixture: Plugin = {
  name: 'isolated-fixture',
  enforce: 'pre',
  apply: 'serve',
  async resolveId(source, importer) {
    if (!importer) return
    const clean = source.split('?')[0]
    const path = clean.startsWith('#/')
      ? resolve(root, 'src', clean.slice(2))
      : clean.startsWith('.')
        ? resolve(dirname(importer.split('?')[0]), clean)
        : clean.startsWith('/src/')
          ? resolve(root, clean.slice(1))
          : clean
    for (const candidate of [path, `${path}.ts`, `${path}/index.ts`]) {
      const target = replacements.get(candidate)
      if (target) return target
    }
  },
  async configureServer(server) {
    const { state, validSignature } = await import('./tests/e2e/state')
    await state.ready
    server.httpServer?.on('close', () => {
      void state.pg.close()
    })
    server.middlewares.use(async (req, res, next) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1:3212')
        if (!url.pathname.startsWith('/__fixture/')) return next()
        res.setHeader('Cache-Control', 'private, no-store')
        if (url.pathname === '/__fixture/object') {
          const sig = url.searchParams.get('signature') || ''
          url.searchParams.delete('signature')
          const object = state.objects.get(url.searchParams.get('key') || '')
          if (
            !validSignature(url.searchParams.toString(), sig) ||
            Number(url.searchParams.get('expires')) < Date.now() ||
            !object
          ) {
            res.statusCode = 404
            return res.end()
          }
          res.setHeader('X-Content-Type-Options', 'nosniff')
          res.setHeader('Content-Type', object.mime)
          res.setHeader(
            'Content-Disposition',
            url.searchParams.get('kind') === 'proof'
              ? `attachment; filename="receipt.${object.mime === 'application/pdf' ? 'pdf' : object.mime === 'image/jpeg' ? 'jpg' : object.mime === 'image/webp' ? 'webp' : 'png'}"`
              : 'inline',
          )
          return res.end(object.bytes)
        }
        const supplied = Buffer.from(String(req.headers['x-fixture-key'] || ''))
        const expected = Buffer.from(process.env.JULIORIFA_FIXTURE_KEY || '')
        if (
          !expected.length ||
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        ) {
          res.statusCode = 404
          return res.end()
        }
        res.setHeader('Content-Type', 'application/json')
        if (url.pathname === '/__fixture/ready')
          return res.end(JSON.stringify({ ready: true }))
        if (url.pathname === '/__fixture/mail') {
          const message = [...state.messages]
            .reverse()
            .find((m: { to: string }) => m.to === url.searchParams.get('email'))
          const link = message?.text.match(
            /http:\/\/127\.0\.0\.1:3212\/[^\s]+/,
          )?.[0]
          return res.end(JSON.stringify({ link }))
        }
        if (url.pathname === '/__fixture/pump' && req.method === 'POST') {
          const load = (
            globalThis as typeof globalThis & {
              __VITE_ENVIRONMENT_RUNNER_IMPORT__: (
                environment: string,
                id: string,
              ) => Promise<{ pump: () => Promise<unknown> }>
            }
          ).__VITE_ENVIRONMENT_RUNNER_IMPORT__
          const { pump } = await load('ssr', '/tests/e2e/pump.ts')
          return res.end(JSON.stringify(await pump()))
        }
        if (url.pathname === '/__fixture/counts') {
          const result = await state.pg.query(
            'SELECT (SELECT count(*) FROM purchases)::int AS purchases, (SELECT count(*) FROM notification_outbox)::int AS outbox',
          )
          return res.end(JSON.stringify(result.rows[0]))
        }
        if (url.pathname === '/__fixture/promote' && req.method === 'POST') {
          await state.pg.query(
            'UPDATE "user" SET role = $1, "email_verified" = true WHERE email = $2',
            ['admin', 'admin@fixture.invalid'],
          )
          return res.end(JSON.stringify({ ok: true }))
        }
        res.statusCode = 404
        res.end()
      } catch {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'FIXTURE_FAILURE' }))
      }
    })
  },
}
export default ({ command }: { command: string }) => {
  if (command !== 'serve')
    throw new Error('Fixture config supports isolated development only')
  return {
    ...base,
    plugins: [fixture, ...(base.plugins || [])],
    server: { host: '127.0.0.1', port: 3212, strictPort: true },
  }
}
