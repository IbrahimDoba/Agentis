"""Signal extraction from a fetched page.

Pure functions over HTML text, so they can be tested against the two businesses
already verified by hand without touching the network.

Deliberately emits RAW values. Normalization (src/lib/outreach/normalize.ts) and
fit scoring (src/lib/outreach/fit.ts) live in the app and run at import; copying
those rules here would give them two homes and one would rot.
"""
import json
import re
from urllib.parse import urlparse, unquote

from bs4 import BeautifulSoup

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
NG_PHONE_RE = re.compile(r"(?:\+?234|0)\s*[789]\d{2}[\s.-]?\d{3}[\s.-]?\d{4}")
WA_LINK_RE = re.compile(r"(?:wa\.me|api\.whatsapp\.com/send)[/?][^\"'\s<>]*", re.I)
# Captures only the number itself. Matching the whole link and stripping
# non-digits swept up characters either side and produced 15-digit nonsense.
WA_NUMBER_RE = re.compile(
    r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=)(?:%2B|\+)?(\d{10,15})", re.I
)
PRICE_RE = re.compile(r"(?:₦|NGN\s*)\s?\d[\d,]{2,}")

FREE_MAIL = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
    "outlook.com", "live.com", "icloud.com", "aol.com", "protonmail.com",
    "proton.me", "yandex.com", "mail.com",
}

# Addresses that are never a person we should write to.
JUNK_LOCALPARTS = {
    "noreply", "no-reply", "donotreply", "postmaster", "abuse", "webmaster",
    "example", "email", "your", "name", "user", "test",
}

JUNK_DOMAINS = {
    "sentry.io", "wixpress.com", "example.com", "domain.com", "shopify.com",
    "cloudflare.com", "godaddy.com", "squarespace.com", "sentry-cdn.com",
    "w3.org", "schema.org", "googleapis.com", "gstatic.com",
}

DM_PHRASES = [
    "dm to order", "dm us", "whatsapp us", "chat to order", "order on whatsapp",
    "message us on whatsapp", "chat with us on whatsapp", "send us a dm",
    "click to chat", "chat us on whatsapp",
]

NG_CITIES = [
    "lagos", "abuja", "port harcourt", "ibadan", "kano", "benin city", "enugu",
    "kaduna", "jos", "warri", "abeokuta", "ilorin", "owerri", "uyo", "calabar",
    "onitsha", "aba", "asaba", "akure", "lekki", "ikeja", "ikoyi", "victoria island",
    "surulere", "yaba", "ajah", "maitama", "wuse", "garki", "gbagada",
]

# Maps to the solutions/* slugs the app already has pages for.
VERTICAL_KEYWORDS = [
    ("restaurants", ["restaurant", "kitchen", "eatery", "cuisine", "menu", "food delivery", "catering"]),
    ("healthcare", ["clinic", "hospital", "pharmacy", "dental", "diagnostic", "medical", "wellness centre"]),
    ("real-estate", ["real estate", "property", "realtor", "apartment", "shortlet", "lettings"]),
    ("logistics", ["logistics", "courier", "haulage", "freight", "delivery service", "shipping"]),
    ("finance", ["insurance", "loan", "microfinance", "investment", "fintech", "bureau de change"]),
    ("appointment-booking", ["salon", "spa", "barber", "makeup artist", "nails", "gym", "fitness", "photography", "book an appointment"]),
    ("ecommerce", ["shop", "store", "boutique", "collection", "add to cart", "clothing", "fashion", "thrift", "skincare", "cosmetics", "beauty"]),
]


def _soup(html):
    return BeautifulSoup(html, "html.parser")


# Segments that are page labels, never a brand.
GENERIC_TITLE_PARTS = {
    "home", "contact", "contact us", "about", "about us", "shop", "store",
    "welcome", "official website", "online store", "index",
}


def _brand_from(text):
    """Pick the brand out of a title or site name.

    Sites put the brand on either side of the separator ("bCODE - Your Online
    Fashion Retail Store" but also "Online Food Market for Nigerians | The
    Market Food Shop"), so position is unreliable. The brand is reliably the
    shortest non-generic segment, since the other side is a tagline.
    """
    # A hyphen only separates when it is spaced. An unspaced one is part of the
    # name itself, and splitting there turned "i-Fitness" into "i".
    parts = [p.strip() for p in re.split(r"\s+[-–—]\s+|\s*[|:]\s*", text) if p.strip()]
    parts = [p for p in parts if p.lower() not in GENERIC_TITLE_PARTS and len(p) >= 2]
    if not parts:
        return None
    return min(parts, key=len)[:120]


def business_name(html, domain):
    soup = _soup(html)
    tag = soup.find("meta", property="og:site_name")
    if tag and tag.get("content", "").strip():
        return _brand_from(tag["content"].strip()) or tag["content"].strip()[:120]
    if soup.title and soup.title.string:
        return _brand_from(soup.title.string.strip()) or domain
    return domain


