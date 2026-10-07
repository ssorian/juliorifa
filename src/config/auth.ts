import '@tanstack/react-start/server-only'
import { config } from 'dotenv'

// Vite does not automatically populate process.env with unprefixed .env.local
// values. Load server configuration only; existing deployment variables win.
config({ path: ['.env.local', '.env'], quiet: true })

export const authConfig = {
  databaseURL: process.env.DATABASE_URL,
  baseURL: process.env.BETTER_AUTH_URL || process.env.SERVER_URL,
  secret: process.env.BETTER_AUTH_SECRET,
}
