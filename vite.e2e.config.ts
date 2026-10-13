import { randomBytes, timingSafeEqual } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import type { Plugin } from 'vite'

Object.assign(process.env, {
  DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1:9/fixture',
  BETTER_AUTH_URL: 'http://127.0.0.1:3212',
  SERVER_URL: 'http://127.0.0.1:3212',
  BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  SUPABASE_URL: 'http://127.0.0.1:9',
  SUPABASE_STORAGE_BUCKET: 'fixture',
  SUPABASE_SECRET_KEY: 'fixture-invalid',
  NITRO_DEV_RUNNER: 'self',
  RESEND_API_KEY: 'fixture-invalid',
  EMAIL_FROM: 'fixture@fixture.invalid',
  JOBS_ENABLED: 'false',
  CRON_SECRET: 'isolated-cron-fixture-only',
  PAYMENT_BANK: 'Fixture Bank',
  PAYMENT_BENEFICIARY: 'Fixture Organizer',
  PAYMENT_ACCOUNT: 'fixture-account',
  PAYMENT_INSTRUCTIONS: 'Fixture transfer only',
})
const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Fixture blocked outbound fetch')
  return originalFetch(input, init)
}
const { default: baseConfig } = await import('./vite.config')
const base = baseConfig({ command: 'serve', mode: 'development' })
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
    resolve(root, 'src/lib/storage/supabase.ts'),
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
    let clientReady: Promise<void> | undefined
    const warmClient = () =>
      (clientReady ??= (async () => {
        const client = server.environments.client
        const entry = await client.transformRequest(
          '/node_modules/@tanstack/react-start/dist/plugin/default-entry/client.tsx',
        )
        if (!entry) throw new Error('Fixture client entry unavailable')
        await client.waitForRequestsIdle()
        await client.depsOptimizer?.scanProcessing
        await Promise.all(
          Object.values(client.depsOptimizer?.metadata.optimized ?? {}).map(
            (dep) => dep.processing,
          ),
        )
      })())
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
        if (url.pathname === '/__fixture/ready') {
          await warmClient()
          return res.end(JSON.stringify({ ready: true, clientReady: true }))
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
        if (
          url.pathname === '/__fixture/bootstrap-admin' &&
          req.method === 'POST'
        ) {
          if (process.env.NODE_ENV === 'production')
            throw new Error('Fixture only')
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of req) {
            size += Buffer.byteLength(chunk)
            if (size > 400) {
              res.statusCode = 413
              return res.end()
            }
            chunks.push(Buffer.from(chunk))
          }
          const password = Buffer.concat(chunks).toString('utf8')
          if (!/^[a-f0-9]{8}$/.test(password)) {
            res.statusCode = 400
            return res.end()
          }
          const { hashPassword } = await import('better-auth/crypto')
          const hash = await hashPassword(password)
          const id = randomBytes(16).toString('hex')
          await state.pg.transaction(async (tx) => {
            await tx.query(
              'INSERT INTO "user" (id, name, email, role) VALUES ($1, $2, $3, $4)',
              [id, 'Fixture Admin', 'dev-admin@fixture.invalid', 'admin'],
            )
            await tx.query(
              'INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5)',
              [randomBytes(16).toString('hex'), id, 'credential', id, hash],
            )
          })
          return res.end(JSON.stringify({ ok: true }))
        }
        if (url.pathname === '/__fixture/counts') {
          const result = await state.pg.query<{
            purchases: number
            outbox: number
          }>(
            'SELECT (SELECT count(*) FROM purchases)::int AS purchases, (SELECT count(*) FROM notification_outbox)::int AS outbox',
          )
          return res.end(
            JSON.stringify({
              ...result.rows[0],
              messages: state.messages.length,
            }),
          )
        }
        if (url.pathname === '/__fixture/promote' && req.method === 'POST') {
          const load = (
            globalThis as typeof globalThis & {
              __VITE_ENVIRONMENT_RUNNER_IMPORT__: (
                environment: string,
                id: string,
              ) => Promise<{
                promoteExistingAdmin: (
                  email: string,
                  confirmed: boolean,
                ) => Promise<void>
              }>
            }
          ).__VITE_ENVIRONMENT_RUNNER_IMPORT__
          const { promoteExistingAdmin } = await load(
            'ssr',
            '/src/modules/auth/services/promote-admin.ts',
          )
          await promoteExistingAdmin('admin@fixture.invalid', true)
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
    envDir: false,
    cacheDir: `/tmp/juliorifa-e2e-vite-${process.pid}`,
    // Cold PID caches must not rediscover client deps during authenticated navigation.
    optimizeDeps: {
      noDiscovery: true,
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@tanstack/react-query',
        '@tanstack/react-query-devtools',
        '@tanstack/react-devtools',
        '@tanstack/react-router-ssr-query',
        '@tanstack/react-router > @tanstack/react-store',
        '@tanstack/router-core',
        '@tanstack/router-core/isServer',
        '@tanstack/router-core/ssr/client',
        'better-auth/react',
        'better-auth/client/plugins',
        'dayjs',
        'dayjs/plugin/*',
      ],
    },
    plugins: [fixture, ...(base.plugins || [])],
    server: { host: '127.0.0.1', port: 3212, strictPort: true },
  }
}
