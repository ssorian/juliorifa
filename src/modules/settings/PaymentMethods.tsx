import { useState } from 'react'
import { BusinessContactSettings } from './BusinessContact'
import './styles.css'
import { useAdminQuery, useAdminAction } from '../dashboard/hooks/useAdmin'
import { Feedback } from '../dashboard/components/Feedback'
import {
  adminPaymentMethods,
  addPaymentMethod,
  editPaymentMethod,
  activatePaymentMethod,
} from './server'
import { methodLabels, methodTypes } from './domain'
import type { ConfiguredMethod, PaymentMethod } from './domain'

const empty = {
  type: 'clabe' as PaymentMethod['type'],
  bank: '',
  beneficiary: '',
  number: '',
  instructions: '',
}
export function PaymentMethods() {
  const query = useAdminQuery('payment-methods', '', () =>
    adminPaymentMethods({ data: {} }),
  )
  const action = useAdminAction()
  const [editing, setEditing] = useState<ConfiguredMethod | null>(null)
  const [form, setForm] = useState(empty)
  function reset() {
    setEditing(null)
    setForm(empty)
  }
  return (
    <section aria-label="Métodos de pago" className="payment-method-settings">
      <BusinessContactSettings />
      <p>
        Destinos para transferencia manual. No procesamos pagos ni verificamos
        la titularidad. Los cambios solo afectan apartados nuevos.
      </p>
      <Feedback pending={query.isPending} error={query.error} />
      {action.error && <p role="alert">{action.error}</p>}
      {action.notice && <p role="status">{action.notice}</p>}
      {query.data && (
        <>
          {query.data.length === 0 && (
            <p>
              Aún no hay destinos registrados. Puede usarse la configuración
              bancaria legacy del servidor.
            </p>
          )}
          {query.data.length > 0 && !query.data.some((row) => row.active) && (
            <p>
              No hay destinos activos. Los apartados nuevos no tendrán
              instrucciones; no se recuperan cuentas legacy.
            </p>
          )}
          <ul className="payment-method-list">
            {query.data.map((row) => (
              <li key={row.id}>
                <h3>
                  {methodLabels[row.type]} · {row.bank}
                </h3>
                <p>
                  {row.beneficiary} · <code>{row.number}</code>
                </p>
                {row.instructions && <p>{row.instructions}</p>}
                <p>{row.active ? 'Activo' : 'Inactivo'}</p>
                <button
                  className="button"
                  disabled={action.busy}
                  onClick={() => {
                    setEditing(row)
                    setForm({
                      type: row.type,
                      bank: row.bank,
                      beneficiary: row.beneficiary,
                      number: row.number,
                      instructions: row.instructions,
                    })
                  }}
                >
                  Editar
                </button>
                <button
                  className="button"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(
                      () =>
                        activatePaymentMethod({
                          data: { id: row.id, active: !row.active },
                        }),
                      'Estado actualizado',
                    )
                  }
                >
                  {row.active ? 'Desactivar' : 'Activar'}
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              const result = await action.run(
                () =>
                  editing
                    ? editPaymentMethod({ data: { ...form, id: editing.id } })
                    : addPaymentMethod({ data: form }),
                'Destino guardado',
              )
              if (result) reset()
            }}
          >
            <h3>{editing ? 'Editar destino' : 'Agregar destino'}</h3>
            <label>
              Tipo
              <select
                value={form.type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    type: event.target.value as PaymentMethod['type'],
                  })
                }
              >
                {methodTypes.map((type) => (
                  <option key={type} value={type}>
                    {methodLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Banco
              <input
                required
                maxLength={100}
                value={form.bank}
                onChange={(event) =>
                  setForm({ ...form, bank: event.target.value })
                }
              />
            </label>
            <label>
              Beneficiario
              <input
                required
                maxLength={200}
                value={form.beneficiary}
                onChange={(event) =>
                  setForm({ ...form, beneficiary: event.target.value })
                }
              />
            </label>
            <label>
              Número
              <input
                required
                inputMode="numeric"
                pattern={
                  form.type === 'clabe'
                    ? '[0-9]{18}'
                    : form.type === 'card'
                      ? '[0-9]{16}'
                      : '[0-9]{1,20}'
                }
                maxLength={
                  form.type === 'clabe' ? 18 : form.type === 'card' ? 16 : 20
                }
                value={form.number}
                onChange={(event) =>
                  setForm({ ...form, number: event.target.value })
                }
              />
            </label>
            <label>
              Instrucciones (opcional)
              <textarea
                maxLength={2000}
                value={form.instructions}
                onChange={(event) =>
                  setForm({ ...form, instructions: event.target.value })
                }
              />
            </label>
            <button className="button primary" disabled={action.busy}>
              Guardar destino
            </button>
            {editing && (
              <button
                type="button"
                className="button"
                disabled={action.busy}
                onClick={reset}
              >
                Cancelar edición
              </button>
            )}
          </form>
        </>
      )}
    </section>
  )
}
