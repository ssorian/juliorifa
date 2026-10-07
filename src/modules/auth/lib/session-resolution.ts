export type CurrentUser = { id: string; name: string; role: string }

// Resolve authorization from the DB, not from cookie snapshots or caller input.
export async function resolveCurrentUser(
  readSession: () => Promise<{ user: { id: string } } | null>,
  readUser: (id: string) => Promise<CurrentUser | null>,
): Promise<CurrentUser | null> {
  const session = await readSession()
  return session ? readUser(session.user.id) : null
}
