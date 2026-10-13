import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { createOTP } from '@better-auth/utils/otp'
import { base32 } from '@better-auth/utils/base32'
import { enrollmentDiagnostic } from '../../src/modules/auth/lib/enrollment-diagnostic'

async function enrollAdminUI(page: any, password: string) {
  await page.waitForURL('**/seguridad')
  // Match the established UI flows: URL/SSR markup alone does not mean that
  // the client route and its submit handlers have finished loading.
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Contraseña actual', { exact: true }).fill(password)
  const [response] = await Promise.all([
    page.waitForResponse((response: any) =>
      new URL(response.url()).pathname === '/api/auth/two-factor/enable' &&
      response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Configurar aplicación autenticadora', exact: true }).click(),
  ])
  const diagnostic = enrollmentDiagnostic(response.status(), await response.json().catch(() => null))
  console.log('CHECK MFA enrollment:', JSON.stringify(diagnostic))
  assert.equal(diagnostic.status, 200, `native enrollment failed (${diagnostic.code})`)
  assert.equal(diagnostic.nativeTotpShape, true, 'native enrollment returned unexpected shape')
  const input = page.getByLabel('Clave de configuración', { exact: true })
  await input.waitFor()
  const secret = new TextDecoder().decode(base32.decode(await input.inputValue()))
  await page.getByLabel('Guardé mis códigos de respaldo', { exact: true }).check()
  await page.getByLabel('Código de tu aplicación autenticadora', { exact: true }).fill(await createOTP(secret).totp())
  await page.getByRole('button', { name: 'Verificar código', exact: true }).click({ noWaitAfter: true })
  await page.waitForURL('**/dashboard')
  return secret // Fixture only, in memory. Never log or capture enrollment screenshots.
}

const require = createRequire(realpathSync('/home/onix/.bun/bin/playwright'))
// Global Playwright is deliberately resolved without a project dependency.
// eslint-disable-next-line import/no-commonjs
const { chromium } = require('playwright')

const base = 'http://127.0.0.1:3212'
const key = randomBytes(32).toString('hex')
const child = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--config',
    'vite.e2e.config.ts',
    '--host',
    '127.0.0.1',
    '--port',
    '3212',
    '--strictPort',
  ],
  {
    env: { ...process.env, JULIORIFA_FIXTURE_KEY: key },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
// Never print server output: it can contain bearer links, emails, and cookies.
let diagnostics = ''
child.stdout.on('data', (data) => {
  diagnostics = (diagnostics + data).slice(-16000)
})
child.stderr.on('data', (data) => {
  diagnostics = (diagnostics + data).slice(-16000)
})
let browser: any
let stage = 'fixture startup'
let authUiSnapshot: (() => Promise<unknown>) | undefined
async function helper(path: string, method = 'GET') {
  return fetch(`${base}/__fixture/${path}`, {
    method,
    headers: { 'x-fixture-key': key },
    signal: AbortSignal.timeout(10000),
  })
}
try {
  let ready = false
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) break
    try {
      const r = await helper('ready')
      if (r.ok) {
        const readiness = await r.json()
        assert.equal(readiness.clientReady, true)
        ready = true
        break
      }
    } catch {
      /* startup */
    }
    await delay(500)
  }
  assert.ok(ready)
  assert.equal((await fetch(`${base}/__fixture/ready`)).status, 404)
  console.log('PASS isolated PGlite readiness and private helper key gate')
  browser = await chromium.launch({
    executablePath:
      '/home/onix/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    headless: true,
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  await context.route('**/*', async (route: any) => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      return route.abort()
    return route.continue()
  })
  const page = await context.newPage()
  // Fixed labels only. Never log request URLs, queries, bodies, headers or values.
  const authPaths = new Map([
    ['/api/auth/sign-in/email', 'LOGIN'],
    ['/api/auth/two-factor/enable', 'ENABLE'],
    ['/api/auth/two-factor/verify-totp', 'VERIFY_TOTP'],
    ['/api/auth/two-factor/verify-backup-code', 'VERIFY_BACKUP'],
  ])
  const observed = { loginPosts: 0, enablePosts: 0, documentRequests: 0 }
  page.on('request', (request: any) => {
    if (request.isNavigationRequest()) observed.documentRequests++
    const label = authPaths.get(new URL(request.url()).pathname)
    if (!label) return
    const post = request.method() === 'POST'
    if (post && label === 'LOGIN') observed.loginPosts++
    if (post && label === 'ENABLE') observed.enablePosts++
    console.log(`CHECK auth request: ${label} ${post ? 'POST' : 'OTHER'}`)
  })
  page.on('response', (response: any) => {
    const label = authPaths.get(new URL(response.url()).pathname)
    if (label) console.log(`CHECK auth response: ${label} ${response.status()}`)
  })
  page.on('framenavigated', (frame: any) => {
    if (frame !== page.mainFrame()) return
    const path = new URL(frame.url()).pathname
    const label = path === '/login' ? 'LOGIN' : path === '/seguridad' ? 'SECURITY' : path === '/dashboard' || path === '/dashboard/' ? 'DASHBOARD' : 'OTHER'
    console.log(`CHECK auth navigation: ${label}`)
  })
  authUiSnapshot = async () => ({
    ...observed,
    ui: await page.evaluate(() => {
      const known = new Map([
        ['No pudimos completar el acceso. Revisa los datos o intenta más tarde.', 'LOGIN_REJECTED'],
        ['No pudimos completar el acceso. Intenta más tarde.', 'LOGIN_TRANSPORT_ERROR'],
        ['No pudimos iniciar la configuración. Revisa tu contraseña o intenta más tarde.', 'ENROLLMENT_REJECTED'],
        ['No pudimos iniciar la configuración. Intenta de nuevo.', 'ENROLLMENT_ERROR'],
        ['Introduce el código de tu aplicación o un respaldo de un solo uso.', 'CHALLENGE'],
      ])
      return {
        invalidInputs: document.querySelectorAll('input:invalid').length,
        disabledSubmit: !!document.querySelector('button[type="submit"]:disabled'),
        statuses: Array.from(document.querySelectorAll('[role="status"]')).map(node => {
          const text = node.textContent?.trim() ?? ''
          return text ? known.get(text) ?? 'OTHER_NONEMPTY' : 'EMPTY'
        }),
      }
    }),
  })
  let pageErrors = 0
  let hydrationErrors = 0
  const recordPageError = (error: Error) => {
    pageErrors++
    // Fixed categories only: never print provider messages, URLs or auth data.
    const category = [
      'fetch',
      'abort',
      'import',
      'insertBefore',
      'removeChild',
      'hydration',
      'undefined',
      'null',
      'network',
      'timeout',
    ].filter((term) => error.message.toLowerCase().includes(term.toLowerCase()))
    console.log(
      'CHECK browser error detail:',
      error.message
        .replace(/https?:\/\/\S+/g, '[module URL]')
        .replace(/[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+/g, '[email]')
        .replace(/[a-zA-Z0-9_-]{32,}/g, '[redacted]'),
    )
    console.log(
      'CHECK browser error categories:',
      category.join(',') || 'unclassified',
    )
  }
  const imageFailures: Array<{ stage: string; status: number }> = []
  context.on('response', async (response: any) => {
    if (
      response.url().includes('/api/media/images/') &&
      response.status() >= 400
    ) {
      imageFailures.push({ stage, status: response.status() })
      const body = await response.json().catch(() => null)
      const code =
        typeof body?.error === 'string' && /^[A-Z_]+$/.test(body.error)
          ? body.error
          : 'NON_JSON'
      const path = new URL(response.url()).pathname.replace(
        /[0-9a-f]{8}-[0-9a-f-]{27}/gi,
        '[asset]',
      )
      console.log(
        `CHECK image HTTP ${response.status()} (${code}) at ${path} during ${stage}`,
      )
    }
  })
  page.on('pageerror', recordPageError)
  page.on('console', (message: { text: () => string }) => {
    if (/hydration|hydrated|did not match/i.test(message.text()))
      hydrationErrors++
  })
  if (process.argv.includes('--mfa-only')) {
    stage = 'isolated MFA bootstrap and native login UI'
    const password = randomBytes(4).toString('hex')
    assert.equal((await context.request.post(base + '/__fixture/bootstrap-admin', {
      headers: { 'x-fixture-key': key }, data: password,
    })).status(), 200)
    await page.goto(base + '/login')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Correo electrónico', { exact: true }).fill('dev-admin@fixture.invalid')
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    const [loginResponse] = await Promise.all([
      page.waitForResponse((response: any) => new URL(response.url()).pathname === '/api/auth/sign-in/email'),
      page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click({ noWaitAfter: true }),
    ])
    assert.equal(loginResponse.status(), 200)
    stage = 'isolated MFA enrollment UI'
    const secret = await enrollAdminUI(page, password)
    await context.clearCookies()
    await page.goto(base + '/login')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Correo electrónico', { exact: true }).fill('dev-admin@fixture.invalid')
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click({ noWaitAfter: true })
    await page.getByRole('heading', { name: 'Verificación en dos pasos', exact: true }).waitFor()
    assert.equal(await (await context.request.get(base + '/api/auth/get-session')).json(), null)
    await page.getByLabel('Código de tu aplicación autenticadora', { exact: true }).fill(await createOTP(secret).totp())
    await page.getByRole('button', { name: 'Verificar código', exact: true }).click({ noWaitAfter: true })
    await page.waitForURL('**/dashboard')
    await page.waitForLoadState('networkidle')
    assert.equal(pageErrors, 0)
    assert.equal(hydrationErrors, 0)
    console.log('PASS isolated native enrollment, sessionless challenge, MFA login UI and dashboard')
  } else if (process.argv.includes('--suggestions-only')) {
    stage = 'stable suggested ticket interaction'
    const password = randomBytes(24).toString('hex')
    assert.equal((await context.request.post(base + '/__fixture/bootstrap-admin', {
      headers: { 'x-fixture-key': key }, data: password.slice(0, 8),
    })).status(), 200)
    assert.equal((await context.request.post(base + '/api/auth/sign-in/email', {
      headers: { Origin: base }, data: { email: 'dev-admin@fixture.invalid', password: password.slice(0, 8) },
    })).status(), 200)
    await page.goto(base + '/dashboard')
    await enrollAdminUI(page, password.slice(0, 8))
    await page.goto(base)
    await page.waitForLoadState('networkidle')
    const raffle = await page.evaluate(async () => {
      const api = await import('/src/modules/raffles/services/server.ts' as string)
      return api.createRaffle({ data: {
        title: 'Suggestion interaction', description: 'Isolated', status: 'active',
        startNumber: 0, ticketCount: 100, priceCents: 100, feeBps: 0,
        prizeCostCents: 0, expensesCents: 0, features: [], images: [],
        salesDeadline: new Date(Date.now() + 86400000).toISOString(),
        drawAt: new Date(Date.now() + 86400001).toISOString(),
      } })
    })
    await context.clearCookies()
    await page.goto(base + '/#rifa/' + raffle.id)
    const grid = page.getByLabel('Números sugeridos', { exact: true })
    await grid.locator('button').first().waitFor()
    await page.waitForLoadState('networkidle')
    const batch = await grid.locator('button').allTextContents()
    let documents = 0
    const posts: string[] = []
    page.on('request', (request: any) => {
      if (request.isNavigationRequest()) documents++
      if (request.method() === 'POST') posts.push(request.postData() || '')
    })
    await grid.locator('button').nth(0).click()
    await grid.locator('button').nth(1).click()
    await page.waitForLoadState('networkidle')
    assert.deepEqual(await grid.locator('button').allTextContents(), batch)
    assert.equal(await grid.locator('button.selected[aria-pressed="true"]').count(), 2)
    await grid.locator('button').nth(0).click()
    assert.equal(await grid.locator('button.selected[aria-pressed="true"]').count(), 1)
    assert.equal(posts.length, 0, 'toggles must not fetch suggestions')
    const selected = Number(batch[1])
    const refreshed = page.waitForResponse((response: any) => response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Otros números' }).click()
    await refreshed
    await page.waitForFunction((n: number) => !Array.from(document.querySelectorAll('[aria-label="Números sugeridos"] button')).some(button => Number(button.textContent) === n), selected)
    await page.waitForLoadState('networkidle')
    assert.equal(posts.length, 1, 'explicit refresh fetches exactly one batch')
    assert.ok(posts[0].includes('exclude'))
    assert.ok(!(await grid.locator('button').allTextContents()).map(Number).includes(selected))
    assert.equal(await page.getByRole('button', { name: `Quitar ${batch[1]}` }).count(), 1)
    assert.equal(documents, 0)
    assert.equal(pageErrors, 0)
    assert.equal(hydrationErrors, 0)
    console.log('PASS stable suggestions: two selections, deselection, explicit refresh preserves selection; zero navigation')
  } else {
  stage = 'visitor private route guards'
  for (const path of ['/dashboard', '/mis-compras']) {
    await page.goto(base + path)
    await page.waitForURL('**/login**')
    await page.waitForLoadState('networkidle')
    assert.ok(!page.url().includes(path))
  }
  console.log('PASS visitor dashboard/account redirects')
  stage = 'native password client session'
  const password = randomBytes(24).toString('hex') // In-memory fixture only; never logged.
  const registered = new Set<string>()
  const authHeaders = { Origin: base, 'x-forwarded-for': '127.0.0.1' }
  async function nativeAuth(path: string, data: unknown) {
    return context.request.post(base + '/api/auth/' + path, {
      timeout: 15000,
      headers: authHeaders,
      data,
      maxRedirects: 0,
    })
  }
  async function login(email: string, role?: string) {
    const signup = !registered.has(email)
    const path = signup ? 'sign-up/email' : 'sign-in/email'
    const body = {
      email,
      password,
      name: 'Fixture Client',
      ...(signup ? { phone: '+52 55 1234 5678' } : {}),
      callbackURL: '/dashboard',
      ...(role ? { role } : {}),
    }
    let response = await nativeAuth(path, body)
    if (response.status() === 429) {
      console.log('CHECK respecting native password rate-limit window (61s)')
      await delay(61000)
      response = await nativeAuth(path, body)
    }
    assert.equal(response.status(), 200, 'native password HTTP status')
    if (signup)
      registered.add(email) // Never fall back to signup after a failed login.
    else assert.equal((await response.json()).url, '/auth/complete')
    const data = await (
      await context.request.get(base + '/api/auth/get-session')
    ).json()
    assert.ok(data?.user, 'native session missing')
    assert.equal(data.user.email, email)
    assert.equal(data.user.emailVerified, false)
    return data
  }
  const client = await login('client@fixture.invalid', 'admin')
  assert.equal(client.user.role, 'client')
  await context.clearCookies()
  const wrong = await nativeAuth('sign-in/email', {
    email: 'client@fixture.invalid',
    password: randomBytes(24).toString('hex'),
  })
  assert.equal(wrong.status(), 401)
  assert.equal(
    await (await context.request.get(base + '/api/auth/get-session')).json(),
    null,
  )
  const weak = await nativeAuth('sign-up/email', {
    email: 'weak@fixture.invalid',
    name: 'Fixture',
    phone: '+525512345678',
    password: randomBytes(4).toString('hex'),
  })
  assert.equal(weak.status(), 400)
  const replacement = randomBytes(24).toString('hex')
  const duplicate = await nativeAuth('sign-up/email', {
    email: 'client@fixture.invalid',
    name: 'Replacement',
    phone: '+525512345678',
    password: replacement,
    role: 'admin',
  })
  assert.equal(duplicate.status(), 422)
  assert.equal(
    await (await context.request.get(base + '/api/auth/get-session')).json(),
    null,
  )
  const replacedLogin = await nativeAuth('sign-in/email', {
    email: 'client@fixture.invalid',
    password: replacement,
  })
  assert.equal(replacedLogin.status(), 401)
  const oversized = await nativeAuth('sign-up/email', {
    email: 'oversized@fixture.invalid',
    name: 'Fixture',
    phone: '+525512345678',
    password: randomBytes(65).toString('hex'),
  })
  assert.equal(oversized.status(), 400)
  const unchanged = await login('client@fixture.invalid')
  assert.equal(unchanged.user.id, client.user.id)
  assert.equal(unchanged.user.role, 'client')
  assert.equal((await (await helper('counts')).json()).messages, 0)
  console.log(
    'PASS native wrong-password denial, weak-password rejection, duplicate cannot replace credential, no auth mail',
  )
  const clientCookies = await context.cookies()
  await page.goto(base + '/mis-compras')
  await page.waitForLoadState('networkidle')
  assert.ok(!page.url().includes('/login'))
  stage = 'client dashboard denial'
  await page.goto(base + '/dashboard')
  await page.waitForURL(base + '/')
  await page.waitForLoadState('networkidle')
  console.log(
    'PASS native client cookie, owner portal, role-input rejection and admin denial',
  )
  stage = 'native admin promotion and fresh session'
  await context.clearCookies()
  assert.equal(
    (await helper('promote', 'POST')).status,
    500,
    'no missing-user promotion',
  )
  await login('admin@fixture.invalid')
  stage = 'private fixture promotion'
  assert.equal((await helper('promote', 'POST')).status, 200)
  await context.clearCookies()
  const admin = await login('admin@fixture.invalid')
  assert.equal(admin.user.role, 'admin')
  await page.goto(base + '/dashboard')
  const adminTotpSecret = await enrollAdminUI(page, password)
  await page.waitForLoadState('networkidle')
  // Exercise the real login challenge UI; an enrolled account has no session
  // between the password response and a successful native TOTP verification.
  await context.clearCookies()
  await page.goto(base + '/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Correo electrónico', { exact: true }).fill('admin@fixture.invalid')
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  const submitMfaLogin = () => Promise.all([
    page.waitForResponse((response: any) => response.url().includes('/api/auth/sign-in/email')),
    page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click({ noWaitAfter: true }),
  ])
  let [mfaLogin] = await submitMfaLogin()
  if (mfaLogin.status() === 429) { await delay(61000); [mfaLogin] = await submitMfaLogin() }
  assert.equal(mfaLogin.status(), 200)
  await page.getByRole('heading', { name: 'Verificación en dos pasos', exact: true }).waitFor()
  assert.equal(await (await context.request.get(base + '/api/auth/get-session')).json(), null)
  await page.getByLabel('Código de tu aplicación autenticadora', { exact: true }).fill(await createOTP(adminTotpSecret).totp())
  await page.getByRole('button', { name: 'Verificar código', exact: true }).click({ noWaitAfter: true })
  await page.waitForURL(base + '/dashboard')
  await page.waitForLoadState('networkidle')
  console.log('PASS native promoted admin enrollment, login challenge and assured dashboard')
  async function rpc(
    modulePath: string,
    exportName: string,
    payload: unknown,
    target = page,
  ) {
    return target.evaluate(
      async ({
        module,
        name,
        data,
      }: {
        module: string
        name: string
        data: unknown
      }) => {
        const exports = await import(/* @vite-ignore */ module)
        return exports[name]({ data })
      },
      { module: modulePath, name: exportName, data: payload },
    )
  }
  const raffleModule = '/src/modules/raffles/services/server.ts'
  const purchaseModule = '/src/modules/purchases/server.ts'
  stage = 'legitimate admin settings and raffle creation'
  const bank = {
    bank: 'Fixture Bank',
    beneficiary: 'Fixture Organizer',
    account: 'fixture-account',
    instructions: 'Fixture transfer only',
  }
  const retiredSettings = await context.request.post(
    base + '/api/purchases/payment-settings',
    { headers: { Origin: base }, data: bank },
  )
  assert.equal(retiredSettings.status(), 410, 'retired bank configuration endpoint')
  const fields = {
    title: 'HTTP fixture prize',
    description: 'Isolated fixture',
    status: 'draft',
    startNumber: 0,
    ticketCount: 10,
    priceCents: 12345,
    feeBps: 500,
    prizeCostCents: 100,
    expensesCents: 0,
    salesDeadline: new Date(Date.now() + 86400000).toISOString(),
    drawAt: new Date(Date.now() + 86400001).toISOString(),
    features: [],
    images: [] as { key: string; alt: string }[],
  }
  const raffle = await rpc(raffleModule, 'createRaffle', fields)
  assert.match(raffle.id, /^[0-9a-f-]{36}$/)
  // Real sharp validation/reencoding executes in production upload service.
  const { default: sharp } = await import('sharp')
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer()
  stage = 'actual PNG upload'
  const upload = await context.request.post(
    `${base}/api/uploads/images/${raffle.id}`,
    { headers: { Origin: base, 'Content-Type': 'image/png' }, data: png },
  )
  assert.equal(upload.status(), 200)
  const image = await upload.json()
  fields.images = [{ key: image.key, alt: 'Fixture image' }]
  await rpc(raffleModule, 'updateRaffle', {
    ...fields,
    id: raffle.id,
    status: 'active',
  })
  const primaryImageRead = await context.request.get(base + image.mediaUrl)
  assert.equal(
    primaryImageRead.status(),
    200,
    'primary fixture image uploaded/published is readable',
  )
  const imageAcceptRead = await context.request.get(base + image.mediaUrl, {
    headers: {
      Accept:
        'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Sec-Fetch-Dest': 'image',
    },
  })
  assert.equal(imageAcceptRead.status(), 200)
  assert.match(imageAcceptRead.headers()['content-type'], /^image\//)
  await page.setContent(
    `<img src="${base + image.mediaUrl}" alt="image regression">`,
  )
  await page.waitForFunction(() => {
    const element = document.querySelector('img')!
    return element.complete && element.naturalWidth > 0
  })
  console.log(
    'PASS real admin draft, raw PNG validation, memory storage and publish',
  )
  const adminCookies = await context.cookies()
  await context.clearCookies()
  stage = 'anonymous public ticket selection'
  await page.goto(base + `/#rifa/${raffle.id}`)
  await page.waitForLoadState('networkidle')
  await page.getByText('Ver inventario paginado', { exact: true }).click()
  await page.locator('.inventory-details .ticket-number').first().click()
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click()
  await page.getByRole('heading', { name: 'Ingresa para continuar' }).waitFor()
  assert.equal((await (await helper('counts')).json()).purchases, 0)
  console.log(
    'PASS anonymous real inventory selection requires login without reservation',
  )
  // Restore an actual previously issued native client cookie, never an impersonated role.
  await context.addCookies(clientCookies)
  await page.goto(base + `/#rifa/${raffle.id}`)
  await page.waitForLoadState('networkidle')
  stage = 'lost reservation POST response and readonly recovery'
  const intent = randomBytes(16).toString('hex')
  await page.evaluate(
    ({ id, intent: token }: { id: string; intent: string }) => {
      localStorage.setItem(
        `nova.checkout.${token}`,
        JSON.stringify({
          raffleId: id,
          picks: [0],
          intentId: token,
          expires: Date.now() + 1800000,
        }),
      )
      localStorage.setItem(`nova.cart.${id}`, token)
    },
    { id: raffle.id, intent },
  )
  let posts = 0
  const evidence = { committed: false }
  await page.route('**/*', async (route: any) => {
    const request = route.request()
    if (
      request.method() === 'POST' &&
      request.url().includes('_serverFn') &&
      (request.postData() || '').includes(intent)
    ) {
      posts++
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      evidence.committed = true
      return route.abort()
    }
    return route.continue()
  })
  await page.reload()
  await page.waitForLoadState('networkidle')
  assert.equal(posts, 0)
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click()
  await page
    .getByRole('button', { name: 'CONFIRMAR APARTADO', exact: true })
    .click()
  for (let i = 0; i < 100 && !evidence.committed; i++) await delay(100)
  assert.ok(evidence.committed)
  assert.equal(posts, 1)
  const original = await rpc(purchaseModule, 'lookupOwnReservationByKey', {
    idempotencyKey: intent,
  })
  assert.match(original.id, /^[0-9a-f-]{36}$/)
  assert.equal(original.totalCents, 12345)
  const before = await (await helper('counts')).json()
  await page.goto(base + `/?checkout=${intent}`)
  await page.waitForURL(`**/mis-compras?id=${original.id}`)
  await page.waitForLoadState('networkidle')
  const after = await (await helper('counts')).json()
  assert.equal(after.purchases, before.purchases)
  assert.equal(posts, 1)
  assert.ok((await page.locator('body').innerText()).includes('Fixture Bank'))
  console.log(
    'PASS lost POST commits once; real coordinator GET recovers UUID with zero replay POST',
  )
  stage = 'owned proof upload and review'
  const proof = await context.request.post(
    `${base}/api/uploads/proofs/${original.id}`,
    { headers: { Origin: base, 'Content-Type': 'image/png' }, data: png },
  )
  assert.equal(proof.status(), 200)
  assert.equal((await proof.json()).status, 'reviewing')
  const media = await context.request.get(
    `${base}/api/media/proofs/${original.id}`,
    { maxRedirects: 0 },
  )
  assert.equal(media.status(), 200)
  assert.equal(media.headers().location, undefined)
  assert.equal(media.headers()['cache-control'], 'private, no-store')
  assert.equal(media.headers()['x-content-type-options'], 'nosniff')
  assert.equal(media.headers()['referrer-policy'], 'no-referrer')
  assert.equal(
    media.headers()['content-disposition'],
    'attachment; filename="receipt.png"',
  )
  const normalizedProof = await media.body()
  assert.deepEqual(
    await sharp(normalizedProof).raw().toBuffer(),
    await sharp(png).raw().toBuffer(),
  )
  const reviewing = await rpc(purchaseModule, 'ownPurchase', {
    id: original.id,
  })
  assert.equal(reviewing.status, 'reviewing')
  assert.equal(reviewing.expiresAt, original.expiresAt)
  assert.equal(reviewing.customer, undefined)
  await page.reload()
  await page.waitForLoadState('networkidle')
  const progress = page.getByRole('region', {
    name: 'Seguimiento del apartado',
  })
  await progress.getByText('Pago por confirmar', { exact: true }).waitFor()
  assert.ok(!(await progress.innerText()).includes('Pago confirmado'))
  assert.ok(
    (await page.locator('body').innerText()).includes(
      'sin vencimiento automático',
    ),
  )
  const secondary = await rpc(purchaseModule, 'createReservation', {
    raffleId: raffle.id,
    tickets: [1],
    idempotencyKey: randomBytes(16).toString('hex'),
  })
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
  )
  const pdfUpload = await context.request.post(
    `${base}/api/uploads/proofs/${secondary.id}`,
    { headers: { Origin: base, 'Content-Type': 'application/pdf' }, data: pdf },
  )
  assert.equal(pdfUpload.status(), 200)
  const pdfDownload = await context.request.get(
    `${base}/api/media/proofs/${secondary.id}`,
  )
  assert.equal(pdfDownload.status(), 200)
  assert.equal(
    pdfDownload.headers()['content-disposition'],
    'attachment; filename="receipt.pdf"',
  )
  assert.equal(pdfDownload.headers()['cache-control'], 'private, no-store')
  assert.deepEqual(await pdfDownload.body(), pdf)
  let amountDenied = false
  try {
    await rpc(purchaseModule, 'createReservation', {
      raffleId: raffle.id,
      tickets: [2],
      idempotencyKey: randomBytes(16).toString('hex'),
      totalCents: 1,
      userId: admin.user.id,
    })
  } catch {
    amountDenied = true
  }
  assert.ok(amountDenied)
  const clientApproval = await context.request.post(
    `${base}/api/purchases/${original.id}/approve`,
    { headers: { Origin: base }, data: { reason: 'Not authorized' } },
  )
  assert.equal(clientApproval.status(), 403)
  await context.clearCookies()
  await login('other@fixture.invalid')
  const denied = await context.request.get(
    `${base}/api/media/proofs/${original.id}`,
    { maxRedirects: 0 },
  )
  assert.ok([403, 404].includes(denied.status()))
  const forged = await context.request.get(
    `${base}/api/media/proofs/${original.id}?signature=fake&expires=9999999999999`,
  )
  assert.ok([403, 404].includes(forged.status()))
  let ownDenied = false
  try {
    await rpc(purchaseModule, 'ownPurchase', { id: original.id })
  } catch {
    ownDenied = true
  }
  assert.ok(ownDenied)
  assert.equal(
    await rpc(purchaseModule, 'lookupOwnReservationByKey', {
      idempotencyKey: intent,
    }),
    null,
  )
  console.log(
    'PASS real proof upload, direct private attachment download, cross-owner proof/order denial',
  )
  stage = 'admin paid transition and immutable snapshot'
  await context.clearCookies()
  await context.addCookies(adminCookies)
  const approve = () =>
    context.request.post(`${base}/api/purchases/${original.id}/approve`, {
      headers: { Origin: base },
      data: { reason: 'Fixture verified' },
    })
  await page.goto(base + '/dashboard#compras')
  await page
    .getByRole('button', { name: `Ver compra ${secondary.id}`, exact: true })
    .click()
  const pdfDialog = page.getByRole('dialog', {
    name: 'Detalle de compra',
    exact: true,
  })
  await pdfDialog.getByLabel('Comprobante PDF').waitFor()
  assert.match(
    await pdfDialog.getByLabel('Comprobante PDF').getAttribute('data'),
    /^blob:/,
  )
  await pdfDialog
    .getByLabel('Motivo obligatorio')
    .fill('Fixture rejected through purchase dialog')
  page.once('dialog', (dialog: any) => dialog.accept())
  await pdfDialog
    .getByRole('button', {
      name: 'Cancelar compra y liberar boletos',
      exact: true,
    })
    .click()
  await pdfDialog
    .getByText('Compra cancelada y boletos liberados. Historia conservada.', {
      exact: true,
    })
    .waitFor()
  await pdfDialog.getByRole('button', { name: 'Cerrar compra' }).click()
  console.log('PASS private PDF preview and rejection from Compras dialog')
  const reject = await context.request.post(
    `${base}/api/purchases/${secondary.id}/reject`,
    { headers: { Origin: base }, data: { reason: 'Fixture rejected payment' } },
  )
  assert.equal(reject.status(), 200)
  const rejected = await rpc(purchaseModule, 'adminPurchase', {
    id: secondary.id,
  })
  assert.equal(rejected.status, 'rejected')
  const inventory = await rpc(raffleModule, 'adminInventory', {
    id: raffle.id,
    from: 1,
    limit: 1,
  })
  assert.equal(inventory.tickets[0].state, 'available')
  console.log(
    'PASS actual PDF proof, strict caller money/actor rejection, client review denial and admin rejection releases ticket',
  )
  await page.goto(base + '/dashboard#compras')
  await page
    .getByRole('button', { name: `Ver compra ${original.id}`, exact: true })
    .click()
  const purchaseDialog = page.getByRole('dialog', {
    name: 'Detalle de compra',
    exact: true,
  })
  const proofImage = purchaseDialog.getByAltText(
    'Comprobante de transferencia subido por el comprador',
  )
  await proofImage.waitFor()
  assert.ok(
    await proofImage.evaluate(
      (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
    ),
  )
  await page.screenshot({
    path: '/tmp/juliorifa-admin-comprobante.png',
    fullPage: true,
  })
  async function purchaseDiagnostics(label: string) {
    const evidence = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      dialogs: Array.from(document.querySelectorAll('dialog.purchase-dialog')).map((dialog) => ({
        connected: dialog.isConnected,
        open: dialog.hasAttribute('open'),
        visible: dialog.getBoundingClientRect().width > 0 && dialog.getBoundingClientRect().height > 0 && getComputedStyle(dialog).visibility === 'visible',
        rect: dialog.getBoundingClientRect().toJSON(),
        summaryPresent: !!dialog.querySelector('.purchase-summary'),
        footerPresent: !!dialog.querySelector('.purchase-footer'),
        refreshing: Array.from(dialog.querySelectorAll('[role="status"]')).some((node) => node.textContent?.trim() === 'Verificando compra'),
        loading: Array.from(dialog.querySelectorAll('[role="status"]')).some((node) => node.textContent?.trim() === 'Cargando datos del servidor…'),
        saving: Array.from(dialog.querySelectorAll('[role="status"]')).some((node) => node.textContent?.trim() === 'Guardando en servidor…'),
        errorCode: dialog.querySelector('[role="alert"]') ? 'UI_ALERT_PRESENT' : 'NONE',
        closeDisabled: dialog.querySelector<HTMLButtonElement>('[aria-label="Cerrar compra"]')?.disabled ?? null,
        disabledButtonCount: dialog.querySelectorAll('button:disabled').length,
      })),
    }))
    // Only fixed checkpoint labels, DOM flags/counts and geometry; no text, URLs or purchase data.
    console.log('CHECK purchase UI:', JSON.stringify({ checkpoint: label, ...evidence }))
  }
  async function checkPurchaseRefresh(dialog: any, names: string[]) {
    await purchaseDiagnostics('refresh-before-click')
    let release!: () => void
    let intercepted!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const started = new Promise<void>((resolve) => { intercepted = resolve })
    let posts = 0
    const countPost = (request: any) => { if (request.method() === 'POST') posts++ }
    const hold = async (route: any) => {
      if (route.request().method() !== 'GET' || !route.request().url().includes('_serverFn')) return route.continue()
      const response = await route.fetch()
      intercepted()
      await gate
      await route.fulfill({ response })
    }
    page.on('request', countPost)
    await page.route('**/*', hold)
    try {
      await dialog.getByRole('button', { name: 'Actualizar', exact: true }).click()
      await started
      await dialog.getByText('Verificando compra', { exact: true }).waitFor()
      await purchaseDiagnostics('refresh-held')
      for (const name of names) assert.equal(await dialog.getByRole('button', { name, exact: true }).isDisabled(), true, `${name}: cached purchase cannot authorize during refresh`)
      assert.equal(await dialog.getByRole('button', { name: 'Cerrar compra', exact: true }).isDisabled(), false)
      assert.equal(posts, 0, 'refresh never submits a mutation')
    } catch (error) {
      await purchaseDiagnostics('refresh-held-failure').catch(() => console.log('CHECK purchase UI: DIAGNOSTIC_UNAVAILABLE'))
      throw error
    } finally {
      release()
      await page.unroute('**/*', hold)
    }
    try {
      await dialog.getByText('Verificando compra', { exact: true }).waitFor({ state: 'hidden' })
      for (const name of names) assert.equal(await dialog.getByRole('button', { name, exact: true }).isDisabled(), false, `${name}: fresh purchase restores eligibility`)
      assert.equal(posts, 0, 'fresh data never submits a mutation before explicit click')
      await purchaseDiagnostics('refresh-complete')
    } catch (error) {
      await purchaseDiagnostics('refresh-completion-failure').catch(() => console.log('CHECK purchase UI: DIAGNOSTIC_UNAVAILABLE'))
      throw error
    } finally {
      page.off('request', countPost)
    }
  }
  async function checkPurchaseLayout(dialog: any, state: string) {
    for (const [width, height] of [[1440, 900], [390, 844], [390, 480]]) {
      await purchaseDiagnostics(`layout-${state}-${width}x${height}-before-resize`)
      await page.setViewportSize({ width, height })
      await purchaseDiagnostics(`layout-${state}-${width}x${height}-after-resize`)
      try {
      assert.ok(await dialog.evaluate((element: HTMLDialogElement) => {
        const box = element.getBoundingClientRect()
        const close = element.querySelector('[aria-label="Cerrar compra"]')!.getBoundingClientRect()
        const footer = element.querySelector('.purchase-footer')!.getBoundingClientRect()
        return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth && element.scrollWidth <= element.clientWidth && close.top >= box.top && close.bottom <= box.bottom && footer.bottom <= box.bottom
      }), `${state}: modal/header/footer fit ${width}x${height}`)
      if (state === '108-expanded') {
        await dialog.locator('.purchase-tickets').scrollIntoViewIfNeeded()
      } else {
        await dialog.locator('.purchase-body').evaluate((element: HTMLElement) => { element.scrollTop = 0 })
      }
      await page.screenshot({ path: `/tmp/juliorifa-purchase-${state}-${width}x${height}.png` })
      await purchaseDiagnostics(`layout-${state}-${width}x${height}-complete`)
      } catch (error) {
        await purchaseDiagnostics(`layout-${state}-${width}x${height}-failure`).catch(() => {
          console.log('CHECK purchase UI: DIAGNOSTIC_UNAVAILABLE')
        })
        throw error
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    if (state === 'paid') await purchaseDiagnostics('restored')
  }
  await purchaseDiagnostics('reviewing-before-summary')
  assert.equal(await purchaseDialog.locator('.purchase-summary').evaluate((element: HTMLElement) => getComputedStyle(element).display), 'block')
  assert.equal(await purchaseDialog.getByText('Por confirmar', { exact: true }).count(), 1)
  await checkPurchaseLayout(purchaseDialog, 'reviewing')
  assert.equal(await proofImage.evaluate((image: HTMLImageElement) => image.getBoundingClientRect().height <= 180), true)
  await purchaseDialog
    .getByLabel('Motivo obligatorio')
    .fill('Fixture verified through purchase dialog')
  await checkPurchaseRefresh(purchaseDialog, ['Confirmar pago', 'Cancelar compra y liberar boletos'])
  page.once('dialog', (dialog: any) => dialog.accept())
  await purchaseDialog
    .getByRole('button', { name: 'Confirmar pago', exact: true })
    .click()
  await purchaseDialog
    .getByText('Pago confirmado en servidor.', { exact: true })
    .waitFor()
  await purchaseDialog.getByText('Confirmado', { exact: true }).waitFor()
  assert.equal(await purchaseDialog.getByLabel('Motivo obligatorio').count(), 0)
  assert.equal(await purchaseDialog.getByRole('button', { name: 'Confirmar pago', exact: true }).count(), 0)
  await checkPurchaseLayout(purchaseDialog, 'paid')
  try {
    await purchaseDiagnostics('before-click')
    await purchaseDialog.getByRole('button', { name: 'Cerrar compra' }).click()
  } catch (error) {
    await purchaseDiagnostics('failure')
    throw error
  }
  assert.equal((await approve()).status(), 200)
  console.log(
    'PASS actual private PNG preview and paid transition from Compras dialog',
  )
  const paidCounts = await (await helper('counts')).json()
  await approve()
  assert.equal(
    (await (await helper('counts')).json()).outbox,
    paidCounts.outbox,
  )
  await context.request.post(base + '/api/purchases/payment-settings', {
    headers: { Origin: base },
    data: { ...bank, bank: 'Changed Fixture Bank' },
  })
  const paid = await rpc(purchaseModule, 'adminPurchase', { id: original.id })
  assert.equal(paid.status, 'paid')
  assert.equal(paid.paymentInstructions.bank, bank.bank)
  console.log(
    'PASS real approval, duplicate outbox stability and immutable bank snapshot',
  )
  await context.clearCookies()
  await context.addCookies(clientCookies)
  await page.goto(base + `/mis-compras?id=${original.id}`)
  await page
    .getByRole('region', { name: 'Seguimiento del apartado' })
    .getByText('Pago confirmado', { exact: true })
    .waitFor()
  await context.clearCookies()
  await context.addCookies(adminCookies)
  await page.goto(base + `/#rifa/${raffle.id}`)
  const drawStatus = page.getByRole('region', { name: 'Estado del sorteo' })
  await page.waitForLoadState('networkidle')
  assert.equal(await drawStatus.count(), 0, 'public detail no longer mounts DrawStatus')
  stage = 'active product availability and responsive selection'
  await page.waitForLoadState('networkidle')
  let realInventory = await rpc(raffleModule, 'availableInventory', { id: raffle.id, from: raffle.startNumber, limit: 1000 })
  assert.equal(realInventory.tickets.length, raffle.ticketCount)
  const availableCount = realInventory.tickets.filter((t: any) => t.state === 'available').length
  const soldCount = realInventory.tickets.filter((t: any) => t.state === 'sold').length
  const metrics = page.getByLabel('Disponibilidad de boletos', { exact: true })
  await metrics.getByText(`${availableCount.toLocaleString('es-MX')} boletos disponibles`, { exact: true }).waitFor()
  await metrics.getByText(`${Math.floor(soldCount * 100 / raffle.ticketCount)}% vendidos`, { exact: true }).waitFor()
  assert.equal(Number(await metrics.getByRole('progressbar', { name: 'Boletos pagados' }).getAttribute('value')), soldCount)
  const suggestions = page.getByLabel('Números sugeridos', { exact: true })
  const verifySuggestions = async () => {
    const numbers = (await suggestions.locator('button').allTextContents()).map(Number)
    assert.equal(numbers.length, Math.min(8, realInventory.tickets.filter((t: any) => t.state === 'available').length))
    assert.equal(new Set(numbers).size, 8)
    assert.ok(numbers.every((n: number) => realInventory.tickets.some((t: any) => t.number === n && t.state === 'available')))
  }
  assert.equal(await suggestions.locator('button').count(), 8)
  await verifySuggestions()
  const changedNumber = realInventory.tickets.find((t: any) => t.state === 'available').number
  const beforeProductReads = await (await helper('counts')).json()
  await rpc(raffleModule, 'blockTickets', { raffleId: raffle.id, tickets: [changedNumber] })
  // The admin write does not refresh this page's cache. Only the explicit
  // refresh below must obtain a new summary, not copy its old cached value.
  await metrics.getByText(`${availableCount.toLocaleString('es-MX')} boletos disponibles`, { exact: true }).waitFor()
  const summaryResponse = () => page.waitForResponse(async (response: any) => {
    if (response.request().method() !== 'GET' || !response.url().includes('_serverFn') || response.status() !== 200) return false
    const body = await response.text()
    return body.includes('"available"') && body.includes('"sold"')
  })
  const refreshedSuggestionsSummary = summaryResponse()
  await page.getByRole('button', { name: 'Otros números' }).click()
  await refreshedSuggestionsSummary
  await metrics.getByText(`${(availableCount - 1).toLocaleString('es-MX')} boletos disponibles`, { exact: true }).waitFor()
  await metrics.getByText(`${Math.floor(soldCount * 100 / raffle.ticketCount)}% vendidos`, { exact: true }).waitFor()
  realInventory = await rpc(raffleModule, 'availableInventory', { id: raffle.id, from: raffle.startNumber, limit: 1000 })
  await page.waitForLoadState('networkidle')
  await verifySuggestions() // A refresh may legitimately return the same set.
  await rpc(raffleModule, 'unblockTickets', { raffleId: raffle.id, tickets: [changedNumber] })
  await page.getByText('Ver inventario paginado', { exact: true }).click()
  const refreshedInventorySummary = summaryResponse()
  await page.getByRole('button', { name: 'Actualizar inventario', exact: true }).click()
  await refreshedInventorySummary
  await metrics.getByText(`${availableCount.toLocaleString('es-MX')} boletos disponibles`, { exact: true }).waitFor()
  await page.getByText('Ver inventario paginado', { exact: true }).click()
  await page.getByLabel('Busca tu número especial', { exact: true }).fill(String(changedNumber))
  await page.getByRole('button', { name: 'BUSCAR', exact: true }).click()
  await page.locator('.search-result button').click()
  for (const quantity of [10, 50, 100]) {
    await page.getByRole('button', { name: `${quantity} boletos`, exact: true }).click()
    assert.equal(await page.locator('#quantity').inputValue(), String(quantity))
  }
  await page.locator('#quantity').fill('2')
  await page.locator('.quantity-form').getByRole('button', { name: 'AGREGAR', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.selected-react button').length === 3)
  const selectedNumbers = (await page.locator('.selected-react button').allTextContents()).map((label: string) => Number(label.replace('×', '').trim()))
  assert.equal(new Set(selectedNumbers).size, 3)
  assert.equal((await (await helper('counts')).json()).purchases, beforeProductReads.purchases)
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click()
  await page.waitForLoadState('networkidle')
  assert.equal(await page.locator('.selected-react button').count(), 0)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.waitForFunction(() => {
      const img = document.querySelector('.detail-image img') as HTMLImageElement
      return img?.complete && img.naturalWidth > 0
    })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
    const left = await page.locator('.product-detail').boundingBox()
    const right = await page.locator('.ticket-panel').boundingBox()
    if (width === 1440) {
      assert.ok(right.x >= left.x + left.width)
      assert.ok(Math.abs(right.y - left.y) < 2)
    } else {
      assert.ok(right.y >= left.y + left.height)
      assert.ok(Math.abs(right.x - left.x) < 2)
    }
    await page.screenshot({ path: `/tmp/juliorifa-product-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  console.log('PASS real product sold-only metrics, eight available global suggestions and responsive 1440/390/320')
  stage = 'paid-only cryptographic draw and repeat stability'
  const due = new Date(Date.now() - 1000).toISOString()
  await rpc(raffleModule, 'updateRaffle', {
    ...fields,
    id: raffle.id,
    status: 'closed',
    salesDeadline: due,
    drawAt: due,
  })
  await page.reload()
  await page.waitForLoadState('networkidle')
  assert.equal(await drawStatus.count(), 0, 'closed detail keeps DrawStatus absent')
  const productBeforeDraw = page.url()
  const beforeDraw = await (await helper('counts')).json()
  const health = await context.request.get(base + '/api/health')
  assert.equal(health.status(), 200)
  assert.deepEqual(await health.json(), { code: 'HEALTH_OK' })
  for (const [method, suffix, status, code] of [
    ['GET', '', 503, 'MAINTENANCE_DISABLED'],
    ['GET', '?batch=25', 400, 'INVALID_QUERY'],
    ['POST', '', 405, 'METHOD_NOT_ALLOWED'],
  ] as const) {
    const maintenance = await context.request.fetch(base + '/api/cron/maintenance' + suffix, { method })
    assert.equal(maintenance.status(), status)
    assert.deepEqual(await maintenance.json(), { code })
    for (const response of [health, maintenance]) {
      assert.equal(response.headers()['cache-control'], 'private, no-store')
      assert.equal(response.headers()['x-content-type-options'], 'nosniff')
      assert.equal(response.headers()['referrer-policy'], 'no-referrer')
    }
  }
  assert.deepEqual(await (await helper('counts')).json(), beforeDraw)
  console.log('PASS health liveness and denied maintenance without purchase/outbox/message changes')
  for (const token of [undefined, 'wrong-fixture', 'isolated-cron-fixture-only']) {
    const response = await context.request.get(base + '/api/cron/draw', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    assert.equal(response.status(), 410)
    assert.deepEqual(await response.json(), { error: 'AUTOMATIC_DRAW_DISABLED' })
  }
  assert.equal(await rpc(raffleModule, 'adminDraw', { id: raffle.id }), null)
  await page.goto(base + '/dashboard#rifas')
  const drawRowButton = page.locator('tbody tr').filter({ hasText: fields.title })
    .getByRole('button', { name: 'Realizar sorteo', exact: true })
  await drawRowButton.waitFor()
  const retireButton = page.locator('tbody tr').filter({ hasText: fields.title }).getByRole('button', { name: 'Retirar del catálogo', exact: true })
  assert.equal(await retireButton.isDisabled(), true, 'paid raffle without result cannot retire')
  assert.ok(await retireButton.evaluate((button: HTMLElement) => {
    const style = getComputedStyle(button)
    return parseFloat(style.borderTopWidth) > 0 && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && !!button.querySelector('svg')
  }), 'retirement has a shaped surface and icon without weakening eligibility')
  assert.ok(await drawRowButton.evaluate((button: HTMLElement) => {
    const style = getComputedStyle(button)
    return parseFloat(style.borderTopWidth) > 0 && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && !!button.querySelector('svg')
  }), 'manual draw row action has a shaped surface and icon')
  await drawRowButton.click()
  const drawDialog = page.getByRole('dialog', { name: 'Sorteo', exact: true })
  await drawDialog.getByText('Listo para confirmar', { exact: true }).waitFor()
  let releaseDrawRefresh!: () => void
  let drawRefreshIntercepted!: () => void
  const drawRefreshGate = new Promise<void>((resolve) => { releaseDrawRefresh = resolve })
  const drawRefreshStarted = new Promise<void>((resolve) => { drawRefreshIntercepted = resolve })
  const delayDrawRefresh = async (route: any) => {
    if (route.request().method() !== 'GET' || !route.request().url().includes('_serverFn')) return route.continue()
    const response = await route.fetch()
    drawRefreshIntercepted()
    await drawRefreshGate
    await route.fulfill({ response })
  }
  await page.route('**/*', delayDrawRefresh)
  try {
    await drawDialog.getByRole('button', { name: 'Actualizar resultado', exact: true }).click()
    await drawRefreshStarted
    await drawDialog.getByText('Verificando requisitos', { exact: true }).waitFor()
    assert.equal(await drawDialog.getByRole('button', { name: 'Realizar sorteo', exact: true }).isDisabled(), true, 'cached eligibility cannot enable a draw during refresh')
    assert.equal(await drawDialog.getByText('Listo para confirmar', { exact: true }).count(), 0)
  } finally {
    releaseDrawRefresh()
  }
  await drawDialog.getByText('Listo para confirmar', { exact: true }).waitFor()
  assert.equal(await drawDialog.getByRole('button', { name: 'Realizar sorteo', exact: true }).isDisabled(), false)
  await page.unroute('**/*', delayDrawRefresh)
  console.log('PASS draw refresh disables cached eligibility until fresh requirements arrive')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await drawDialog.locator('.draw-facts > div').count(), 3)
    assert.ok(await drawDialog.evaluate((dialog: HTMLDialogElement) => {
      const rect = dialog.getBoundingClientRect()
      const header = dialog.querySelector('.dialog-header')!.getBoundingClientRect()
      const close = dialog.querySelector('[aria-label="Cerrar"]')!.getBoundingClientRect()
      return rect.left >= 0 && rect.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth && close.top >= header.top && close.bottom <= header.bottom
    }), `draw modal fits ${width}px with close in header`)
    await page.screenshot({ path: `/tmp/juliorifa-draw-eligible-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await drawDialog.getByRole('button', { name: 'Realizar sorteo', exact: true }).click()
  await drawDialog.getByRole('button', { name: 'Cancelar sorteo', exact: true }).click()
  assert.equal(await rpc(raffleModule, 'adminDraw', { id: raffle.id }), null)
  await drawDialog.getByRole('button', { name: 'Realizar sorteo', exact: true }).click()
  await drawDialog.getByRole('button', { name: 'Confirmar sorteo irreversible', exact: true }).click()
  await drawDialog.getByText('Ganador registrado. Resultado y auditoría conservados.', { exact: true }).waitFor()
  await drawDialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
  const drawn = await rpc(raffleModule, 'publicDraw', { id: raffle.id })
  const drawnAgain = await rpc(raffleModule, 'executeDraw', { id: raffle.id })
  assert.deepEqual(drawnAgain, drawn)
  assert.equal(drawn.winnerTicket, 0)
  assert.equal(drawn.candidateCount, 1)
  assert.equal(
    (await (await helper('counts')).json()).outbox,
    beforeDraw.outbox,
  )
  const adminDraw = await rpc(raffleModule, 'adminDraw', { id: raffle.id })
  assert.equal(adminDraw.randomIndex, 0)
  assert.equal(adminDraw.winnerOrderId, original.id)
  assert.equal(adminDraw.source, 'manual')
  assert.ok(adminDraw.actorId)
  const publicDraw = await rpc(raffleModule, 'publicDraw', { id: raffle.id })
  assert.ok(!JSON.stringify(publicDraw).includes('@'))
  assert.equal(publicDraw.winnerTicket, 0)
  await page.goto(productBeforeDraw)
  await page.waitForLoadState('networkidle')
  assert.equal(await drawStatus.count(), 0, 'drawn detail keeps DrawStatus absent')
  await page.goto(base + '/dashboard#compras')
  console.log('PASS actual crypto draw, repeat result and public no-email DTO')
  stage = 'actual outbox rejects unverified recipient claims'
  const delivery = await (await helper('pump', 'POST')).json()
  assert.equal(delivery.sent, 0)
  assert.equal(delivery.retry, 0)
  assert.equal((await (await helper('counts')).json()).messages, 0)
  console.log('PASS notifications retired: zero new events or email delivery')
  stage = 'dashboard navigation and 14-day chart'
  await page.goto(base + '/dashboard')
  await page.waitForLoadState('networkidle')
  for (const tab of ['Resumen', 'Rifas', 'Compras', 'Ingresos']) {
    await page.locator('.sidebar nav').getByRole('link', { name: tab }).click()
    await page.waitForLoadState('networkidle')
    assert.equal(
      await page.locator('.sidebar nav [aria-current="page"]').count(),
      1,
    )
    if (tab === 'Rifas' || tab === 'Compras')
      await page.locator('tbody tr').first().waitFor()
    else await page.locator('.metric-grid').waitFor()
    await page.screenshot({
      path: `/tmp/juliorifa-admin-${tab.toLowerCase()}.png`,
      fullPage: true,
    })
    if (tab === 'Resumen') {
      await page.locator('.sales-chart circle').first().waitFor()
      assert.equal(await page.locator('.sales-chart circle title').count(), 14)
      assert.ok(
        await page
          .locator('.sales-chart circle title')
          .evaluateAll((nodes: Element[]) =>
            nodes.every(
              (node) =>
                node.childNodes.length === 1 &&
                node.firstChild?.nodeType === Node.TEXT_NODE,
            ),
          ),
      )
    }
  }
  console.log(
    'PASS four original dashboard sections and 14 single-text chart titles',
  )
  stage = 'actual RaffleEditor create draft'
  await page
    .locator('.sidebar nav')
    .getByRole('link', { name: 'Rifas' })
    .click()
  await page.getByRole('button', { name: 'Crear rifa', exact: true }).click()
  const editor = page.getByRole('dialog', {
    name: 'Editor de rifa',
    exact: true,
  })
  assert.equal(
    await editor
      .getByLabel('Precio MXN por boleto', { exact: true })
      .inputValue(),
    '25.00',
  )
  assert.equal(
    await editor
      .getByLabel('Cantidad de boletos', { exact: true })
      .inputValue(),
    '10000',
  )
  assert.equal(
    await editor
      .getByLabel('Número inicial (0 permitido)', { exact: true })
      .inputValue(),
    '0',
  )
  assert.equal(await editor.locator('.image-library img').count(), 0)
  assert.deepEqual(
    await editor.locator('.form-section > h3').allTextContents(),
    [
      '01Producto y contenido',
      '02Fecha y estado',
      '03Configuración de boletos',
      '04Costos de la rifa',
    ],
  )
  const uiTitle = 'Editor pipeline fixture'
  const civilDate = (days: number) =>
    new Date(Date.now() + days * 86400000 - 6 * 3600000)
      .toISOString()
      .slice(0, 16)
  const deadline = civilDate(2)
  const drawDate = civilDate(3)
  await editor.getByLabel('Nombre del producto', { exact: true }).fill(uiTitle)
  await editor
    .getByLabel('Descripción', { exact: true })
    .fill('Created exclusively through the original editor')
  await editor
    .getByLabel('Precio MXN por boleto', { exact: true })
    .fill('75.25')
  await editor.getByText('Opcionales avanzados', { exact: true }).click()
  await editor
    .getByLabel('Fee bps (gasto administrativo; NO recargo)', { exact: true })
    .fill('250')
  await editor.getByLabel('Costo premio MXN', { exact: true }).fill('100.50')
  await editor.getByLabel('Gastos MXN', { exact: true }).fill('10.25')
  await editor.getByLabel('Cantidad de boletos', { exact: true }).fill('8')
  await editor
    .getByLabel('Número inicial (0 permitido)', { exact: true })
    .fill('0')
  await editor.getByLabel('Cierre de ventas', { exact: true }).fill(deadline)
  await editor.getByLabel('Fecha del sorteo', { exact: true }).fill(drawDate)
  await editor
    .getByRole('button', { name: 'Añadir característica', exact: true })
    .click()
  await editor
    .getByLabel('Característica 1', { exact: true })
    .fill('Fixture specification')
  await editor
    .getByLabel('Detalle 1', { exact: true })
    .fill('Original fixture detail')
  await editor
    .getByRole('button', { name: 'Guardar rifa', exact: true })
    .click()
  await editor
    .getByText('Rifa guardada en servidor.', { exact: true })
    .waitFor()
  const savedText = await editor.getByText(/Rifa guardada: /).innerText()
  const uiId = savedText.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0]
  assert.ok(uiId, 'editor persisted original server UUID')
  const draft = await rpc(raffleModule, 'adminRaffle', { id: uiId })
  assert.equal(draft.status, 'draft')
  assert.equal(draft.priceCents, 7525)
  assert.equal(draft.startNumber, 0)
  assert.equal(draft.images.length, 0)
  stage = 'actual RaffleEditor raw image attach and publish'
  await editor
    .getByLabel('Imágenes reales PNG/JPEG/WebP, máximo 2 MB cada una', {
      exact: true,
    })
    .setInputFiles({
      name: 'editor-fixture.png',
      mimeType: 'image/png',
      buffer: png,
    })
  const realPreview = editor.locator('.preview-card > img')
  await realPreview.waitFor()
  const firstPreviewURL = await realPreview.getAttribute('src')
  assert.ok(firstPreviewURL.startsWith('blob:'))
  const imageInput = editor.getByLabel(
    'Imágenes reales PNG/JPEG/WebP, máximo 2 MB cada una',
    { exact: true },
  )
  await imageInput.setInputFiles({
    name: 'invalid.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  })
  await editor
    .getByText('Imagen inválida: PNG/JPEG/WebP de hasta 2 MB.', { exact: true })
    .waitFor()
  assert.equal(await editor.locator('.image-library img').count(), 1)
  await imageInput.setInputFiles({
    name: 'second-real.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await editor
    .getByRole('button', { name: 'Seleccionar second-real.png', exact: true })
    .click()
  assert.notEqual(await realPreview.getAttribute('src'), firstPreviewURL)
  await editor
    .getByRole('button', { name: 'Quitar second-real.png', exact: true })
    .click()
  await editor
    .getByRole('button', {
      name: 'Seleccionar editor-fixture.png',
      exact: true,
    })
    .click()
  assert.equal(await realPreview.getAttribute('src'), firstPreviewURL)
  assert.equal(
    (await rpc(raffleModule, 'adminRaffle', { id: uiId })).images.length,
    0,
  )
  await editor.evaluate((dialog: HTMLDialogElement) => {
    dialog.scrollTop = 0
  })
  await page.screenshot({ path: '/tmp/juliorifa-raffle-editor-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/juliorifa-raffle-editor-mobile.png' })
  assert.ok(
    await editor.evaluate(
      (dialog: HTMLDialogElement) => dialog.scrollWidth <= dialog.clientWidth,
    ),
  )
  await page.setViewportSize({ width: 1440, height: 1000 })
  await editor.locator('select').selectOption('active')
  await editor
    .getByRole('button', { name: 'Guardar rifa', exact: true })
    .click()
  await editor
    .getByText('Rifa guardada en servidor.', { exact: true })
    .waitFor()
  const published = await rpc(raffleModule, 'adminRaffle', { id: uiId })
  assert.equal(published.status, 'active')
  assert.equal(published.images.length, 1)
  assert.equal(published.priceCents, 7525)
  assert.equal(published.prizeCostCents, 10050)
  assert.equal(published.expensesCents, 1025)
  assert.equal(
    published.salesDeadline,
    new Date(`${deadline}-06:00`).toISOString(),
  )
  assert.equal(published.drawAt, new Date(`${drawDate}-06:00`).toISOString())
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  const uiRow = page.locator('tbody tr').filter({ hasText: uiTitle })
  await uiRow.waitFor()
  assert.ok((await uiRow.innerText()).includes('Activa'))
  await uiRow
    .getByRole('button', { name: `Editar ${uiTitle}`, exact: true })
    .click()
  stage = 'actual RaffleEditor edit title features costs dates'
  const editedTitle = 'Edited editor pipeline fixture'
  const editedDeadline = civilDate(4)
  const editedDraw = civilDate(5)
  await editor
    .getByLabel('Nombre del producto', { exact: true })
    .fill(editedTitle)
  await editor
    .getByLabel('Característica 1', { exact: true })
    .fill('Edited specification')
  await editor.getByLabel('Detalle 1', { exact: true }).fill('Edited detail')
  await editor.getByLabel('Costo premio MXN', { exact: true }).fill('125.75')
  await editor.getByLabel('Gastos MXN', { exact: true }).fill('15.50')
  await editor
    .getByLabel('Cierre de ventas', { exact: true })
    .fill(editedDeadline)
  await editor.getByLabel('Fecha del sorteo', { exact: true }).fill(editedDraw)
  await editor
    .getByRole('button', { name: 'Guardar rifa', exact: true })
    .click()
  await editor
    .getByText('Rifa guardada en servidor.', { exact: true })
    .waitFor()
  const edited = await rpc(raffleModule, 'adminRaffle', { id: uiId })
  assert.equal(edited.id, uiId)
  assert.equal(edited.title, editedTitle)
  assert.deepEqual(edited.features, [
    { title: 'Edited specification', description: 'Edited detail' },
  ])
  assert.equal(edited.prizeCostCents, 12575)
  assert.equal(edited.expensesCents, 1550)
  assert.equal(edited.priceCents, 7525)
  assert.equal(
    edited.salesDeadline,
    new Date(`${editedDeadline}-06:00`).toISOString(),
  )
  assert.equal(edited.drawAt, new Date(`${editedDraw}-06:00`).toISOString())
  const uiInventory = await rpc(raffleModule, 'adminInventory', {
    id: uiId,
    from: 0,
    limit: 1,
  })
  assert.equal(uiInventory.tickets[0].number, 0)
  assert.equal(uiInventory.tickets[0].state, 'available')
  const imageRead = await context.request.get(base + edited.images[0].mediaUrl)
  assert.equal(imageRead.status(), 200)
  assert.match(imageRead.headers()['content-type'], /^image\/png/)
  assert.deepEqual(
    await sharp(await imageRead.body())
      .raw()
      .toBuffer(),
    await sharp(png).raw().toBuffer(),
  )
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.locator('tbody tr').filter({ hasText: editedTitle }).waitFor()
  console.log(
    'PASS B original RaffleEditor draft, PNG upload/attach/publish, list, zero inventory and field edits with exact cents/dates',
  )

  // Leave only the scenario under test active, not the admin's background queries.
  await page.goto('about:blank')
  stage = 'new anonymous context same-cart native password UI'
  const cartContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  await cartContext.route('**/*', async (route: any) => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      return route.abort()
    return route.continue({
      headers: { ...route.request().headers(), 'x-forwarded-for': '127.0.0.1' },
    })
  })
  const cartPage = await cartContext.newPage()
  await cartPage.bringToFront()
  cartPage.setDefaultNavigationTimeout(60000)
  cartPage.on('pageerror', recordPageError)
  cartPage.on('console', (message: { text: () => string }) => {
    if (/hydration|hydrated|did not match/i.test(message.text()))
      hydrationErrors++
  })
  assert.equal((await cartContext.cookies()).length, 0)
  let cartReservationPosts = 0
  let cartLoginRequests = 0
  cartPage.on(
    'request',
    (request: {
      method: () => string
      url: () => string
      postData: () => string | null
    }) => {
      if (
        request.method() === 'POST' &&
        request.url().includes('/api/auth/sign-in/email')
      )
        cartLoginRequests++
      if (
        request.method() === 'POST' &&
        request.url().includes('_serverFn') &&
        (request.postData() || '').includes(uiId) &&
        (request.postData() || '').includes('idempotencyKey')
      )
        cartReservationPosts++
    },
  )
  const beforeCart = await (await helper('counts')).json()
  console.log('CHECK A anonymous context browsing')
  await cartPage.goto(base + '/')
  await cartPage.getByText(editedTitle, { exact: true }).first().waitFor()
  await cartPage.goto(base + `/#rifa/${uiId}`)
  await cartPage.waitForLoadState('networkidle')
  await cartPage.getByText('Ver inventario paginado', { exact: true }).click()
  await cartPage.locator('.inventory-details .ticket-number').first().click()
  await cartPage.getByRole('button', { name: 'CONTINUAR', exact: true }).click()
  await cartPage
    .getByRole('heading', { name: 'Ingresa para continuar', exact: true })
    .waitFor()
  await cartPage
    .getByRole('link', { name: 'Iniciar sesión', exact: true })
    .click({ noWaitAfter: true })
  await cartPage.waitForURL('**/login?checkout=*', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await cartPage.waitForLoadState('networkidle')
  const cartToken = new URL(cartPage.url()).searchParams.get('checkout')
  assert.match(cartToken || '', /^[a-f0-9]{32}$/)
  await cartPage
    .getByLabel('Correo electrónico', { exact: true })
    .fill('client@fixture.invalid')
  await cartPage.getByLabel('Contraseña', { exact: true }).fill(password)
  const submitLogin = () =>
    Promise.all([
      cartPage.waitForResponse(
        (response: { url: () => string }) =>
          response.url().includes('/api/auth/sign-in/email'),
        { timeout: 60000 },
      ),
      cartPage
        .getByRole('button', { name: 'Iniciar sesión', exact: true })
        .click({ noWaitAfter: true }),
    ])
  let [cartLoginResponse] = await submitLogin()
  if (cartLoginResponse.status() === 429) {
    console.log('CHECK A respecting native password rate-limit window (61s)')
    await delay(61000)
    ;[cartLoginResponse] = await submitLogin()
  }
  assert.equal(
    cartLoginResponse.status(),
    200,
    'same-cart native password UI HTTP status',
  )
  // SDK navigation can discard the response body; the native Location header
  // remains observable without delaying or mocking authentication.
  const callback = new URL(
    await cartLoginResponse.headerValue('location'),
    base,
  )
  assert.equal(callback.pathname, '/auth/complete')
  assert.equal(callback.searchParams.get('checkout'), cartToken)
  assert.ok(cartLoginRequests >= 1 && cartLoginRequests <= 2)
  await cartPage.waitForURL(`**/?checkout=${cartToken}#rifa/${uiId}`)
  await cartPage.waitForLoadState('networkidle')
  const cartSession = await (
    await cartContext.request.get(base + '/api/auth/get-session')
  ).json()
  assert.equal(cartSession.user.id, client.user.id)
  assert.equal(cartSession.user.role, 'client')
  assert.equal(cartSession.user.emailVerified, false)
  assert.equal((await (await helper('counts')).json()).messages, 0)
  assert.equal(
    await cartPage.locator('.inventory-details .ticket-number[aria-pressed="true"]').count(),
    1,
  )
  assert.equal(
    Number(
      await cartPage.locator('.inventory-details .ticket-number[aria-pressed="true"]').innerText(),
    ),
    0,
  )
  assert.equal(cartReservationPosts, 0)
  assert.equal(
    (await (await helper('counts')).json()).purchases,
    beforeCart.purchases,
  )
  const persisted = await cartPage.evaluate(
    (token: string) =>
      JSON.parse(localStorage.getItem(`nova.checkout.${token}`) || 'null'),
    cartToken,
  )
  assert.equal(persisted.intentId, cartToken)
  assert.deepEqual(persisted.picks, [0])
  console.log('CHECK A native callback restored selection without POST')
  stage = 'same-cart explicit confirmation creates original row'
  await cartPage
    .getByRole('button', { name: 'CONTINUAR', exact: true })
    .click({ noWaitAfter: true })
  await cartPage
    .getByRole('heading', { name: 'Confirma tu apartado', exact: true })
    .waitFor()
  console.log('CHECK A confirmation dialog opened')
  // A committed reservation stays in the dialog, reusing own snapshot/upload UI.
  await cartPage
    .getByRole('button', { name: 'CONFIRMAR APARTADO', exact: true })
    .click({ noWaitAfter: true, timeout: 60000 })
  await cartPage
    .getByRole('heading', { name: 'Apartado confirmado', exact: true })
    .waitFor()
  await cartPage.getByText('Fixture Bank', { exact: true }).waitFor()
  assert.equal(
    await cartPage
      .getByRole('button', { name: 'CONFIRMAR APARTADO', exact: true })
      .count(),
    0,
  )
  await cartPage
    .getByRole('link', { name: 'Continuar en Mis apartados', exact: true })
    .click()
  await cartPage.waitForURL('**/mis-compras?id=*', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await cartPage.waitForLoadState('networkidle')
  assert.equal(cartReservationPosts, 1)
  assert.equal(
    (await (await helper('counts')).json()).purchases,
    beforeCart.purchases + 1,
  )
  const cartOrder = await rpc(
    purchaseModule,
    'lookupOwnReservationByKey',
    { idempotencyKey: cartToken },
    cartPage,
  )
  assert.equal(new URL(cartPage.url()).searchParams.get('id'), cartOrder.id)
  assert.equal(cartOrder.raffleId, uiId)
  assert.equal(cartOrder.totalCents, 7525)
  assert.deepEqual(cartOrder.tickets, [0])
  assert.equal(cartOrder.paymentInstructions.bank, bank.bank)
  await assert.rejects(
    rpc(
      purchaseModule,
      'cancelAdminReservation',
      { id: cartOrder.id, reason: 'Unauthorized client cancellation' },
      cartPage,
    ),
  )
  await cartPage.goto(base + '/mis-compras')
  const productCard = cartPage.locator('.purchase-card').filter({ hasText: edited.title })
  await productCard.waitFor()
  assert.equal(await productCard.locator('h2').innerText(), edited.title.toUpperCase())
  assert.ok(!(await productCard.innerText()).includes(uiId))
  assert.equal(await productCard.locator('.purchase-status').innerText(), 'APARTADO · Sin comprobante')
  assert.equal(await productCard.locator('.raffle-price strong').innerText(), '$75.25')
  assert.equal(await productCard.locator('.raffle-price small').innerText(), 'MXN / total')
  const cardButton = productCard.getByRole('link', { name: /^Ver apartado:/ })
  assert.equal(await cardButton.innerText(), 'VER APARTADO')
  assert.deepEqual(await cardButton.evaluate((button: HTMLElement) => {
    const style = getComputedStyle(button)
    return [style.backgroundColor, style.clipPath.startsWith('polygon(')]
  }), ['rgb(255, 41, 63)', true])
  assert.ok(await productCard.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
  for (const width of [1440, 390, 320]) {
    await cartPage.setViewportSize({ width, height: 1000 })
    assert.ok(await cartPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `own list overflow ${width}`)
    const box = await productCard.boundingBox()
    assert.ok(box && box.width <= width)
    await cartPage.screenshot({ path: `/tmp/juliorifa-purchase-list-${width}.png`, fullPage: true })
  }
  await productCard.getByRole('link', { name: /^Ver apartado:/ }).click()
  await cartPage.waitForURL(`**/mis-compras?id=${cartOrder.id}`)
  console.log('PASS own product list image/title/status/CTA and responsive 1440/390/320')
  await cartContext.close()
  await page.goto(base + '/dashboard#compras')
  await page
    .getByRole('button', { name: `Ver compra ${cartOrder.id}`, exact: true })
    .click()
  const pendingDialog = page.getByRole('dialog', {
    name: 'Detalle de compra',
    exact: true,
  })
  await pendingDialog.getByText('Sin comprobante', { exact: true }).waitFor()
  await checkPurchaseLayout(pendingDialog, 'awaiting-proof')
  await pendingDialog
    .getByLabel('Motivo obligatorio')
    .fill('Fixture administrator cancels pending reservation')
  await checkPurchaseRefresh(pendingDialog, ['Cancelar reserva y liberar boletos'])
  page.once('dialog', (dialog: any) => dialog.accept())
  await pendingDialog
    .getByRole('button', {
      name: 'Cancelar reserva y liberar boletos',
      exact: true,
    })
    .click()
  await pendingDialog
    .getByText('Reserva cancelada o vencida; boletos liberados.', {
      exact: true,
    })
    .waitFor()
  const cancelledOrder = await rpc(purchaseModule, 'adminPurchase', {
    id: cartOrder.id,
  })
  assert.equal(cancelledOrder.status, 'cancelled')
  const released = await rpc(raffleModule, 'adminInventory', {
    id: uiId,
    from: 0,
    limit: 1,
  })
  assert.equal(released.tickets[0].state, 'available')
  await pendingDialog.getByRole('button', { name: 'Cerrar compra' }).click()
  console.log(
    'PASS client admin-cancel denied, real pending reservation cancelled from Compras and tickets released',
  )
  console.log(
    'PASS A new anonymous same-cart login UI, native password callback, restored intent/selection, zero auto POST and one explicit original reservation',
  )
  stage =
    'new signup international phone, reservation payment dialog and manual winner contact'
  const signupContext = await browser.newContext()
  await signupContext.route('**/*', async (route: any) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      ? route.continue()
      : route.abort()
  })
  const signupPage = await signupContext.newPage()
  signupPage.on('pageerror', recordPageError)
  const signupPassword = randomBytes(24).toString('hex')
  await signupPage.goto(base + '/signin')
  await signupPage.waitForLoadState('networkidle')
  await signupPage
    .getByLabel('Nombre', { exact: true })
    .fill('Phone Winner Fixture')
  await signupPage
    .getByLabel('Correo electrónico', { exact: true })
    .fill('phone-winner@fixture.invalid')
  await signupPage
    .getByRole('textbox', { name: /^Teléfono internacional/ })
    .fill('+52 (55) 9876-5432')
  await signupPage
    .getByLabel('Contraseña', { exact: true })
    .fill(signupPassword)
  await signupPage
    .getByLabel('Confirmar contraseña', { exact: true })
    .fill(signupPassword)
  const signupSubmit = () =>
    Promise.all([
      signupPage.waitForResponse((response: { url: () => string }) =>
        response.url().includes('/api/auth/sign-up/email'),
      ),
      signupPage
        .getByRole('button', { name: 'Crear cuenta', exact: true })
        .click({ noWaitAfter: true }),
    ])
  let [signupResponse] = await signupSubmit()
  if (signupResponse.status() === 429) {
    await delay(61000)
    ;[signupResponse] = await signupSubmit()
  }
  assert.equal(signupResponse.status(), 200)
  await signupPage.waitForURL(base + '/')
  const signupSession = await (
    await signupContext.request.get(base + '/api/auth/get-session')
  ).json()
  assert.equal(signupSession.user.phone, '+525598765432')
  const beforeSignupReservation = await (await helper('counts')).json()
  await signupPage.goto(base + `/#rifa/${uiId}`)
  await signupPage.waitForLoadState('networkidle')
  await signupPage.getByText('Ver inventario paginado', { exact: true }).click()
  await signupPage.locator('.inventory-details .ticket-number:not([disabled])').first().click()
  await signupPage
    .getByRole('button', { name: 'CONTINUAR', exact: true })
    .click()
  assert.equal(
    (await (await helper('counts')).json()).purchases,
    beforeSignupReservation.purchases,
  )
  await signupPage
    .getByRole('button', { name: 'CONFIRMAR APARTADO', exact: true })
    .click()
  const payment = signupPage.getByRole('dialog')
  await payment
    .getByRole('heading', { name: 'Apartado confirmado', exact: true })
    .waitFor()
  await payment.getByText(bank.bank, { exact: true }).waitFor()
  await payment.getByText('Sin comprobante', { exact: true }).waitFor()
  for (const width of [1440, 390, 320]) {
    await signupPage.setViewportSize({ width, height: 900 })
    assert.equal(await payment.evaluate((element: HTMLDialogElement) => {
      const box = element.getBoundingClientRect()
      return element.scrollWidth <= element.clientWidth && box.left >= 0 && box.right <= innerWidth && box.height <= innerHeight
    }), true)
    assert.equal(await payment.locator('.purchase-detail').evaluate((element: HTMLElement) => element.scrollWidth <= element.clientWidth), true)
  }
  await signupPage.setViewportSize({ width: 1440, height: 1000 })
  assert.equal(
    (await (await helper('counts')).json()).purchases,
    beforeSignupReservation.purchases + 1,
  )
  const ownLink = await payment
    .getByRole('link', { name: 'Continuar en Mis apartados', exact: true })
    .getAttribute('href')
  const signupOrderId = new URL(ownLink, base).searchParams.get('id')
  let proofPosts = 0
  signupPage.on('request', (request: any) => {
    if (
      request.method() === 'POST' &&
      request.url().includes('/api/uploads/proofs/')
    )
      proofPosts++
  })
  const proofInput = payment.getByLabel(
    'Subir comprobante (PNG, JPEG, WebP o PDF; máximo 4 MiB)',
    { exact: true },
  )
  await proofInput.setInputFiles({
    name: 'invalid.html',
    mimeType: 'text/html',
    buffer: Buffer.from('invalid'),
  })
  await payment.getByRole('alert').waitFor()
  assert.equal(proofPosts, 0)
  await proofInput.setInputFiles({
    name: 'too-large.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
  })
  await payment.getByRole('alert').waitFor()
  assert.equal(proofPosts, 0, 'oversized selection must never upload')
  assert.equal((await rpc(purchaseModule, 'ownPurchase', { id: signupOrderId }, signupPage)).status, 'awaiting_proof')
  await payment
    .getByLabel('Subir comprobante (PNG, JPEG, WebP o PDF; máximo 4 MiB)', {
      exact: true,
    })
    .setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: png })
  await payment
    .getByAltText('Vista previa del comprobante seleccionado')
    .waitFor()
  assert.equal(
    (
      await rpc(
        purchaseModule,
        'ownPurchase',
        { id: signupOrderId },
        signupPage,
      )
    ).status,
    'awaiting_proof',
  )
  const firstPreview = await payment
    .getByAltText('Vista previa del comprobante seleccionado')
    .getAttribute('src')
  await proofInput.setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await signupPage.waitForFunction(
    (previous: string) =>
      document.querySelector<HTMLImageElement>(
        'img[alt="Vista previa del comprobante seleccionado"]',
      )?.src !== previous,
    firstPreview,
  )
  assert.equal(
    await signupPage.evaluate(async (url: string) => {
      try {
        await fetch(url)
        return false
      } catch {
        return true
      }
    }, firstPreview),
    true,
  )
  assert.equal(proofPosts, 0, 'selection and replacement never POST')
  await signupPage.route(
    `**/api/uploads/proofs/${signupOrderId}`,
    async (route: any) => {
      const committed = await route.fetch()
      assert.equal(committed.status(), 200)
      await route.abort()
    },
  )
  await payment
    .getByRole('button', { name: 'Enviar comprobante', exact: true })
    .dblclick()
  await payment.getByText('Por confirmar', { exact: true }).waitFor()
  await signupPage.unroute(`**/api/uploads/proofs/${signupOrderId}`)
  assert.equal(
    proofPosts,
    1,
    'double confirmation and uncertain response never replay POST',
  )
  const signupOwn = await rpc(
    purchaseModule,
    'ownPurchase',
    { id: signupOrderId },
    signupPage,
  )
  assert.equal('customer' in signupOwn, false)
  assert.equal('phone' in signupOwn, false)
  await assert.rejects(
    rpc(purchaseModule, 'adminPurchase', { id: signupOrderId }, signupPage),
  )
  await signupContext.close()
  const beforeDrawPurchase = await rpc(purchaseModule, 'adminPurchase', {
    id: signupOrderId,
  })
  assert.equal(beforeDrawPurchase.status, 'reviewing')
  assert.equal(beforeDrawPurchase.customer.phone, '+525598765432')
  assert.equal(
    beforeDrawPurchase.customer.whatsapp,
    'https://wa.me/525598765432',
  )
  await page.goto(base + '/dashboard#compras')
  await page
    .getByRole('button', { name: `Ver compra ${signupOrderId}`, exact: true })
    .click()
  const contactDialog = page.getByRole('dialog', {
    name: 'Detalle de compra',
    exact: true,
  })
  await contactDialog.locator('.purchase-summary').waitFor()
  assert.equal(
    await contactDialog
      .getByRole('link', {
        name: 'WhatsApp manual',
        exact: true,
      })
      .getAttribute('href'),
    'https://wa.me/525598765432',
  )
  await contactDialog
    .getByRole('button', { name: 'Cerrar compra', exact: true })
    .click()
  console.log(
    'PASS pre-draw admin purchase manual phone contact; client denied and own DTO contact-free',
  )
  assert.equal(
    (
      await context.request.post(
        `${base}/api/purchases/${signupOrderId}/approve`,
        {
          headers: { Origin: base },
          data: { reason: 'Isolated phone winner evidence' },
        },
      )
    ).status(),
    200,
  )
  await rpc(raffleModule, 'updateRaffle', {
    id: uiId,
    title: edited.title,
    description: edited.description,
    startNumber: edited.startNumber,
    ticketCount: edited.ticketCount,
    priceCents: edited.priceCents,
    feeBps: edited.feeBps,
    prizeCostCents: edited.prizeCostCents,
    expensesCents: edited.expensesCents,
    features: edited.features,
    status: 'closed',
    salesDeadline: due,
    drawAt: due,
    images: edited.images.map((item: { key: string; alt: string }) => ({
      key: item.key,
      alt: item.alt,
    })),
  })
  await rpc(raffleModule, 'executeDraw', { id: uiId })
  const privateWinner = await rpc(raffleModule, 'adminDraw', { id: uiId })
  assert.equal(privateWinner.winnerContact.phone, '+525598765432')
  assert.equal(
    privateWinner.winnerContact.whatsapp,
    'https://wa.me/525598765432',
  )
  const publicWinner = await rpc(raffleModule, 'publicDraw', { id: uiId })
  assert.equal('winnerContact' in publicWinner, false)
  await page.goto(base + '/dashboard#rifas')
  await page
    .locator('tbody tr')
    .filter({ hasText: editedTitle })
    .getByRole('button', { name: 'Ver resultado', exact: true })
    .click()
  const winnerDialog = page.getByRole('dialog', { name: 'Sorteo', exact: true })
  await winnerDialog
    .getByText('No se envían mensajes automáticamente.', { exact: true })
    .waitFor()
  assert.equal(
    await winnerDialog
      .getByRole('link', { name: 'Abrir WhatsApp manualmente', exact: true })
      .getAttribute('href'),
    'https://wa.me/525598765432',
  )
  await winnerDialog
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click()
  console.log(
    'PASS new signup phone, immediate snapshot/proof dialog, private manual winner contact and public privacy',
  )
  stage = 'private bootstrapped short credential native login UI'
  const shortPassword = randomBytes(4).toString('hex')
  assert.equal(
    (await fetch(base + '/__fixture/bootstrap-admin', { method: 'POST' }))
      .status,
    404,
  )
  assert.equal(
    (
      await fetch(base + '/__fixture/bootstrap-admin', {
        method: 'POST',
        headers: { 'x-fixture-key': key },
        body: shortPassword,
      })
    ).status,
    200,
  )
  const shortContext = await browser.newContext()
  await shortContext.route('**/*', async (route: any) => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      return route.abort()
    return route.continue({
      headers: { ...route.request().headers(), 'x-forwarded-for': '127.0.0.1' },
    })
  })
  const shortPage = await shortContext.newPage()
  shortPage.on('pageerror', recordPageError)
  await shortPage.goto(base + '/login')
  await shortPage.waitForLoadState('networkidle')
  await shortPage
    .getByLabel('Correo electrónico', { exact: true })
    .fill('dev-admin@fixture.invalid')
  await shortPage.getByLabel('Contraseña', { exact: true }).fill(shortPassword)
  const shortSubmit = () =>
    Promise.all([
      shortPage.waitForResponse((response: { url: () => string }) =>
        response.url().includes('/api/auth/sign-in/email'),
      ),
      shortPage
        .getByRole('button', { name: 'Iniciar sesión', exact: true })
        .click({ noWaitAfter: true }),
    ])
  let [shortResponse] = await shortSubmit()
  if (shortResponse.status() === 429) {
    await delay(61000)
    ;[shortResponse] = await shortSubmit()
  }
  assert.equal(shortResponse.status(), 200)
  await enrollAdminUI(shortPage, shortPassword)
  await shortPage.waitForLoadState('networkidle')
  const shortSession = await (
    await shortContext.request.get(base + '/api/auth/get-session')
  ).json()
  assert.equal(shortSession.user.role, 'admin')
  assert.equal(shortSession.user.emailVerified, false)
  assert.ok(
    (await shortContext.cookies()).some((cookie: { name: string }) =>
      cookie.name.includes('session_token'),
    ),
  )
  assert.equal((await (await helper('counts')).json()).messages, 0)
  await shortContext.close()
  console.log(
    'PASS private short stored credential through native login UI, fresh admin session and dashboard',
  )
  stage = 'large admin purchase presentation'
  const largeRaffle = await rpc(raffleModule, 'createRaffle', { ...fields, images: [], title: '108 boletos · presentación', ticketCount: 108 })
  await rpc(raffleModule, 'updateRaffle', { ...fields, images: [], id: largeRaffle.id, title: '108 boletos · presentación', ticketCount: 108, status: 'active' })
  await context.clearCookies()
  await context.addCookies(clientCookies)
  const largeOrder = await rpc(purchaseModule, 'createReservation', { raffleId: largeRaffle.id, tickets: Array.from({ length: 108 }, (_, i) => i), idempotencyKey: randomBytes(16).toString('hex') })
  await context.clearCookies()
  await context.addCookies(adminCookies)
  await page.goto(base + '/dashboard#compras')
  await page.getByRole('button', { name: `Ver compra ${largeOrder.id}`, exact: true }).click()
  const largeDialog = page.getByRole('dialog', { name: 'Detalle de compra', exact: true })
  await largeDialog.getByText('108 boletos · presentación', { exact: true }).waitFor()
  const ticketsSection = largeDialog.locator('details').filter({ has: page.getByText('Ver 108 boletos', { exact: true }) })
  assert.equal(await ticketsSection.getAttribute('open'), null)
  await checkPurchaseLayout(largeDialog, '108-collapsed')
  await largeDialog.getByText('Ver 108 boletos', { exact: true }).click()
  assert.equal(await largeDialog.locator('.purchase-tickets li').count(), 108)
  assert.equal(await largeDialog.locator('.purchase-tickets li').first().innerText(), '0')
  assert.equal(await largeDialog.locator('.purchase-tickets li').last().innerText(), '107')
  assert.ok(await largeDialog.locator('.purchase-tickets').evaluate((element: HTMLElement) => element.clientHeight <= 180 && element.scrollHeight > element.clientHeight))
  await checkPurchaseLayout(largeDialog, '108-expanded')
  await largeDialog.getByRole('button', { name: 'Cerrar compra' }).click()
  console.log('PASS large 108-ticket admin order, collapsed/scrollable tickets and responsive safe chrome')
  stage = 'structured payment methods admin UI and immutable reservation list'
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(base + '/dashboard#configuración')
  const settings = page.getByRole('region', { name: 'Métodos de pago' })
  await settings.getByRole('heading', { name: 'Agregar destino' }).waitFor()
  stage = 'public business contact admin edit and anonymous safe links'
  const contactModule = '/src/modules/settings/contact-server.ts'
  const contactSettings = settings.getByRole('region', { name: 'Contacto público del negocio' })
  await contactSettings.getByLabel('Teléfono del negocio (opcional)').fill('+52 (55) 1234-5678')
  await contactSettings.getByLabel('WhatsApp del negocio (opcional)').fill('+52 (55) 8765-4321')
  await contactSettings.getByRole('button', { name: 'Guardar contacto' }).click()
  await contactSettings.getByText('Contacto guardado', { exact: true }).waitFor()
  await context.clearCookies()
  await page.goto(base + '/')
  const contactLinks = page.getByRole('region', { name: 'Contacto del negocio', exact: true })
  await contactLinks.getByRole('link', { name: 'WhatsApp: +525587654321' }).waitFor()
  assert.equal(await contactLinks.getByRole('link', { name: 'Llamar: +525512345678' }).getAttribute('href'), 'tel:+525512345678')
  const whatsappLink = contactLinks.getByRole('link', { name: 'WhatsApp: +525587654321' })
  assert.equal(await whatsappLink.getAttribute('href'), 'https://wa.me/525587654321')
  assert.equal(await whatsappLink.getAttribute('rel'), 'noopener noreferrer')
  assert.equal(await whatsappLink.getAttribute('referrerpolicy'), 'no-referrer')
  assert.deepEqual(await rpc(contactModule, 'publicBusinessContact', {}), { phone: '+525512345678', whatsapp: '+525587654321' })
  await assert.rejects(rpc(contactModule, 'saveBusinessContact', { phone: '', whatsapp: '' }))
  await context.addCookies(clientCookies)
  await assert.rejects(rpc(contactModule, 'adminBusinessContact', {}))
  await assert.rejects(rpc(contactModule, 'saveBusinessContact', { phone: '', whatsapp: '' }))
  await context.clearCookies()
  await context.addCookies(adminCookies)
  await page.goto(base + '/dashboard#configuración')
  await contactSettings.getByLabel('Teléfono del negocio (opcional)').fill('')
  await contactSettings.getByLabel('WhatsApp del negocio (opcional)').fill('')
  await contactSettings.getByRole('button', { name: 'Guardar contacto' }).click()
  await contactSettings.getByText('Contacto guardado', { exact: true }).waitFor()
  await page.goto(base + '/')
  assert.deepEqual(await rpc(contactModule, 'publicBusinessContact', {}), { phone: null, whatsapp: null })
  assert.equal(await contactLinks.count(), 0)
  await page.goto(base + '/dashboard#configuración')
  await settings.getByRole('heading', { name: 'Agregar destino' }).waitFor()
  console.log('PASS business contact admin edit, anonymous allowlist, safe links, client denial and disabling')
  const destinationA = '012345678901234567'
  const destinationB = '987654321098765432'
  async function addDestination(number: string) {
    await settings.getByLabel('Banco', { exact: true }).fill('Banco métodos fixture')
    await settings.getByLabel('Beneficiario', { exact: true }).fill('Titular fixture')
    await settings.getByLabel('Número', { exact: true }).fill(number)
    await settings.getByRole('button', { name: 'Guardar destino', exact: true }).click()
    await settings.locator('li').filter({ hasText: number }).waitFor()
  }
  await addDestination(destinationA)
  await addDestination(destinationB)
  const methodRaffle = await rpc(raffleModule, 'createRaffle', { ...fields, images: [], title: 'Métodos snapshot', ticketCount: 10 })
  await rpc(raffleModule, 'updateRaffle', { ...fields, images: [], id: methodRaffle.id, title: 'Métodos snapshot', ticketCount: 10, status: 'active' })
  await context.clearCookies()
  await context.addCookies(clientCookies)
  const methodsKey = randomBytes(16).toString('hex')
  const originalMethodsOrder = await rpc(purchaseModule, 'createReservation', { raffleId: methodRaffle.id, tickets: [0], idempotencyKey: methodsKey })
  assert.equal(originalMethodsOrder.paymentInstructions, null)
  assert.deepEqual(originalMethodsOrder.paymentMethods.map((method: any) => method.number), [destinationA, destinationB])
  await page.goto(base + `/mis-compras?id=${originalMethodsOrder.id}`)
  await page.getByText(destinationA, { exact: true }).waitFor()
  await page.getByText(destinationB, { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Copiar CLABE', exact: true }).count(), 2)
  await page.getByLabel('Subir comprobante (PNG, JPEG, WebP o PDF; máximo 4 MiB)', { exact: true }).waitFor()
  await context.clearCookies()
  await context.addCookies(adminCookies)
  await page.goto(base + '/dashboard#configuración')
  await settings.locator('li').filter({ hasText: destinationA }).getByRole('button', { name: 'Editar', exact: true }).click()
  const destinationEdited = '111111111111111111'
  await settings.getByLabel('Número', { exact: true }).fill(destinationEdited)
  await settings.getByRole('button', { name: 'Guardar destino', exact: true }).click()
  await settings.locator('li').filter({ hasText: destinationEdited }).waitFor()
  const secondMethodRow = settings.locator('li').filter({ hasText: destinationB })
  await secondMethodRow.getByRole('button', { name: 'Desactivar', exact: true }).click()
  await secondMethodRow.getByRole('button', { name: 'Activar', exact: true }).waitFor()
  await context.clearCookies()
  await context.addCookies(clientCookies)
  const retryMethodsOrder = await rpc(purchaseModule, 'createReservation', { raffleId: methodRaffle.id, tickets: [0], idempotencyKey: methodsKey })
  assert.equal(retryMethodsOrder.id, originalMethodsOrder.id)
  assert.deepEqual(retryMethodsOrder.paymentMethods, originalMethodsOrder.paymentMethods)
  const laterMethodsOrder = await rpc(purchaseModule, 'createReservation', { raffleId: methodRaffle.id, tickets: [1], idempotencyKey: randomBytes(16).toString('hex') })
  assert.deepEqual(laterMethodsOrder.paymentMethods.map((method: any) => method.number), [destinationEdited])
  await page.goto(base + `/mis-compras?id=${originalMethodsOrder.id}`)
  await page.getByText(destinationA, { exact: true }).waitFor()
  await page.getByText(destinationB, { exact: true }).waitFor()
  await page.goto(base + `/mis-compras?id=${laterMethodsOrder.id}`)
  await page.getByText(destinationEdited, { exact: true }).waitFor()
  assert.equal(await page.getByText(destinationB, { exact: true }).count(), 0)
  await context.clearCookies()
  await context.addCookies(adminCookies)
  console.log('PASS two same-type destinations through admin UI, customer proof flow retained, edit/deactivate immutable snapshots and original idempotent retry')
  stage = 'desktop/mobile overflow'
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const path of ['/', '/dashboard', '/mis-compras']) {
      await page.goto(base + path)
      await page.waitForLoadState('networkidle')
      if (path === '/dashboard' && width === 390) {
        await page.locator('.metric-grid').waitFor()
        await page.screenshot({
          path: '/tmp/juliorifa-admin-mobile.png',
          fullPage: true,
        })
      }
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `overflow width ${width} path ${path}`,
      )
    }
  }
  console.log('PASS desktop/mobile public/account/admin document overflow')
  console.log(`CHECK image endpoint failures: ${imageFailures.length}`)
  assert.equal(imageFailures.length, 0)
  assert.equal(pageErrors, 0, 'browser page errors')
  assert.equal(hydrationErrors, 0, 'browser hydration errors')
  console.log('PASS no browser pageerror/hydration diagnostics')
  stage = 'actual logout clears private route access'
  await page.getByRole('button', { name: 'Salir', exact: true }).click()
  await page.waitForURL(base + '/')
  await page.goto(base + '/dashboard')
  await page.waitForURL('**/login**')
  await page.goto(base + '/mis-compras')
  await page.waitForURL('**/login**')
  assert.ok(!(await page.locator('body').innerText()).includes(bank.account))
  console.log('PASS actual logout and no previous private bank/account view')
  }
} catch (error) {
  if (authUiSnapshot) {
    const snapshot = await authUiSnapshot().catch(() => ({ ui: 'UNAVAILABLE' }))
    console.error('CHECK auth UI failure:', JSON.stringify(snapshot))
  }
  if (error instanceof assert.AssertionError)
    console.error(
      `Assertion: ${String(error.message)
        .split('\n')[0]
        .replace(
          /https?:\/\/\S+|[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+/g,
          '[private]',
        )}`,
    )
  if (
    error instanceof assert.AssertionError &&
    typeof error.actual === 'number'
  )
    console.error(
      `Observed numeric assertion: ${error.actual} expected ${error.expected}`,
    )
  if (error instanceof Error)
    console.error(
      error.message
        .split('\n')
        .slice(0, 25)
        .join('\n')
        .replace(/https?:\/\/\S+/g, '[URL]')
        .replace(/[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+/g, '[email]')
        .replace(/[a-zA-Z0-9_-]{32,}/g, '[redacted]'),
    )
  // Report categories only; raw exceptions and Vite logs may contain private URLs.
  const categories = [
    'ECONNREFUSED',
    'DATABASE_URL',
    'server-only',
    'Cannot find',
    'does not provide an export',
    'Internal Server Error',
    'ERR_',
    'Error:',
  ].filter((term) => diagnostics.includes(term))
  console.error(
    `FAIL ${stage}; diagnostic categories: ${categories.join(', ') || 'assertion or timeout'}`,
  )
  const safe = diagnostics
    .split('\n')
    .filter((line) =>
      /^(Error:|SyntaxError:|TypeError:|\s+at .*tests\/e2e\/|\s+at .*vite.e2e)/.test(
        line,
      ),
    )
    .map((line) =>
      line
        .replace(/https?:\/\/\S+/g, '[URL]')
        .replace(/[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+/g, '[email]')
        .replace(/[a-f0-9]{32,}/gi, '[redacted]'),
    )
  console.error(safe.slice(0, 8).join('\n'))
  process.exitCode = 1
} finally {
  await browser?.close()
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(5000),
    ])
    // Process state can change while awaiting the graceful shutdown above.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (child.exitCode === null) {
      child.kill('SIGKILL')
      await new Promise((resolve) => child.once('exit', resolve))
    }
  }
}
