import { HeroGlobe } from "@/components/home/HeroGlobe"
import { HeroChat } from "@/components/home/HeroChat"
import { TypedWord } from "@/components/home/TypedWord"
import { geist, geistMono } from "@/components/home/fonts"
import home from "@/components/home/Home.module.css"
import hero from "@/components/home/Hero.module.css"
import styles from "./AuthShowcase.module.css"

// The left half of the sign-in and sign-up screens on dailzero.com: the home
// page's globe and looping chat, so the product is working beside the form.
// Decorative, so it is hidden from screen readers and on narrow screens.

const WORDS = ["customer message", "11pm enquiry", "price question", "new order"]

const POINTS = ["Replies in seconds, day and night", "Hands over to you when it matters", "7 days free, no card needed"]

export function AuthShowcase() {
  return (
    <aside className={`${home.page} ${geist.variable} ${geistMono.variable} ${styles.panel}`} aria-hidden="true">
      <HeroGlobe className={styles.globe} />
      <div className={styles.inner}>
        <p className={styles.h}>
          <span className={hero.line1}>
            Every <TypedWord words={WORDS} className={hero.typed} caretClassName={hero.caret} />
          </span>
          <br />
          answered<span className={hero.dot}>.</span>
        </p>
        <div className={styles.chat}>
          <HeroChat />
        </div>
        <ul className={styles.points}>
          {POINTS.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </div>
    </aside>
  )
}
