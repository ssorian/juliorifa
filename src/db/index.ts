import '@tanstack/react-start/server-only'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema.ts'
import { authConfig } from '../config/auth'

export const db = drizzle(authConfig.databaseURL!, { schema })
