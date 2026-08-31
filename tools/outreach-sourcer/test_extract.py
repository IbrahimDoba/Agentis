"""Unit tests for the extractors.

Synthetic HTML rather than saved pages: real Shopify pages are ~1MB of theme
JavaScript, and a test that depends on a live site fails for reasons that have
nothing to do with this code.

Run:  ./.venv/bin/python -m unittest test_extract -v
"""
import unittest

import extract


class TestEmails(unittest.TestCase):
    def test_prefers_mailto_and_own_domain(self):
        html = """
        <a href="mailto:hello@gmail.com">personal</a>
        <a href="mailto:customercare@shop.ng">business</a>
        """
        # The business's own domain outranks a free-mail address, because that is
        # the one the business published deliberately.
        self.assertEqual(extract.emails(html, "shop.ng")[0], "customercare@shop.ng")

    def test_finds_address_in_body_text(self):
        html = "<p>Reach us at orders@shop.ng any time.</p>"
        self.assertIn("orders@shop.ng", extract.emails(html, "shop.ng"))

    def test_url_encoded_mailto(self):
        html = '<a href="mailto:sales%40shop.ng?subject=Hi">mail</a>'
        self.assertIn("sales@shop.ng", extract.emails(html, "shop.ng"))

    def test_drops_noise(self):
        html = """
        <a href="mailto:noreply@shop.ng">x</a>
        <img src="logo@2x.png">
        <p>abuse@shop.ng postmaster@shop.ng err@sentry.io</p>
        """
        self.assertEqual(extract.emails(html, "shop.ng"), [])

    def test_deduplicates_case_insensitively(self):
        html = '<a href="mailto:Hi@Shop.NG">a</a><p>hi@shop.ng</p>'
        self.assertEqual(extract.emails(html, "shop.ng"), ["hi@shop.ng"])


    def test_jsonld_organization_email(self):
        # Invisible to get_text(), which is exactly how these were being missed.
        html = """<script type="application/ld+json">
        {"@type":"Organization","url":"https://shop.ng","email":"beauty@shop.ng"}
        </script>"""
        self.assertEqual(extract.emails(html, "shop.ng"), ["beauty@shop.ng"])

    def test_jsonld_nested_and_mailto_prefixed(self):
        html = """<script type="application/ld+json">
        {"@graph":[{"@type":"LocalBusiness","contactPoint":{"email":"mailto:hi@shop.ng"}}]}
        </script>"""
        self.assertEqual(extract.emails(html, "shop.ng"), ["hi@shop.ng"])

    def test_malformed_jsonld_is_ignored_not_fatal(self):
        html = '<script type="application/ld+json">{ this is not json </script><p>a@shop.ng</p>'
        self.assertEqual(extract.emails(html, "shop.ng"), ["a@shop.ng"])

    def test_rejects_www_prefixed_host_as_a_typo(self):
        # Guessing that customerhelp@www.shop.ng means @shop.ng would bounce,
        # and a bounce now halts the campaign.
        html = '<p>customerhelp@www.shop.ng</p>'
        self.assertEqual(extract.emails(html, "shop.ng"), [])

    def test_finds_address_only_present_in_an_attribute(self):
        html = '<div data-contact="orders@shop.ng">Contact</div>'
        self.assertIn("orders@shop.ng", extract.emails(html, "shop.ng"))


class TestWhatsApp(unittest.TestCase):
    def test_wa_me_link(self):
        html = '<a href="https://wa.me/2349026051281">Chat</a>'
        self.assertEqual(extract.whatsapp_numbers(html), ["+2349026051281"])

    def test_click_to_chat_with_phone_param(self):
        html = '<a href="https://api.whatsapp.com/send?phone=2348031234567&text=Hi">Chat</a>'
        self.assertEqual(extract.whatsapp_numbers(html), ["+2348031234567"])

    def test_url_encoded_plus_in_phone_param(self):
        # Shopify's WhatsApp widget writes phone=%2B234..., which a naive
        # \\+? pattern silently misses while uses_whatsapp still reports True.
        html = '<a href="https://api.whatsapp.com/send?phone=%2B2349026051281&text=Hello">Chat</a>'
        self.assertEqual(extract.whatsapp_numbers(html), ["+2349026051281"])

    def test_local_format_is_normalised(self):
        html = '<a href="https://wa.me/08031234567">Chat</a>'
        self.assertEqual(extract.whatsapp_numbers(html), ["+2348031234567"])

    def test_rejects_non_nigerian_and_malformed(self):
        # A mis-parse is worse than no number: it would be written into a
        # prospect row and never questioned again.
        html = '<a href="https://wa.me/14155552671">US</a><a href="https://wa.me/123">short</a>'
        self.assertEqual(extract.whatsapp_numbers(html), [])

    def test_uses_whatsapp_detects_link_or_phrasing(self):
        self.assertTrue(extract.uses_whatsapp('<a href="https://wa.me/2349026051281">x</a>'))
        self.assertTrue(extract.uses_whatsapp("<p>DM to order, sizes available</p>"))
        self.assertFalse(extract.uses_whatsapp("<p>Call us on 0801 234 5678</p>"))