def jsonld_emails(html):
    """Addresses declared in schema.org JSON-LD.

    The strongest signal available: a business that puts an email in its
    Organization markup has published it deliberately, for machines. It is also
    invisible to get_text(), which is how these were being missed entirely.
    """
    out = []

    def walk(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key.lower() == "email" and isinstance(value, str):
                    addr = value.replace("mailto:", "").strip().lower()
                    if EMAIL_RE.fullmatch(addr):
                        out.append(addr)
                else:
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    for block in _soup(html).find_all("script", type="application/ld+json"):
        raw = block.string or block.get_text() or ""
        try:
            walk(json.loads(raw))
        except (ValueError, TypeError):
            continue
    return out


def emails(html, site_domain):
    """Published addresses, best first.

    Order matters: JSON-LD, then mailto links, then visible text, then a raw
    scan of the markup. The raw pass is last because it also sees analytics
    config and template scaffolding, which the junk filters below exist to drop.

    An address on the business's own domain outranks a gmail one, because a
    business writing from its own domain published it deliberately.
    """
    soup = _soup(html)
    found = list(jsonld_emails(html))

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.lower().startswith("mailto:"):
            addr = unquote(href[7:].split("?")[0]).strip()
            if EMAIL_RE.fullmatch(addr):
                found.append(addr.lower())

    for match in EMAIL_RE.findall(soup.get_text(" ", strip=True)):
        found.append(match.lower())

    # Raw markup last, and own-domain only. It is the pass that recovers an
    # address hidden in an attribute, but it also sees embedded app and widget
    # config — which is how a Shopify app vendor's support desk ended up being
    # pitched as a prospect. A foreign domain found ONLY here is not the business.
    for match in EMAIL_RE.findall(html):
        addr = match.lower()
        if addr.partition("@")[2] == site_domain:
            found.append(addr)

    clean, seen = [], set()
    for addr in found:
        if addr in seen:
            continue
        seen.add(addr)
        local, _, host = addr.partition("@")
        if host in JUNK_DOMAINS or local in JUNK_LOCALPARTS:
            continue
        # A host beginning www. is a typo on the site, not a deliverable
        # mailbox. Silently "fixing" it would guess at their intent and the
        # guess bounces, which now halts the whole campaign.
        if host.startswith("www."):
            continue
        # Asset filenames regularly match the email pattern (logo@2x.png).
        if re.search(r"\.(png|jpe?g|gif|svg|webp|css|js)$", host):
            continue
        clean.append(addr)

    own = [a for a in clean if a.partition("@")[2] == site_domain]
    other = [a for a in clean if a.partition("@")[2] != site_domain and a.partition("@")[2] not in FREE_MAIL]
    free = [a for a in clean if a.partition("@")[2] in FREE_MAIL]
    return own + other + free


def whatsapp_numbers(html):
    """Numbers from wa.me / click-to-chat links only.

    This is the qualifying signal for the whole campaign, so it is taken from
    an explicit chat link rather than inferred from any phone number on the page.
    """
    seen, uniq = set(), []
    for digits in WA_NUMBER_RE.findall(html):
        # Nigerian MSISDNs are 234 + 10 digits. Anything else is a foreign number
        # or a mis-parse, and both are worse than no number at all.
        if digits.startswith("234") and len(digits) == 13:
            number = "+" + digits
        elif digits.startswith("0") and len(digits) == 11:
            number = "+234" + digits[1:]
        else:
            continue
        if number not in seen:
            seen.add(number)
            uniq.append(number)
    return uniq


# WhatsApp chat-widget apps, which are how most Nigerian Shopify and WooCommerce
# stores route visitors to WhatsApp. The widget mounts in JavaScript, so there is
# no wa.me link in the served HTML and a link-only check misses the site
# entirely. The script asset that loads it is still there, and naming it is
# evidence the business chose to put WhatsApp on their storefront.
WIDGET_MARKERS = (
    "whatsapp-chat",
    "whatsapp_chat",
    "whatsapp-widget",
    "whatsapp-button",
    "whatsappwidget",
    "wa-widget",
    "dondy",
    "getbutton.io",
    "chatwith.io",
    "elfsight-app-whatsapp",
)

# Two false-positive sources seen in the wild: Wix ships a config key called
# specs.restaurants.whatsappnotification on sites with no WhatsApp at all, and
# bot blocklists list "whatsapp" among crawler user agents. Both contain the
# bare word and neither means the business uses it.
WHATSAPP_NOISE = (
    "whatsappnotification",
    "^whatsapp",
)


def uses_whatsapp(html):
    lowered = html.lower()
    if WA_LINK_RE.search(html):
        return True
    if any(p in lowered for p in DM_PHRASES):
        return True
    return any(m in lowered for m in WIDGET_MARKERS)


def phones(html):
    text = _soup(html).get_text(" ", strip=True)
    seen, out = set(), []
    for m in NG_PHONE_RE.findall(text):
        digits = re.sub(r"\D", "", m)
        if digits not in seen:
            seen.add(digits)
            out.append(m.strip())
    return out


def instagram_handle(html):
    for m in re.finditer(r"instagram\.com/([A-Za-z0-9._]{1,30})", html, re.I):
        handle = m.group(1).lower()
        if handle not in {"p", "reel", "explore", "accounts", "stories"}:
            return handle
    return None


def city(html):
    text = _soup(html).get_text(" ", strip=True).lower()
    # Longest first so "victoria island" wins over a bare "lagos" nearby.
    for name in sorted(NG_CITIES, key=len, reverse=True):
        if re.search(r"\b%s\b" % re.escape(name), text):
            return name.title()
    return None


def is_nigerian(html, domain):
    if domain.endswith(".ng"):
        return True
    if PRICE_RE.search(html) or "+234" in html:
        return True
    return city(html) is not None


def has_price_list(html):
    return len(PRICE_RE.findall(html)) >= 3


def sells_in_dms(html):
    lowered = html.lower()
    return any(p in lowered for p in DM_PHRASES)


def vertical(html):
    text = _soup(html).get_text(" ", strip=True).lower()
    best, best_hits = None, 0
    for slug, words in VERTICAL_KEYWORDS:
        hits = sum(1 for w in words if w in text)
        if hits > best_hits:
            best, best_hits = slug, hits
    return best if best_hits >= 2 else None


def page_text(html, limit=6000):
    soup = _soup(html)
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True))[:limit]


def registrable_domain(url):
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host
