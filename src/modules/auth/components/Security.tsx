import { useState } from 'react'
import { authClient } from '../../../lib/auth-client'
import { MfaVerification } from './MfaVerification'

export function Security({ enrolled }: { enrolled: boolean }) {
  const [password, setPassword] = useState('')
  const [setup, setSetup] = useState<{ key: string; backupCodes: string[] } | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <main className="nova-auth"><section className="nova-auth-card">
    <a href="/">← Catálogo público</a>
    <h1>Seguridad administrativa</h1>
    <p>Para administrar rifas debes verificar un segundo factor. No se envían códigos por correo ni WhatsApp.</p>
    {enrolled ? <MfaVerification /> : setup ? <>
      <p>Agrega una cuenta manual en tu aplicación autenticadora: Rifas Nova, clave de tiempo (TOTP), 6 dígitos, cada 30 segundos.</p>
      <label>Clave de configuración<input aria-label="Clave de configuración" readOnly value={setup.key} autoComplete="off" /></label>
      <h2>Códigos de respaldo</h2>
      <p>Guárdalos en un lugar privado fuera de esta aplicación. Cada código se consume una sola vez. No los compartas.</p>
      <ul>{setup.backupCodes.map(code => <li key={code}><code>{code}</code></li>)}</ul>
      <label className="nova-mfa-saved"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} /> Guardé mis códigos de respaldo</label>
      {saved && <MfaVerification allowBackup={false} />}
    </> : <form onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      setBusy(true)
      try {
        const result = await authClient.twoFactor.enable({ password })
        setPassword('')
        if (result.error || result.data?.method !== 'totp') {
          setMessage('No pudimos iniciar la configuración. Revisa tu contraseña o intenta más tarde.')
        } else {
          const key = new URL(result.data.totpURI).searchParams.get('secret')
          if (!key) throw new Error('Missing enrollment key')
          setSetup({ key, backupCodes: result.data.backupCodes })
        }
      } catch { setMessage('No pudimos iniciar la configuración. Intenta de nuevo.') }
      finally { setBusy(false) }
    }}>
      <label>Contraseña actual<input type="password" required minLength={1} maxLength={128} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button type="submit" disabled={busy}>{busy ? 'Configurando…' : 'Configurar aplicación autenticadora'}</button>
    </form>}
    <p role="status">{message}</p>
    <p>Si pierdes tu aplicación y todos los respaldos, no hay recuperación automática. Contacta al operador autorizado; no compartas contraseñas.</p>
    <button type="button" onClick={async () => { const result = await authClient.signOut(); if (!result.error) window.location.assign('/login') }}>Cerrar sesión</button>
  </section></main>
}
