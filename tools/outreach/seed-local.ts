// Emits SQL to seed the local database with the sourced prospects and the
// reviewed first batch, so the queue can be looked at in the real UI.
//
//   node --experimental-strip-types tools/outreach/seed-local.ts > /tmp/seed.sql
//   npx prisma db execute --file /tmp/seed.sql
//
// Emits SQL rather than talking to the database directly because the generated
// Prisma client uses extensionless imports Node's ESM resolver cannot follow,
// and pg is not hoisted under pnpm. Normalization and fit-scoring still come
// from the real modules, so rows match what the import route would produce.
import { randomBytes } from "node:crypto"
import fs from "node:fs"

const norm = await import("../../src/lib/outreach/normalize.ts")
const fit = await import("../../src/lib/outreach/fit.ts")
const csvmod = await import("../../src/lib/outreach/csv.ts")
const { drafts, LINK } = await import("./batch1.mjs")

const id = () => "c" + randomBytes(12).toString("hex")
const q = (v: string | number | null) =>
  v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`

const rows = csvmod.parseCsvRows(fs.readFileSync("tools/outreach-sourcer/prospects.csv", "utf8"))
const byEmail = new Map<string, { id: string; sourceUrl: string }>()
const out: string[] = []

for (const row of rows) {
  const email = norm.normalizeEmail(row.email ?? "")
  if (!email || !row.businessname || !row.sourcelabel || !row.sourceurl) continue
  if (byEmail.has(email)) continue

  const whatsappNumber = norm.normalizeNgPhone(row.whatsapp ?? row.phone ?? "")
  const website = norm.normalizeWebsite(row.website ?? "")
  const instagram = norm.normalizeInstagram(row.instagram ?? "")
  const scored = fit.scoreFit({
    vertical: row.vertical || null, city: row.city || null, whatsappNumber, website, instagram,
    reviewCount: null,
    research: { hasPriceList: row.haspricelist === "yes", sellsInDms: row.sellsindms === "yes", branchCount: null },
  })
  if (scored.disqualified) continue

  const pid = id()
  byEmail.set(email, { id: pid, sourceUrl: row.sourceurl })
  out.push(
    `INSERT INTO "OutreachProspect" ("id","businessName","email","emailDomain","emailHash",` +
    `"contactName","vertical","city","phone","whatsappNumber","website","instagram",` +
    `"sourceLabel","sourceUrl","fitScore","research","status","createdAt","updatedAt") VALUES (` +
    [q(pid), q(row.businessname), q(email), q(norm.emailDomain(email)), q(norm.hashEmail(email)),
     q(row.contactname ? norm.titleCase(row.contactname) : null), q(row.vertical || null),
     q(row.city ? norm.titleCase(row.city) : null), q(norm.normalizeNgPhone(row.phone ?? "")),
     q(whatsappNumber), q(website), q(instagram), q(row.sourcelabel), q(row.sourceurl),
     q(scored.score), q(JSON.stringify({ reasons: scored.reasons }))].join(",") +
    `,'new',NOW(),NOW()) ON CONFLICT (email) DO NOTHING;`
  )
}

for (const d of drafts) {
  const p = byEmail.get(d.to)
  if (!p) { console.error(`  no prospect for ${d.to}`); continue }
  const token = randomBytes(18).toString("base64url")
  const body = `${d.body}\n\n${LINK.replace("TOKEN", token)}\n\nFound your address on ${d.label}.`
  out.push(
    `INSERT INTO "OutreachMessage" ("id","prospectId","step","toEmail","subject","bodyText",` +
    `"aiReason","aiSignals","aiModel","status","token","createdAt") VALUES (` +
    [q(id()), q(p.id), 1, q(d.to), q(d.subject), q(body),
     q("Opens on a fact verified from the business's own site."),
     q(JSON.stringify([{ claim: "verified from site", sourceUrl: p.sourceUrl }])),
     q("claude-code"), q("pending"), q(token)].join(",") +
    `,NOW()) ON CONFLICT ("prospectId","step") DO NOTHING;`
  )
}

console.error(`${byEmail.size} prospects, ${drafts.length} drafts`)
console.log(out.join("\n"))
