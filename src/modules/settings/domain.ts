import { z } from 'zod'

export const methodTypes = ['clabe', 'card', 'account'] as const
export interface PaymentMethod {
  id: string
  type: (typeof methodTypes)[number]
  bank: string
  beneficiary: string
  number: string
  instructions: string
}
export interface ConfiguredMethod extends PaymentMethod {
  active: boolean
}
export const methodLabels = {
  clabe: 'CLABE',
  card: 'Tarjeta',
  account: 'Cuenta',
}
const fields = {
  type: z.enum(methodTypes),
  bank: z.string().trim().min(1).max(100),
  beneficiary: z.string().trim().min(1).max(200),
  number: z.string().regex(/^\d{1,20}$/),
  instructions: z.string().trim().max(2000).optional().default(''),
}
function validNumber(value: { type: PaymentMethod['type']; number: string }) {
  return value.type === 'clabe'
    ? value.number.length === 18
    : value.type === 'card'
      ? value.number.length === 16
      : value.number.length >= 1 && value.number.length <= 20
}
export const methodInput = z
  .object(fields)
  .strict()
  .refine(validNumber, {
    message: 'Número inválido para el tipo de destino',
    path: ['number'],
  })
export const updateMethodInput = z
  .object({ ...fields, id: z.uuid() })
  .strict()
  .refine(validNumber, {
    message: 'Número inválido para el tipo de destino',
    path: ['number'],
  })
export const activationInput = z
  .object({ id: z.uuid(), active: z.boolean() })
  .strict()
// null permits legacy fallback; [] deliberately means no active destinations.
export function snapshotMethods(
  rows: ConfiguredMethod[],
): PaymentMethod[] | null {
  if (!rows.length) return null
  return rows
    .filter((row) => row.active)
    .map(({ id, type, bank, beneficiary, number, instructions }) => ({
      id,
      type,
      bank,
      beneficiary,
      number,
      instructions,
    }))
}
