"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Sun, Moon } from "lucide-react"
import { useTheme } from "@/components/ThemeProvider"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./Navbar.module.css"

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, toggle } = useTheme()

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
      <Link href="/" className={styles.logo}>
        <LogoIcon size={32} />
        Agentis
      </Link>

      <ul className={styles.links}>
        <li><Link href="/features" className={styles.link}>Features</Link></li>
        <li><Link href="/how-it-works" className={styles.link}>How It Works</Link></li>
        <li><Link href="/pricing" className={styles.link}>Pricing</Link></li>
        <li><Link href="/contact" className={styles.link}>Contact</Link></li>
      </ul>

      <div className={styles.actions}>
        <button className={styles.themeToggle} onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <Link href="/login" className={styles.signIn}>Sign in</Link>
        <Link href="/signup" className={styles.getAccess}>Get Access</Link>
      </div>

      <button
        className={styles.hamburger}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        <span className={`${styles.bar} ${menuOpen ? styles.barTop : ""}`} />
        <span className={`${styles.bar} ${menuOpen ? styles.barMid : ""}`} />
        <span className={`${styles.bar} ${menuOpen ? styles.barBot : ""}`} />
      </button>

      {menuOpen && (
        <div className={styles.mobileMenu}>
          <Link href="/features" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>Features</Link>
          <Link href="/how-it-works" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>How It Works</Link>
          <Link href="/pricing" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>Pricing</Link>
          <Link href="/contact" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>Contact</Link>
          <div className={styles.mobileDivider} />
          <Link href="/login" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>Sign in</Link>
          <Link href="/signup" className={styles.mobileGetAccess} onClick={() => setMenuOpen(false)}>Get Access</Link>
        </div>
      )}
    </nav>
  )
}

export default Navbar
