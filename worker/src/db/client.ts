import postgres from "postgres"
import { config } from "../config.js"

export const sql = postgres(config.DATABASE_URL, {
  // "prefer" still negotiates TLS whenever the server offers it, but does not
  // refuse a server that has none — a self-hosted Postgres on the same private
  // network typically does not terminate TLS. "require" fails outright there.
  ssl: "prefer",
  max: 5,
  idle_timeout: 30,
})
