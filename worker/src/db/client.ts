import postgres from "postgres"
import { config } from "../config.js"

export const sql = postgres(config.DATABASE_URL, {
  ssl: "require",
  max: 5,
  idle_timeout: 30,
})
