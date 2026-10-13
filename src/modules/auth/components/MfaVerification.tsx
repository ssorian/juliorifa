import { useState } from 'react'
import { authClient } from '../../../lib/auth-client'
import { completionPath } from '../lib/policy'

export function MfaVerification({ checkout, allowBackup = true }: { checkout?: string; allowBackup?: boolean }) {
  const [backup, setBackup] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <form onSubmit={async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const result = backup
        ? await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice: false })
        : await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: false })
      setCode('')
      if (result.error) setMessage('Código inválido o vencido. Intenta más tarde si alcanzaste el límite.')
      else window.location.assign(completionPath(checkout))
    } catch { setMessage('No pudimos verificar el código. Intenta de nuevo.') }
    finally { setBusy(false) }
  }}>
    <label>{backup ? 'Código de respaldo de un solo uso' : 'Código de tu aplicación autenticadora'}
      <input required value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code"
        inputMode={backup ? 'text' : 'numeric'} maxLength={backup ? 32 : 6} minLength={backup ? 1 : 6} />
    </label>
    <button disabled={busy} type="submit">{busy ? 'Verificando…' : 'Verificar código'}</button>
    {allowBackup && <button disabled={busy} type="button" onClick={() => { setBackup(!backup); setCode(''); setMessage('') }}>
      {backup ? 'Usar aplicación autenticadora' : 'Usar código de respaldo'}
    </button>}
    <p role="status">{message}</p>
  </form>
}
