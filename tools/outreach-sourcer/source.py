#!/usr/bin/env python3
"""Source Nigerian businesses that run on WhatsApp into an import-ready CSV.

The qualifier is evidence, not vertical: a wa.me link or click-to-chat widget on
the site proves the business already sells or supports over WhatsApp, which is
precisely the problem Dailzero solves. Restaurants, salons, clinics, schools,
logistics, online stores all qualify equally if they show that signal.

Usage:
    python source.py add --seeds seeds.txt
    python source.py add --directory https://example.com/listing-page
    python source.py crawl --limit 200
    python source.py emit --out prospects.csv
    python source.py status

Output feeds /api/admin/outreach/import, which owns normalization, dedupe,
fit scoring and suppression. This tool deliberately does none of those.
"""
import argparse
import sys

import discover
import emit
from enrich import enrich, signal_count
from politeness import Fetcher
from store import Store


def cmd_add(args):
    store = Store(args.state)
    found = []
    if args.seeds:
        found += discover.from_seeds(args.seeds)
    if args.directory:
        found += discover.from_directory(Fetcher(), args.directory)

    if not found:
        print("No candidate domains found.")
        return 1

    added = store.add_candidates(sorted(set(found)))
    print("Found %d domains, %d new." % (len(set(found)), added))
    print("Queued total: %s" % store.counts().get("pending", 0))
    store.close()
    return 0


def cmd_crawl(args):
    store = Store(args.state)
    fetcher = Fetcher(delay=args.delay)
    domains = store.pending(args.limit)
    if not domains:
        print("Nothing pending. Add candidates first.")
        return 0

    print("Crawling %d domains at %.1fs/domain..." % (len(domains), args.delay))
    kept = 0
    for i, domain in enumerate(domains, 1):
        try:
            status, reason, prospect = enrich(fetcher, domain)
        except KeyboardInterrupt:
            # Progress so far is already committed, so stopping here is free.
            print("\nInterrupted. Re-run crawl to continue.")
            break
        except Exception as exc:
            status, reason, prospect = "error", str(exc)[:200], None

        store.record(domain, status, reason, prospect)
        if status == "kept":
            kept += 1
        marker = "+" if status == "kept" else "."
        print("%s [%3d/%d] %-40s %s" % (marker, i, len(domains), domain[:40], reason or "kept"))

    counts = store.counts()
    print("\nKept %d this run. Totals: %s" % (kept, counts))
    store.close()
    return 0


def cmd_emit(args):
    store = Store(args.state)
    prospects = sorted(store.kept(), key=signal_count, reverse=True)
    if not prospects:
        print("Nothing to emit yet.")
        return 1

    written = emit.write_csv(prospects, args.out)
    emit.write_research(prospects, args.research)
    print("Wrote %d rows to %s" % (written, args.out))
    print("Wrote research for %d businesses to %s/" % (len(prospects), args.research))
    if written < len(prospects):
        print("Skipped %d missing a required field." % (len(prospects) - written))
    store.close()
    return 0


def cmd_status(args):
    store = Store(args.state)
    counts = store.counts()
    total = sum(counts.values())
    print("Total domains: %d" % total)
    for status in ("pending", "kept", "rejected", "error"):
        print("  %-9s %d" % (status, counts.get(status, 0)))
    store.close()
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--state", default="state.sqlite")
    sub = parser.add_subparsers(dest="command")

    p_add = sub.add_parser("add", help="queue candidate domains")
    p_add.add_argument("--seeds", help="file with one domain or URL per line")
    p_add.add_argument("--directory", help="listing page to harvest outbound links from")
    p_add.set_defaults(func=cmd_add)

    p_crawl = sub.add_parser("crawl", help="visit queued domains and extract signals")
    p_crawl.add_argument("--limit", type=int, default=100)
    p_crawl.add_argument("--delay", type=float, default=1.0, help="seconds between requests to one host")
    p_crawl.set_defaults(func=cmd_crawl)

    p_emit = sub.add_parser("emit", help="write prospects.csv and research/")
    p_emit.add_argument("--out", default="prospects.csv")
    p_emit.add_argument("--research", default="research")
    p_emit.set_defaults(func=cmd_emit)

    p_status = sub.add_parser("status", help="show crawl progress")
    p_status.set_defaults(func=cmd_status)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
