"""Turn seeds into candidate domains.

Two inputs, because no single free source is sufficient:

  --seeds FILE      one domain or URL per line, however you gathered them
  --directory URL   a listing page; outbound links to business sites are kept

Directory pages are the bulk source. They publish business names, phones and
website links freely, which is exactly the part that is hard to assemble by
hand — the emails still have to come from each business's own site.
"""
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

import extract
from enrich import EXCLUDED_DOMAINS

# Not businesses: social, analytics, CDNs, and the directories themselves.
SKIP_HOSTS = set(EXCLUDED_DOMAINS) | {
    "twitter.com", "x.com", "youtube.com", "linkedin.com", "tiktok.com",
    "pinterest.com", "wa.me", "api.whatsapp.com", "t.me", "maps.google.com",
    "goo.gl", "bit.ly", "gravatar.com", "cloudflare.com", "gstatic.com",
    "googletagmanager.com", "doubleclick.net", "w3.org", "schema.org",
}

SKIP_SUFFIXES = (".gov.ng", ".edu.ng", ".wikipedia.org")


def _acceptable(host):
    if not host or "." not in host:
        return False
    if host in SKIP_HOSTS or any(host.endswith("." + s) for s in SKIP_HOSTS):
        return False
    if host.endswith(SKIP_SUFFIXES):
        return False
    # Bare IPs and localhost are never a business site.
    return not re.match(r"^\d+\.\d+\.\d+\.\d+$", host)


def from_seeds(path):
    out = []
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if not line.startswith("http"):
                line = "https://" + line
            host = extract.registrable_domain(line)
            if _acceptable(host):
                out.append(host)
    return sorted(set(out))


def from_directory(fetcher, url):
    """Outbound links from a listing page, minus the directory's own pages."""
    html = fetcher.get(url)
    if not html:
        return []

    self_host = extract.registrable_domain(url)
    soup = BeautifulSoup(html, "html.parser")
    out = set()
    for a in soup.find_all("a", href=True):
        href = urljoin(url, a["href"].strip())
        if not href.startswith("http"):
            continue
        host = urlparse(href).netloc.lower()
        host = host[4:] if host.startswith("www.") else host
        if host and host != self_host and _acceptable(host):
            out.add(host)
    return sorted(out)
