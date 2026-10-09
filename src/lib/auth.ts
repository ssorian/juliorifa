import '@tanstack/react-start/server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import {
  phoneField,
  validateRegistrationPhone,
} from '../modules/auth/lib/registration'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '../db'
import { authConfig } from '../config/auth'
import { initialRole } from '../modules/auth/lib/policy'
import {
  passwordSettings,
  authRateLimit,
  normalizeCallback,
} from '../modules/auth/lib/auth-settings'

export const auth = betterAuth({
  baseURL: authConfig.baseURL,
  secret: authConfig.secret,
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: passwordSettings,
  rateLimit: authRateLimit,
  session: { cookieCache: { enabled: false } },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'client', input: false },
      phone: phoneField,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, role: initialRole(user) },
        }),
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Enforce only signup, not login or existing-user reservations.
      validateRegistrationPhone(ctx)
      // Direct API callers cannot choose an external or role-specific destination.
      if (['/sign-in/email', '/sign-up/email'].includes(ctx.path) && ctx.body) {
        ctx.body.callbackURL = normalizeCallback(ctx.body.callbackURL)
      }
    }),
  },
  plugins: [tanstackStartCookies()],
})
