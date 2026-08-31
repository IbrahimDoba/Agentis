"""Visit one business's site and decide whether it is a prospect.

Signals are aggregated ACROSS pages, not taken from whichever page happened to
have the email. A contact page often has the address but no WhatsApp widget,
while the homepage has the widget but no address — reading either alone
throws away half the evidence.
"""
import extract

# Ordered by how likely they are to carry a published address. Shopify's
# /pages/ prefix first because a large share of Nigerian online businesses run on it.
CONTACT_PATHS = [
    "/pages/contact",
    "/pages/contact-us",
    "/contact",
    "/contact-us",
    "/pages/about",
    "/about",
    "/about-us",
    "/policies/contact-information",
]

# Marketplaces, directories and platforms: real businesses, but not ours to sell
# to, and their contact addresses go to a corporate inbox.
EXCLUDED_DOMAINS = {
    "jumia.com.ng", "konga.com", "jiji.ng", "nairaland.com", "vconnect.com",
    "businesslist.com.ng", "finelib.com", "connectnigeria.com", "ngex.com",
    "shopify.com", "wordpress.com", "wixsite.com", "linktr.ee", "facebook.com",
    "instagram.com", "google.com", "myshopify.com",
}

MAX_PAGES = 4


def _sourcelabel(path):
    """Phrased to drop straight into the email's disclosure sentence."""
    if "contact" in path:
        return "your contact page"
    if "about" in path:
        return "your about page"
    if path in ("", "/"):
        return "your website footer"
    return "your website"


def enrich(fetcher, domain):
    """Returns (status, reason, prospect_dict_or_None)."""
    if domain in EXCLUDED_DOMAINS or any(domain.endswith("." + d) for d in EXCLUDED_DOMAINS):
        return "rejected", "marketplace or platform", None

    # Tries apex then www: a TLS failure on the apex is common and is not
    # evidence the business has no website.
    base = fetcher.resolve_base(domain)
    if not base:
        if not fetcher.allowed("https://" + domain):
            return "rejected", "robots.txt disallows crawling", None
        return "error", "homepage unreachable", None
    home = fetcher.get(base)
    if not home:
        return "error", "homepage unreachable", None

    if not extract.is_nigerian(home, domain):
        return "rejected", "no Nigerian signal", None

    pages = [("/", home)]
    email, email_path = None, None

    found = extract.emails(home, domain)
    if found:
        email, email_path = found[0], "/"

    for path in CONTACT_PATHS:
        if len(pages) >= MAX_PAGES:
            break
        html = fetcher.get(base + path)
        if not html:
            continue
        pages.append((path, html))
        if not email:
            found = extract.emails(html, domain)
            if found:
                email, email_path = found[0], path

    if not email:
        return "rejected", "no published email", None

    blob = "\n".join(html for _, html in pages)

    # The qualifying signal for the entire campaign: proof they already run on
    # WhatsApp. Checked across every page fetched, since the widget and the
    # address rarely live on the same one.
    if not extract.uses_whatsapp(blob):
        return "rejected", "no WhatsApp presence", None

    whatsapp = extract.whatsapp_numbers(blob)
    phones = extract.phones(blob)

    prospect = {
        "businessname": extract.business_name(home, domain),
        "email": email,
        "sourcelabel": _sourcelabel(email_path),
        "sourceurl": base + (email_path if email_path != "/" else ""),
        "contactname": "",
        "city": extract.city(blob) or "",
        "phone": phones[0] if phones else "",
        "whatsapp": whatsapp[0] if whatsapp else "",
        "website": base,
        "instagram": extract.instagram_handle(blob) or "",
        "vertical": extract.vertical(blob) or "",
        "reviewcount": "",
        "branchcount": "",
        "haspricelist": "yes" if extract.has_price_list(blob) else "",
        "sellsindms": "yes" if extract.sells_in_dms(blob) else "",
    }

    prospect["_research"] = {
        "domain": domain,
        "pages": [
            {"url": base + (p if p != "/" else ""), "text": extract.page_text(h)}
            for p, h in pages
        ],
    }
    return "kept", None, prospect


def signal_count(prospect):
    """Deliberately unweighted: this only sorts the CSV for human review.

    The authoritative score is fit.ts at import time. Weights here would be a
    second source of truth and would drift from it.
    """
    return sum(
        1
        for key in ("whatsapp", "instagram", "city", "phone", "haspricelist", "sellsindms")
        if prospect.get(key)
    )
