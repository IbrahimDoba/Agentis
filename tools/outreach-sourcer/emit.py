"""Write the import-ready CSV and the research payloads."""
import csv
import json
import os

# EXACTLY the columns src/app/api/admin/outreach/import/route.ts reads. Headers
# are matched case- and punctuation-insensitively there, but keeping them
# identical means a mismatch is visible by eye.
COLUMNS = [
    "businessname", "email", "sourcelabel", "sourceurl", "contactname", "city",
    "phone", "whatsapp", "website", "instagram", "vertical", "reviewcount",
    "branchcount", "haspricelist", "sellsindms",
]

# Rejected at import without these, because there is no "where I found you"
# sentence without a source, and therefore no NDPA position.
REQUIRED = ("businessname", "email", "sourcelabel", "sourceurl")


def write_csv(prospects, path):
    written = 0
    with open(path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for p in prospects:
            if any(not p.get(k) for k in REQUIRED):
                continue
            writer.writerow({k: p.get(k, "") for k in COLUMNS})
            written += 1
    return written


def write_research(prospects, directory):
    os.makedirs(directory, exist_ok=True)
    for p in prospects:
        research = p.get("_research")
        if not research:
            continue
        name = research["domain"].replace("/", "_") + ".json"
        with open(os.path.join(directory, name), "w") as fh:
            json.dump(research, fh, indent=2)
