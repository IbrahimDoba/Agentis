# Outreach sourcer

Finds Nigerian businesses that run on WhatsApp and writes an import-ready CSV.

**The qualifier is evidence, not vertical.** A `wa.me` link or click-to-chat
widget on a business's own site proves it already sells or supports over
WhatsApp, which is exactly the problem Dailzero solves. Restaurants, salons,
clinics, schools, logistics and online stores all qualify equally on that signal.

## Setup

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python -m unittest test_extract   # 33 tests, no network
```

## Use

```bash
./.venv/bin/python source.py add --seeds seeds.txt
./.venv/bin/python source.py add --directory https://example.com/some-listing
./.venv/bin/python source.py crawl --limit 200
./.venv/bin/python source.py emit --out prospects.csv
./.venv/bin/python source.py status
```

Then review `prospects.csv` by hand and upload it at `/admin/outreach`.

## What it does not do

No fit scoring, no normalization, no dedupe, no suppression. All four live in
the app ([fit.ts](../../src/lib/outreach/fit.ts),
[normalize.ts](../../src/lib/outreach/normalize.ts),
[suppression.ts](../../src/lib/outreach/suppression.ts)) and run at import.
Reimplementing any of them here would create a second source of truth that
silently drifts from the first.

The CSV contract is pinned by
[csvContract.test.ts](../../src/lib/outreach/csvContract.test.ts) on the app
side, so a column rename on either side fails a test rather than importing
blank fields.

## Politeness

Every request goes through `Fetcher`, which honors `robots.txt`, waits 1s
between hits on the same host, and sends an identifying User-Agent with a
contact URL.

Two things worth knowing, both learned the hard way:

- `RobotFileParser.read()` fetches robots.txt with urllib's own UA, which
  Cloudflare 403s — and a 403 means "disallow everything". That silently
  discarded about a third of valid prospects. Robots is now fetched with the
  same session and identity as the crawl.
- Apex records often fail TLS where `www` works, so `resolve_base()` tries both
  before concluding a business has no website.

No Instagram scraping (their terms forbid automated collection) and no Google
Maps scraping (Maps ToS §3.2.3(a)). Only pages a business publishes for
enquiries, and the exact page each email came from is recorded as `sourceurl`.

## Measured yield

From the first 32 candidate domains: **7 kept, 21 rejected, 4 unreachable — 22%**.
Rejections are mostly "no published email" (many Nigerian sites use a contact
form) and "no WhatsApp presence". So **500 prospects needs roughly 2,300
candidates**, and discovery, not extraction, is the bottleneck.