class TestNigerianSignals(unittest.TestCase):
    def test_naira_prices(self):
        html = "<p>₦3,000</p><p>₦12,500</p><p>NGN 53,000</p>"
        self.assertTrue(extract.has_price_list(html))
        self.assertTrue(extract.is_nigerian(html, "shop.com"))

    def test_two_prices_is_not_a_price_list(self):
        self.assertFalse(extract.has_price_list("<p>₦3,000</p><p>₦4,000</p>"))

    def test_ng_tld_alone_qualifies(self):
        self.assertTrue(extract.is_nigerian("<p>nothing here</p>", "shop.ng"))

    def test_city_prefers_the_longest_match(self):
        html = "<p>3 Adeola Odeku, Victoria Island, Lagos</p>"
        self.assertEqual(extract.city(html), "Victoria Island")

    def test_no_nigerian_signal(self):
        self.assertFalse(extract.is_nigerian("<p>London, United Kingdom</p>", "shop.com"))


class TestMisc(unittest.TestCase):
    def test_business_name_prefers_og_site_name(self):
        html = '<meta property="og:site_name" content="Nectar Beauty Hub"><title>Contact | Nectar</title>'
        self.assertEqual(extract.business_name(html, "x.com"), "Nectar Beauty Hub")

    def test_business_name_takes_brand_before_separator(self):
        html = "<title>DANG Lifestyle | Contact Us</title>"
        self.assertEqual(extract.business_name(html, "x.com"), "DANG Lifestyle")

    def test_business_name_picks_brand_over_tagline_either_side(self):
        # Sites put the brand on either side of the separator, so position
        # cannot be trusted; the tagline is simply the longer half.
        self.assertEqual(
            extract.business_name("<title>bCODE - Your Online Fashion Retail Store</title>", "x.com"),
            "bCODE",
        )
        self.assertEqual(
            extract.business_name("<title>Online Food Market for Nigerians | The Market Food Shop</title>", "x.com"),
            "The Market Food Shop",
        )

    def test_unspaced_hyphen_is_part_of_the_name(self):
        # "i-Fitness | Nigeria's Largest Gym" became "i" when a bare hyphen
        # was treated as a separator.
        self.assertEqual(
            extract.business_name("<title>i-Fitness | Nigeria's Largest Gym Chain</title>", "x.com"),
            "i-Fitness",
        )

    def test_business_name_drops_generic_page_labels(self):
        self.assertEqual(extract.business_name("<title>Home | Nectar Beauty Hub</title>", "x.com"), "Nectar Beauty Hub")

    def test_third_party_address_found_only_in_markup_is_rejected(self):
        # A Shopify app vendor's support desk is not the business.
        html = '<div data-app-config=\'{"support":"support@starapps.studio"}\'>x</div>'
        self.assertEqual(extract.emails(html, "shopmamatega.com"), [])

    def test_own_domain_address_in_markup_is_still_recovered(self):
        html = '<div data-contact="orders@shop.ng">x</div>'
        self.assertEqual(extract.emails(html, "shop.ng"), ["orders@shop.ng"])

    def test_business_name_falls_back_to_domain(self):
        self.assertEqual(extract.business_name("<p>hi</p>", "shop.ng"), "shop.ng")

    def test_instagram_handle_skips_post_paths(self):
        html = '<a href="https://instagram.com/p/abc123">post</a><a href="https://instagram.com/nectarbeautyng_">profile</a>'
        self.assertEqual(extract.instagram_handle(html), "nectarbeautyng_")

    def test_vertical_needs_two_hits(self):
        self.assertIsNone(extract.vertical("<p>we have a shop</p>"))
        self.assertEqual(
            extract.vertical("<p>Our boutique sells clothing and fashion. Add to cart.</p>"),
            "ecommerce",
        )

    def test_skincare_is_ecommerce_not_appointment_booking(self):
        html = "<p>Shop our skincare and beauty collection. Add to cart.</p>"
        self.assertEqual(extract.vertical(html), "ecommerce")

    def test_page_text_strips_scripts(self):
        html = "<script>var x=1;</script><p>Real   content</p><style>a{}</style>"
        self.assertEqual(extract.page_text(html), "Real content")

    def test_registrable_domain_drops_www(self):
        self.assertEqual(extract.registrable_domain("https://www.Shop.NG/pages/contact"), "shop.ng")


if __name__ == "__main__":
    unittest.main()
