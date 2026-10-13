import { registerHooks } from 'node:module'

export function installIsolation() {
  const root = new URL('../../src/', import.meta.url).href
  const bridge = new URL('./bridge.ts', import.meta.url).href
  return registerHooks({
    resolve(specifier, ctx, next) {
      if (specifier === '@tanstack/react-start/server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true }
      if (ctx.parentURL?.startsWith(root)) {
        const resolved = specifier.startsWith('.') ? new URL(specifier, ctx.parentURL).href.replace(/\.ts$/, '').replace(/\/index$/, '') : specifier
        if (resolved === `${root}db` || resolved === `${root}modules/auth/services/authorization`) return { url: bridge, shortCircuit: true }
        // A new production dependency on Auth/config must fail closed, not load server env.
        if (resolved === `${root}lib/auth` || resolved === `${root}config/env`) throw new Error('ISOLATION_IMPORT')
      }
      return next(specifier, ctx)
    },
  })
}
