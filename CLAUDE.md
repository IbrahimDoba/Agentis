# Agentis / Dailzero

WhatsApp AI agents for Nigerian businesses. Three deployed pieces, one Postgres.

## Layout

| Package | Path | Role |
|---|---|---|
| `d-zero-ai` | `src/` | Next.js 16 app: dashboard, admin, 174 API routes. Owns Prisma. |
| `dailzero-wa-worker` | `worker/` | Baileys WhatsApp sockets, send queues, anti-ban pacing. |
| `dailzero-orchestrator` | `orchestrator/` | LLM turn pipeline, tools, RAG. |

**The packages cannot import each other.** No `workspace:*` deps, `rootDir: "src"`
in both subpackages, NodeNext vs bundler resolution, and a zod major split (v4 in
the app, v3 in the subpackages). They talk over HTTP and the shared database.
Only the app has Prisma; worker and orchestrator use raw `postgres` SQL, which is
why DB enums are retyped by hand in each.

## House style

Two skills carry the conventions; read them before non-trivial work:

- `.claude/skills/agentis-conventions/SKILL.md` — naming, multi-tenancy
  (`resellerId` on everything, `"platform"` is a real row), money as whole Naira
  `Int`, guarded DB writes over read-modify-write, server-component → plain DTO.
- `.claude/skills/agentis-error-handling/SKILL.md` — route shape
  (auth → validate → work → catch), bracketed log tags, `recordEvent` for
  anything that needs to be diagnosable from the admin panel.

Semicolon-less, 2-space (49 files drifted to 4-space; there is no Prettier config
— do not mass-reformat). Comments explain *why*, not *what*.

## Commands

```bash
pnpm dev                                   # app
pnpm typecheck                             # app  (tsc --noEmit)
pnpm lint                                  # ~159 known errors, mostly no-explicit-any
pnpm test                                  # app — needs a real dev DB, no DB mocking
pnpm --filter dailzero-wa-worker   typecheck test
pnpm --filter dailzero-orchestrator typecheck test
```

CI (`.github/workflows/ci.yml`) gates typecheck + worker/orchestrator tests. Lint
is reported but non-blocking until the backlog is burned down. The app's suite is
not in CI yet — it needs a provisioned database.

## Landmines

Things that look like cleanup and are not:

- **`config.ts` calls `process.exit(1)` at module scope** in worker and
  orchestrator. Importing almost anything needs a full valid env — that is why
  most worker modules have no tests. Adding a `config` import to a config-free
  module silently makes it untestable.
- **BullMQ `Queue` *and* `Worker` are built at module scope**; importing a queue
  module starts consuming jobs. `worker/src/queue/outbound-queue.ts` also runs a
  side-effecting IIFE on import.
- **`orchestrator/src/config.ts` coerces a dead Railway URL to
  `api.dailzero.com`.** The platform re-injects the decommissioned URL on every
  redeploy. Deleting that line takes the send path down.
- **`worker/src/index.ts` boot order is incident-critical** — inode reclaim must
  run before any session connects.
- **`worker/src/anti-ban/pacing.ts`**: `markSentByUs(msgId)` must stay exactly
  where it is relative to the post-send `sleep()`. Moving it caused duplicate
  message rows and false auto-flips to human mode. Zero test coverage.
- **`session-manager.ts` holds every live socket in a module-level Map**, so only
  one worker instance may run the session subsystem.
