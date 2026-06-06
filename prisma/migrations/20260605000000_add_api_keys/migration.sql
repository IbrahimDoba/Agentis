-- External Developer API keys (see model ApiKey).
-- The raw key is never stored — only its bcrypt hash. "prefix" is the public,
-- indexed lookup id; verify narrows by prefix then bcrypt-compares the hash.
-- "scopes" gate capability: 'chat' (run agents) and/or 'manage' (configure).
-- "dailySpendingCapCredits" is an optional rolling-24h per-key spend rail.
CREATE TABLE "ApiKey" (
  "id"                      TEXT PRIMARY KEY,
  "userId"                  TEXT NOT NULL,
  "name"                    TEXT NOT NULL,
  "prefix"                  TEXT NOT NULL,
  "hashedKey"               TEXT NOT NULL,
  "scopes"                  TEXT[] NOT NULL DEFAULT '{}',
  "dailySpendingCapCredits" INTEGER,
  "dailySpentCredits"       INTEGER NOT NULL DEFAULT 0,
  "spendingResetAt"         TIMESTAMP(3),
  "status"                  TEXT NOT NULL DEFAULT 'active',
  "lastUsedAt"              TIMESTAMP(3),
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "revokedAt"               TIMESTAMP(3),
  CONSTRAINT "ApiKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");
CREATE INDEX "ApiKey_userId_status_idx" ON "ApiKey"("userId", "status");
