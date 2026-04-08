import Link from "next/link"
import { LogoIcon } from "@/components/landing/Logo"
import { NewsletterForm } from "@/components/landing/NewsletterForm"
import styles from "./Footer.module.css"

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link href="/" className={styles.logo}>
            <LogoIcon size={28} />
            D-Zero AI
</Link>
          <p className={styles.desc}>
            AI-powered WhatsApp agents for Nigerian businesses. Automate conversations, delight customers, and scale without limits.
          </p>
          <NewsletterForm />

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
        </div>

        <div className={styles.col}>
          <div className={styles.colTitle}>Product</div>
          <ul className={styles.links}>
            <li><Link href="/features" className={styles.link}>Features</Link></li>
            <li><Link href="/how-it-works" className={styles.link}>How It Works</Link></li>
            <li><Link href="/pricing" className={styles.link}>Pricing</Link></li>
            <li><Link href="/signup" className={styles.link}>Get Started</Link></li>
          </ul>
        </div>

        <div className={styles.col}>
          <div className={styles.colTitle}>Company</div>
          <ul className={styles.links}>
            <li><Link href="/about" className={styles.link}>About Us</Link></li>
            <li><Link href="/blog" className={styles.link}>Blog</Link></li>
            <li><Link href="/careers" className={styles.link}>Careers</Link></li>
            <li><Link href="/contact" className={styles.link}>Contact</Link></li>
          </ul>
        </div>

        <div className={styles.col}>
          <div className={styles.colTitle}>Legal</div>
          <ul className={styles.links}>
            <li><Link href="/privacy" className={styles.link}>Privacy Policy</Link></li>
            <li><Link href="/terms" className={styles.link}>Terms of Service</Link></li>
            <li><Link href="/security" className={styles.link}>Security</Link></li>
            <li><Link href="/data-deletion" className={styles.link}>Data Deletion</Link></li>
          </ul>
        </div>
      </div>

      <div className={styles.bottom}>
        <span className={styles.copy}>© {new Date().getFullYear()} D-Zero AI. All rights reserved.</span>
        <span className={styles.copy}>Built with care for businesses across Nigeria</span>
      </div>
    </footer>
  )
}

export default Footer
