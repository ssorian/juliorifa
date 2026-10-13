export function isolatedConnection(value: string, name: string) {
  schemaIdentifier(name)
  const target = new URL(value)
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname || target.hostname.includes('%') || !target.pathname.slice(1)) throw new Error('TARGET')
  for (const key of target.searchParams.keys()) {
    if (!['sslmode', 'channel_binding', 'connect_timeout', 'application_name', 'options'].includes(key)) throw new Error('TARGET_OPTIONS')
  }
  const options = `-c search_path=${name},pg_catalog -c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000`
  target.searchParams.set('options', options)
  return { url: target.href, options }
}

export function schemaIdentifier(name: string) {
  if (!/^juliorifa_verify_[a-f0-9]{32}$/.test(name)) throw new Error('SCHEMA')
  return `"${name}"`
}

// Intentionally limited to the reviewed migration vocabulary, not a generic SQL sandbox.
export function isolatedMigration(source: string, name: string) {
  const identifier = schemaIdentifier(name)
  const statements = source.replaceAll('--> statement-breakpoint', '').replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)
  for (const statement of statements) {
    if (!/^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE) "[a-z_]+"\s/.test(statement) || /\b(public|drizzle)\s*\./i.test(statement.replaceAll('"public".', '')) || /\b(SET|COPY|GRANT|REVOKE|FUNCTION|PROCEDURE|TRIGGER|SCHEMA)\b/i.test(statement)) throw new Error('MIGRATION_SURFACE')
    const table = statement.match(/^(?:CREATE|ALTER) TABLE "([a-z_]+)"/)?.[1]
    for (const match of statement.matchAll(/"([^"]+)"\s*\./g)) if (match[1] !== 'public' && match[1] !== table) throw new Error('MIGRATION_SURFACE')
  }
  return statements.map(s => s.replaceAll('"public".', `${identifier}.`)).join(';')
}
