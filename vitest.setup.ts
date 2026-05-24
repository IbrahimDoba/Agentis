import { config } from "dotenv"
import { resolve } from "node:path"

// Load the local dev DB connection BEFORE any module (e.g. src/lib/db.ts)
// reads process.env.DATABASE_URL at import time.
config({ path: resolve(process.cwd(), ".env.local") })

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL not set — vitest.setup.ts could not load .env.local. " +
      "DB-backed tests cannot run without the local dev database."
  )
}
