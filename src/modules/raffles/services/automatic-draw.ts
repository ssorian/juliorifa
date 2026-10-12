import '@tanstack/react-start/server-only'

/** Inert legacy export; historical source/audit records remain valid. */
export async function runAutomaticDraws(..._legacyArguments: unknown[]): Promise<never> {
  throw new Error('AUTOMATIC_DRAW_DISABLED')
}
