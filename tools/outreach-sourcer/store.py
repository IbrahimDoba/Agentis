"""Resumable crawl state.

A full run is 1,000+ domains at one request per second, so it is measured in
hours and will be interrupted. Every domain's outcome is recorded the moment it
is known, so a restart costs nothing already paid for.
"""
import json
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS domain (
  domain      TEXT PRIMARY KEY,
  status      TEXT NOT NULL,   -- pending | kept | rejected | error
  reason      TEXT,
  payload     TEXT,            -- JSON of the extracted prospect, when kept
  attempted_at TEXT
);
CREATE INDEX IF NOT EXISTS domain_status_idx ON domain(status);
"""


class Store:
    def __init__(self, path="state.sqlite"):
        self.conn = sqlite3.connect(path)
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def add_candidates(self, domains):
        """Queues domains not seen before. Returns how many were new."""
        cur = self.conn.executemany(
            "INSERT OR IGNORE INTO domain (domain, status) VALUES (?, 'pending')",
            [(d,) for d in domains],
        )
        self.conn.commit()
        return cur.rowcount

    def pending(self, limit):
        rows = self.conn.execute(
            "SELECT domain FROM domain WHERE status = 'pending' LIMIT ?", (limit,)
        ).fetchall()
        return [r[0] for r in rows]

    def record(self, domain, status, reason=None, payload=None):
        self.conn.execute(
            "UPDATE domain SET status = ?, reason = ?, payload = ?,"
            " attempted_at = datetime('now') WHERE domain = ?",
            (status, reason, json.dumps(payload) if payload else None, domain),
        )
        self.conn.commit()

    def kept(self):
        rows = self.conn.execute(
            "SELECT payload FROM domain WHERE status = 'kept' AND payload IS NOT NULL"
        ).fetchall()
        return [json.loads(r[0]) for r in rows]

    def counts(self):
        rows = self.conn.execute(
            "SELECT status, COUNT(*) FROM domain GROUP BY status"
        ).fetchall()
        return dict(rows)

    def close(self):
        self.conn.close()
