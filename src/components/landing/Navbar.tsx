"use client"
import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { SunIcon, MoonIcon, ChevronDownIcon } from "@heroicons/react/24/outline"
import { useTheme } from "@/components/ThemeProvider"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./Navbar.module.css"

const industries = [
  { label: "E-commerce & Retail", desc: "Automate product Q&A and orders", emoji: "🛍️", href: "/solutions/ecommerce" },
  { label: "Restaurants & Food", desc: "Reservations, menus and orders", emoji: "🍽️", href: "/solutions/restaurants" },
  { label: "Real Estate", desc: "Qualify leads and book viewings", emoji: "🏠", href: "/solutions/real-estate" },
  { label: "Healthcare & Clinics", desc: "Appointment booking and FAQs", emoji: "🏥", href: "/solutions/healthcare" },
  { label: "Logistics & Delivery", desc: "Real-time tracking updates", emoji: "🚚", href: "/solutions/logistics" },
  { label: "Financial Services", desc: "Lead qualification and product Q&A", emoji: "💰", href: "/solutions/finance" },
]

const useCases = [
  { label: "Customer Support", desc: "24/7 automated responses", emoji: "💬", href: "/solutions/customer-support" },
  { label: "Lead Generation", desc: "Capture and qualify every lead", emoji: "🔥", href: "/solutions/lead-generation" },
  { label: "Appointment Booking", desc: "Book directly on WhatsApp", emoji: "📅", href: "/solutions/appointment-booking" },
  { label: "Broadcasts & Campaigns", desc: "Reach your entire contact base", emoji: "📢", href: "/solutions/broadcasts" },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [solutionsOpen, setSolutionsOpen] = useState(false)
  const [mobileSolutionsOpen, setMobileSolutionsOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [menuOpen])

  function closeMenu() {
    setMenuOpen(false)
    setMobileSolutionsOpen(false)
  }

  function handleSolutionsEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setSolutionsOpen(true)
  }

  function handleSolutionsLeave() {
    closeTimer.current = setTimeout(() => {
      setSolutionsOpen(false)
    }, 150)
  }

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
      <Link href="/" className={styles.logo}>
        <LogoIcon size={32} />
        D-Zero AI
      </Link>

      <ul className={styles.links}>
        <li><Link href="/features" className={styles.link}>Features</Link></li>

        {/* Solutions mega dropdown */}
        <li
          className={styles.solutionsItem}
          onMouseEnter={handleSolutionsEnter}
          onMouseLeave={handleSolutionsLeave}
        >
          <button
            className={`${styles.solutionsTrigger} ${solutionsOpen ? styles.solutionsTriggerOpen : ""}`}
            aria-expanded={solutionsOpen}
            aria-haspopup="true"
          >
            Solutions
            <ChevronDownIcon
              width={14}
              height={14}
              className={`${styles.chevron} ${solutionsOpen ? styles.chevronOpen : ""}`}
            />
          </button>

          {solutionsOpen && (
            <div
              className={styles.dropdown}
              onMouseEnter={handleSolutionsEnter}
              onMouseLeave={handleSolutionsLeave}
            >
              <div className={styles.dropdownInner}>
                <div className={styles.dropdownSection}>
                  <div className={styles.dropdownSectionTitle}>By Industry</div>
                  <div className={styles.dropdownGrid}>
                    {industries.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={styles.dropdownItem}
                        onClick={() => setSolutionsOpen(false)}
                      >
                        <div className={styles.dropdownItemIcon}>{item.emoji}</div>
                        <div className={styles.dropdownItemContent}>
                          <div className={styles.dropdownItemTitle}>{item.label}</div>
                          <div className={styles.dropdownItemDesc}>{item.desc}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                <div className={styles.dropdownSection}>
                  <div className={styles.dropdownSectionTitle}>By Use Case</div>
                  <div className={styles.dropdownList}>
                    {useCases.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={styles.dropdownItem}
                        onClick={() => setSolutionsOpen(false)}
                      >
                        <div className={styles.dropdownItemIcon}>{item.emoji}</div>
                        <div className={styles.dropdownItemContent}>
                          <div className={styles.dropdownItemTitle}>{item.label}</div>
                          <div className={styles.dropdownItemDesc}>{item.desc}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </li>

        <li><Link href="/how-it-works" className={styles.link}>How It Works</Link></li>
        <li><Link href="/pricing" className={styles.link}>Pricing</Link></li>
        <li><Link href="/contact" className={styles.link}>Contact</Link></li>
      </ul>

      <div className={styles.actions}>
        <button className={styles.themeToggle} onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
        </button>
        <Link href="/login" className={styles.signIn}>Sign in</Link>
        <Link href="/signup" className={styles.getAccess}>Get Access</Link>
      </div>

      {/* Hamburger */}
      <button
        className={styles.hamburger}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        <span className={`${styles.bar} ${menuOpen ? styles.barTop : ""}`} />
        <span className={`${styles.bar} ${menuOpen ? styles.barMid : ""}`} />
        <span className={`${styles.bar} ${menuOpen ? styles.barBot : ""}`} />
      </button>

      {/* Mobile menu */}
      {menuOpen && (
        <div className={styles.mobileMenu}>
          <div className={styles.mobileMenuInner}>
            <Link href="/features" className={styles.mobileLink} onClick={closeMenu}>Features</Link>

            {/* Solutions accordion */}
            <button
              className={styles.mobileSolutionsToggle}
              onClick={() => setMobileSolutionsOpen(!mobileSolutionsOpen)}
              aria-expanded={mobileSolutionsOpen}
            >
              Solutions
              <ChevronDownIcon
                width={16}
                height={16}
                className={`${styles.chevron} ${mobileSolutionsOpen ? styles.chevronOpen : ""}`}
              />
            </button>

            {mobileSolutionsOpen && (
              <div className={styles.mobileSolutionsList}>
                <div className={styles.mobileSolutionsGroup}>
                  <div className={styles.mobileSolutionsGroupLabel}>By Industry</div>
                  {industries.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={styles.mobileSolutionLink}
                      onClick={closeMenu}
                    >
                      <span>{item.emoji}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>
                <div className={styles.mobileSolutionsGroup}>
                  <div className={styles.mobileSolutionsGroupLabel}>By Use Case</div>
                  {useCases.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={styles.mobileSolutionLink}
                      onClick={closeMenu}
                    >
                      <span>{item.emoji}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <Link href="/how-it-works" className={styles.mobileLink} onClick={closeMenu}>How It Works</Link>
            <Link href="/pricing" className={styles.mobileLink} onClick={closeMenu}>Pricing</Link>
            <Link href="/contact" className={styles.mobileLink} onClick={closeMenu}>Contact</Link>

            {/* Theme toggle */}
            <div className={styles.mobileThemeRow}>
              <span className={styles.mobileThemeLabel}>
                {theme === "dark" ? "Dark mode" : "Light mode"}
              </span>
              <button className={styles.mobileThemeToggle} onClick={toggle} aria-label="Toggle theme">
                {theme === "dark" ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
              </button>
            </div>

            {/* CTA buttons */}
            <div className={styles.mobileActions}>
              <Link href="/login" className={styles.mobileSignIn} onClick={closeMenu}>Sign in</Link>
              <Link href="/signup" className={styles.mobileGetAccess} onClick={closeMenu}>Get Access</Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
