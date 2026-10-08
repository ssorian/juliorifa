import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'

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
      'CHECK browser error categories:',
      category.join(',') || 'unclassified',
    )
  }
  page.on('pageerror', recordPageError)
  page.on('console', (message: { text: () => string }) => {
    if (/hydration|hydrated|did not match/i.test(message.text()))
      hydrationErrors++
  })
  stage = 'visitor private route guards'
  for (const path of ['/dashboard', '/mis-compras']) {
    await page.goto(base + path)
    await page.waitForURL('**/login**')
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
    password: randomBytes(4).toString('hex'),
  })
  assert.equal(weak.status(), 400)
  const replacement = randomBytes(24).toString('hex')
  const duplicate = await nativeAuth('sign-up/email', {
    email: 'client@fixture.invalid',
    name: 'Replacement',
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
  await page.waitForLoadState('networkidle')
  assert.ok(!page.url().includes('/login'))
  console.log('PASS native promoted admin dashboard')
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
  const settings = await context.request.post(
    base + '/api/purchases/payment-settings',
    { headers: { Origin: base }, data: bank },
  )
  assert.equal(settings.status(), 410, 'retired bank configuration endpoint')
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
  console.log(
    'PASS real admin draft, raw PNG validation, memory storage and publish',
  )
  const adminCookies = await context.cookies()
  await context.clearCookies()
  stage = 'anonymous public ticket selection'
  await page.goto(base + `/#rifa/${raffle.id}`)
  await page.waitForLoadState('networkidle')
  await page.locator('.ticket-number').first().click()
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
  await purchaseDialog
    .getByLabel('Motivo obligatorio')
    .fill('Fixture verified through purchase dialog')
  page.once('dialog', (dialog: any) => dialog.accept())
  await purchaseDialog
    .getByRole('button', { name: 'Confirmar pago', exact: true })
    .click()
  await purchaseDialog
    .getByText('Pago confirmado en servidor.', { exact: true })
    .waitFor()
  await purchaseDialog.getByRole('button', { name: 'Cerrar compra' }).click()
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
  stage = 'paid-only cryptographic draw and repeat stability'
  const due = new Date(Date.now() - 1000).toISOString()
  await rpc(raffleModule, 'updateRaffle', {
    ...fields,
    id: raffle.id,
    status: 'closed',
    salesDeadline: due,
    drawAt: due,
  })
  const beforeDraw = await (await helper('counts')).json()
  const drawn = await rpc(raffleModule, 'executeDraw', { id: raffle.id })
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
  const publicDraw = await rpc(raffleModule, 'publicDraw', { id: raffle.id })
  assert.ok(!JSON.stringify(publicDraw).includes('@'))
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
  const uiTitle = 'Editor pipeline fixture'
  const civilDate = (days: number) =>
    new Date(Date.now() + days * 86400000 - 6 * 3600000)
      .toISOString()
      .slice(0, 16)
  const deadline = civilDate(2)
  const drawDate = civilDate(3)
  await editor.getByLabel('Título', { exact: true }).fill(uiTitle)
  await editor
    .getByLabel('Descripción', { exact: true })
    .fill('Created exclusively through the original editor')
  await editor
    .getByLabel('Precio MXN por boleto', { exact: true })
    .fill('75.25')
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
    .getByRole('button', { name: 'Guardar en servidor', exact: true })
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
  await editor.locator('select').selectOption('active')
  await editor
    .getByRole('button', { name: 'Guardar en servidor', exact: true })
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
  await editor.getByLabel('Título', { exact: true }).fill(editedTitle)
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
    .getByRole('button', { name: 'Guardar en servidor', exact: true })
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
        (request.postData() || '').includes(uiId)
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
  await cartPage.locator('.ticket-number').first().click()
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
    await cartPage.locator('.ticket-number[aria-pressed="true"]').count(),
    1,
  )
  assert.equal(
    Number(
      await cartPage.locator('.ticket-number[aria-pressed="true"]').innerText(),
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
  // Confirmation performs a full location.assign after the server commits.
  // Do not conflate Playwright's click/navigation auto-wait with that business
  // result: wait explicitly for the real owned-order route instead.
  await cartPage
    .getByRole('button', { name: 'CONFIRMAR APARTADO', exact: true })
    .click({ noWaitAfter: true, timeout: 60000 })
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
  await cartContext.close()
  await page.goto(base + '/dashboard#compras')
  await page
    .getByRole('button', { name: `Ver compra ${cartOrder.id}`, exact: true })
    .click()
  const pendingDialog = page.getByRole('dialog', {
    name: 'Detalle de compra',
    exact: true,
  })
  await pendingDialog
    .getByLabel('Motivo obligatorio')
    .fill('Fixture administrator cancels pending reservation')
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
  await shortPage.waitForURL(base + '/dashboard')
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
} catch (error) {
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
