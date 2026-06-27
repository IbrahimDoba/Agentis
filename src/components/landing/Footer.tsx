"use client"
import Link from "next/link"
import { NewsletterForm } from "@/components/landing/NewsletterForm"
import { BrandWordmark, useBrand } from "@/components/BrandProvider"
import styles from "./Footer.module.css"

// `platformOnly` links point to Dailzero's own marketing / company / legal
// pages. They're hidden on reseller tenants so a reseller's footer doesn't
// link her users out to Dailzero — only the branded, tenant-relevant links
// (What's New, Get Started) remain.
const footerColumns: {
  title: string
  links: { label: string; href: string; platformOnly?: boolean }[]
}[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features", platformOnly: true },
      { label: "How It Works", href: "/how-it-works", platformOnly: true },
      { label: "Pricing", href: "/pricing", platformOnly: true },
      { label: "Developers", href: "/developers", platformOnly: true },
      { label: "What's New", href: "/changelog", platformOnly: true },
      { label: "Get Started", href: "/signup" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/about", platformOnly: true },
      { label: "Blog", href: "/blog", platformOnly: true },
      { label: "Careers", href: "/careers", platformOnly: true },
      { label: "Contact", href: "/contact", platformOnly: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy", platformOnly: true },
      { label: "Terms of Service", href: "/terms", platformOnly: true },
      { label: "Security", href: "/security", platformOnly: true },
      { label: "Data Deletion", href: "/data-deletion", platformOnly: true },
    ],
  },
]

export function Footer() {
  const brand = useBrand()
  const isPlatform = brand.isPlatform

  // Drop Dailzero-only links (and any column left empty) on reseller tenants.
  const columns = footerColumns
    .map((col) => ({
      ...col,
      links: col.links.filter((l) => isPlatform || !l.platformOnly),
    }))
    .filter((col) => col.links.length > 0)

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link href="/" className={styles.logo}>
            <BrandWordmark size={28} />
          </Link>
          <p className={styles.desc}>
            AI-powered WhatsApp agents for Nigerian businesses. Automate conversations, delight customers, and scale without limits.
          </p>
          <NewsletterForm />

          {isPlatform && (
            <div className={styles.socials}>
              <a href="https://x.com/DobaIbrahim" target="_blank" rel="noopener noreferrer" className={styles.social} aria-label="Twitter / X">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a href="https://www.linkedin.com/in/ibrahimdoba/" target="_blank" rel="noopener noreferrer" className={styles.social} aria-label="LinkedIn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            </div>
          )}
        </div>

        {columns.map((col) => (
          <div key={col.title} className={styles.col}>
            <div className={styles.colTitle}>{col.title}</div>
            <ul className={styles.links}>
              {col.links.map((l) => (
                <li key={l.href}><Link href={l.href} className={styles.link}>{l.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={styles.bottom}>
        <span className={styles.copy}>© {new Date().getFullYear()} {brand.appName}. All rights reserved.</span>
        <span className={styles.copy}>Built with care for businesses across Nigeria</span>
      </div>
    </footer>
  )
}

export default Footer
