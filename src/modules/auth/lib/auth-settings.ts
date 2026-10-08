import { completionPath } from './policy'

export const passwordSettings = {
  enabled: true,
  minPasswordLength: 12,
  maxPasswordLength: 128,
  requireEmailVerification: false,
  autoSignIn: true,
} as const

export const authRateLimit = {
  enabled: true,
  storage: 'memory',
  customRules: {
    '/sign-in/email': { max: 5, window: 60 },
    '/sign-up/email': { max: 5, window: 60 },
  },
} as const

export function normalizeCallback(callback: unknown): string {
  try {
    const url = new URL(
      typeof callback === 'string' ? callback : '',
      'https://local.invalid',
    )
    return completionPath(url.searchParams.get('checkout'))
  } catch {
    return completionPath(undefined)
  }
}
