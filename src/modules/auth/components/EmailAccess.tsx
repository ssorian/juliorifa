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
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(
    error ? 'El enlace no es válido o ha caducado. Solicita otro.' : '',
  )
  const suffix = safeCheckoutId(checkout) ? `?checkout=${checkout}` : ''
  return (
    <main className="mx-auto max-w-md p-8">
      <a href="/">← Catálogo público</a>
      <h1>{signup ? 'Crear cuenta cliente' : 'Iniciar sesión'}</h1>
      <p>
        Sin contraseña. Recibirás un enlace de un solo uso válido por 5 minutos.
        Si tu correo es nuevo, al verificarlo se crea automáticamente una cuenta
        cliente.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          try {
            const result = await authClient.signIn.magicLink({
              email: email.trim(),
              ...(signup && name.trim() ? { name: name.trim() } : {}),
              callbackURL: completionPath(checkout),
              newUserCallbackURL: completionPath(checkout),
              errorCallbackURL: '/login?error=link',
            })
            setMessage(
              result.error
                ? 'No pudimos enviar el enlace. Intenta más tarde.'
                : 'Revisa tu correo para continuar. Puedes abrir el enlace en otra pestaña de este navegador.',
            )
          } catch {
            setMessage('No pudimos enviar el enlace. Intenta más tarde.')
          } finally {
            setBusy(false)
          }
        }}
      >
        {signup && (
          <label>
            Nombre (opcional)
            <input
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
        <button type="submit" disabled={busy}>
          {busy ? 'Enviando…' : 'Enviar enlace de acceso'}
        </button>
      </form>
      <p role="status">{message}</p>
      <a href={`${signup ? '/login' : '/signin'}${suffix}`}>
        {signup ? 'Ya tengo cuenta' : 'Registrarme como cliente'}
      </a>
      <p>Demo local: no realizamos cobros ni reservas.</p>
    </main>
  )
}
