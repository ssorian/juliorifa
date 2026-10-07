// Optional local smoke: no cookies, no DB session, no email requests.
// Requires the already running dev server on the authorized local port.
const origin = 'http://127.0.0.1:3210'
for (const path of [
  '/login',
  '/signin',
  '/dashboard/',
  '/auth/complete?checkout=%2F%2Fevil.test',
]) {
  let url = origin + path
  let html = ''
  let status = 0
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, { redirect: 'manual' })
    status = response.status
    html = await response.text()
    const target = response.headers.get('location')
    if (!target) break
    url = new URL(target, url).href
    if (new URL(url).origin !== origin) throw new Error('Unsafe redirect')
  }
  if (status !== 200 || !html.includes('type="email"'))
    throw new Error('Expected public email form')
  if (path.startsWith('/dashboard') || path.startsWith('/auth/complete')) {
    if (new URL(url).pathname !== '/login' || html.includes('Resumen'))
      throw new Error('Unauthorized SSR leakage')
  }
  console.info(`${path}: public form / protected redirect OK`)
}
export {}
