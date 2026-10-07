import { useState } from 'react'
import { useAdminQuery, useAdminAction } from '../hooks/useAdmin'
import { Feedback, ActionFeedback } from './Feedback'
import type { PaymentInstructions } from '../../purchases/types'

const empty: PaymentInstructions = {
  bank: '',
  beneficiary: '',
  account: '',
  instructions: '',
}
async function settingsRequest(
  data?: PaymentInstructions,
): Promise<PaymentInstructions | null> {
  const response = await fetch('/api/purchases/payment-settings', {
    method: data ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  })
  const result = await response.json()
  if (!response.ok)
    throw new Error(result.error ?? 'Configuración no disponible.')
  return result
}
export function Settings() {
  const query = useAdminQuery('settings', '', () => settingsRequest())
  return (
    <section className="panel">
      <h2>Configuración bancaria</h2>
      <Feedback pending={query.isPending} error={query.error} />
      {query.data === null && (
        <p role="alert">
          Sin configuración: las reservas públicas están bloqueadas. Completa
          banco, beneficiario, cuenta e instrucciones.
        </p>
      )}
      {query.data !== undefined && (
        <SettingsForm
          initial={query.data ?? empty}
          key={JSON.stringify(query.data)}
        />
      )}
    </section>
  )
}
function SettingsForm({ initial }: { initial: PaymentInstructions }) {
  const [fields, setFields] = useState(initial),
    action = useAdminAction()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void action.run(
          () => settingsRequest(fields),
          'Configuración guardada y auditada; compras anteriores conservan su snapshot.',
        )
      }}
    >
      <p>
        Solo las nuevas reservas reciben estos datos. No modifica las
        instrucciones ni cuentas de compras existentes.
      </p>
      {(Object.keys(empty) as Array<keyof PaymentInstructions>).map((key) => (
        <label key={key}>
          {
            {
              bank: 'Banco',
              beneficiary: 'Beneficiario',
              account: 'Cuenta / CLABE',
              instructions: 'Instrucciones',
            }[key]
          }
          <textarea
            required
            disabled={action.busy}
            maxLength={key === 'instructions' ? 4000 : 200}
            value={fields[key]}
            onChange={(e) =>
              setFields((old) => ({ ...old, [key]: e.target.value }))
            }
          />
        </label>
      ))}
      <ActionFeedback {...action} />
      <button disabled={action.busy} className="button primary">
        Guardar configuración
      </button>
    </form>
  )
}
