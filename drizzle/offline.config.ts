import { defineConfig } from 'drizzle-kit'
// Never load credentials for generation. Applying migrations is a separate authorization.
export default defineConfig({schema:'./src/db/schema.ts',out:'./drizzle',dialect:'postgresql'})
