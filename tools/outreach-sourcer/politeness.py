"""Rate limiting, robots.txt and a truthful User-Agent.

Every outbound request in this tool goes through Fetcher. That is deliberate:
the whole campaign's defensibility rests on only collecting what businesses
publish for enquiries, so there is exactly one place where that promise is
kept or broken.
"""
import os
import time
import threading
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests

CONTACT_URL = os.environ.get(
    "OUTREACH_CRAWLER_CONTACT", "https://www.dailzero.com/outreach-privacy"
)

# Says who we are and how to make us stop. A crawler that hides its identity is
# one you cannot ask to go away.
USER_AGENT = "DailzeroOutreachBot/1.0 (+%s)" % CONTACT_URL

PER_DOMAIN_DELAY = 1.0
TIMEOUT = 15
MAX_BYTES = 2_000_000

# Some directories ask for Crawl-delay: 40. Honouring that is correct, but at 40s
# a host with a few hundred pages takes days and stalls everything queued behind
# it. So we honour it up to this ceiling and skip the host beyond it, rather than
# quietly ignoring what it asked for.
MAX_HONOURED_DELAY = 10.0


class Fetcher:
    def __init__(self, delay=PER_DOMAIN_DELAY):
        self.delay = delay
        self._last_hit = {}
        self._robots = {}
        self._delays = {}
        self._lock = threading.Lock()
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}
        )

    def _wait_turn(self, host):
        """Serialise per host, so concurrency across domains never becomes
        concurrency against one server. Uses the host's own Crawl-delay when it
        asks for a longer one than ours."""
        delay = max(self.delay, self._delays.get(host, 0.0))
        with self._lock:
            last = self._last_hit.get(host, 0.0)
            gap = time.time() - last
            if gap < delay:
                time.sleep(delay - gap)
            self._last_hit[host] = time.time()

    def crawl_delay_for(self, url):
        """The host's requested Crawl-delay in seconds, or 0.0 if it asks none."""
        self.allowed(url)
        return self._delays.get(urlparse(url).netloc, 0.0)

    def too_slow_to_crawl(self, url):
        """True when a host asks for longer than we are willing to spend. The
        honest response is to respect it and skip, not to ignore it."""
        return self.crawl_delay_for(url) > MAX_HONOURED_DELAY

    def _load_robots(self, scheme, host):
        """Fetch robots.txt with OUR identity, not urllib's.

        RobotFileParser.read() fetches using urllib's default Python-urllib UA.
        Cloudflare and friends 403 that, and a 403 on robots.txt means
        "disallow everything" under the standard — so an entirely permissive
        site reads as fully closed. That silently discarded about a third of
        otherwise valid prospects before it was caught.
        """
        parser = RobotFileParser()
        url = "%s://%s/robots.txt" % (scheme, host)
        try:
            self._wait_turn(host)
            resp = self.session.get(url, timeout=TIMEOUT, allow_redirects=True)
        except requests.RequestException:
            # Unknown, not forbidden. The rate limit still applies.
            parser.allow_all = True
            return parser

        if resp.status_code in (401, 403):
            # An explicit refusal to show the rules is a refusal.
            parser.disallow_all = True
        elif 400 <= resp.status_code < 500:
            # No robots.txt at all means no restrictions.
            parser.allow_all = True
        elif resp.status_code == 200 and "html" not in resp.headers.get("content-type", "").lower():
            parser.parse(resp.text.splitlines())
        else:
            # 5xx, or an HTML error page served as robots.txt. Neither is a rule.
            parser.allow_all = True
        return parser

    def allowed(self, url):
        parts = urlparse(url)
        host = parts.netloc
        if host not in self._robots:
            self._robots[host] = self._load_robots(parts.scheme or "https", host)
            try:
                requested = self._robots[host].crawl_delay(USER_AGENT)
            except Exception:
                requested = None
            self._delays[host] = float(requested) if requested else 0.0
        try:
            return self._robots[host].can_fetch(USER_AGENT, url)
        except Exception:
            return True

    def resolve_base(self, domain):
        """The base URL that actually serves this site, or None.

        Apex records regularly fail TLS while the www host is fine, so a bare
        apex failure is not evidence the business has no website.
        """
        for candidate in ("https://" + domain, "https://www." + domain):
            if self.get(candidate) is not None:
                return candidate
        return None

    def get(self, url):
        """Returns response text, or None if disallowed, non-HTML or failed."""
        if not self.allowed(url):
            return None

        host = urlparse(url).netloc
        self._wait_turn(host)
        try:
            resp = self.session.get(url, timeout=TIMEOUT, allow_redirects=True, stream=True)
        except requests.RequestException:
            return None

        try:
            if resp.status_code != 200:
                return None
            ctype = resp.headers.get("content-type", "")
            if "html" not in ctype.lower():
                return None
            # Cap the read rather than trusting content-length; a few Nigerian
            # hosts serve very large uncompressed pages.
            body = resp.raw.read(MAX_BYTES, decode_content=True)
        except Exception:
            return None
        finally:
            resp.close()

        encoding = resp.encoding or "utf-8"
        try:
            return body.decode(encoding, errors="replace")
        except (LookupError, AttributeError):
            return body.decode("utf-8", errors="replace")
