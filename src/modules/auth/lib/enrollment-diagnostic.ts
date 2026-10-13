const enrollmentCodes = new Set([
  'MFA_REQUIRED', 'INVALID_PASSWORD', 'INVALID_ORIGIN', 'UNAUTHORIZED',
  'INVALID_SESSION', 'SESSION_EXPIRED', 'TOTP_ALREADY_ENABLED',
  'TOTP_NOT_CONFIGURED', 'OTP_NOT_CONFIGURED', 'TOO_MANY_REQUESTS',
  'INTERNAL_SERVER_ERROR',
])

// Diagnostic allowlist only. Never return provider messages, URI, codes or credentials.
export function enrollmentDiagnostic(status: number, body: unknown) {
  const record = body && typeof body === 'object'
    ? body as Record<string, unknown>
    : {}
  return {
    status,
    code: typeof record.code === 'string' && enrollmentCodes.has(record.code)
      ? record.code : 'UNCLASSIFIED',
    nativeTotpShape: record.method === 'totp' &&
      typeof record.totpURI === 'string' && Array.isArray(record.backupCodes),
  }
}
