import { useState } from 'react'
import { authClient } from '../../../lib/auth-client'
import { completionPath, safeCheckoutId } from '../lib/policy'

export function EmailAccess({
  signup,
  checkout,
  error,
}: {
  signup?: boolean
  checkout?: string
  error?: string
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(
    error ? 'No pudimos completar el acceso. Intenta de nuevo.' : '',
  )
  const suffix = safeCheckoutId(checkout) ? `?checkout=${checkout}` : ''
  return (
    <main className="nova-auth">
      <div className="nova-auth-shell">
        <header className="nova-auth-header">
          <a
            className="nova-auth-brand"
            href="/"
            aria-label="NOVA Rifas · Catálogo público"
          >
            <span className="nova-auth-symbol" aria-hidden="true">
              N
            </span>
            <span>
              NOVA<small>RIFAS</small>
            </span>
          </a>
          <a className="nova-auth-back" href="/">
            ← Catálogo público
          </a>
        </header>
        <section className="nova-auth-card" aria-labelledby="nova-auth-title">
          <p className="nova-auth-eyebrow">// ACCESS</p>
          <h1 id="nova-auth-title">
            {signup ? 'Crear cuenta cliente' : 'Iniciar sesión'}
          </h1>
          <p>
            {signup
              ? 'Crea una cuenta cliente con contraseña de 12 a 128 caracteres; el registro no verifica la propiedad del correo.'
              : 'Accede con tu correo y contraseña actual.'}
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (busy) return
              if (signup && password !== confirmation) {
                setMessage('Las contraseñas deben coincidir.')
                return
              }
              setBusy(true)
              try {
                const credentials = {
                  email: email.trim(),
                  password,
                  callbackURL: completionPath(checkout),
                }
                const result = signup
                  ? await authClient.signUp.email({
                      ...credentials,
                      name: name.trim(),
                    })
                  : await authClient.signIn.email(credentials)
                if (result.error) {
                  setMessage(
                    'No pudimos completar el acceso. Revisa los datos o intenta más tarde.',
                  )
                } else {
                  window.location.assign(completionPath(checkout))
                }
              } catch {
                setMessage('No pudimos completar el acceso. Intenta más tarde.')
              } finally {
                setBusy(false)
              }
            }}
          >
            {signup && (
              <label>
                Nombre
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Correo electrónico
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                autoComplete="email"
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                required
                minLength={signup ? 12 : 1}
                maxLength={128}
                autoComplete={signup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {signup && (
              <label>
                Confirmar contraseña
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
            )}
            <button type="submit" disabled={busy}>
              {busy
                ? 'Accediendo…'
                : signup
                  ? 'Crear cuenta'
                  : 'Iniciar sesión'}
            </button>
          </form>
          <p className="nova-auth-status" role="status" aria-live="polite">
            {message}
          </p>
          <a
            className="nova-auth-alternate"
            href={`${signup ? '/login' : '/signin'}${suffix}`}
          >
            {signup ? 'Ya tengo cuenta' : 'Registrarme como cliente'}
          </a>
          <p className="nova-auth-note">
            La recuperación de contraseña y la verificación por correo no están
            disponibles.
          </p>
        </section>
        <footer className="nova-auth-footer">NOVA / ACCESO CLIENTE</footer>
      </div>
    </main>
  )
}
