import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Standard node-postgres adapter — connects to plain PostgreSQL over TCP (the
// Dokploy database, and any tunnel to it). SSL is driven by the connection
// string's sslmode, so an internal `?sslmode=disable` / no-sslmode URL connects
// without TLS while a managed host with `?sslmode=require` still negotiates it.
// (Replaces the Neon serverless adapter now that we're off Neon; the worker and
// orchestrator already talk to this same database over plain TCP via postgres.js.)
function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
