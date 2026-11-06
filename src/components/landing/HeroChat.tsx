import { useId } from "react"
import { Ticks } from "./Ticks"
import styles from "./HeroChat.module.css"

// Drawn, not a photo: indigo resist-dyed cloth, the product this chat is selling.
function AdireSwatch() {
  const id = useId().replace(/:/g, "")
  return (
    <svg className={styles.swatch} viewBox="0 0 240 120" role="img" aria-label="Navy Adire fabric">
      <defs>
        <pattern id={`${id}-p`} width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#18285c" />
          <circle cx="20" cy="20" r="11" fill="none" stroke="#c9d4ee" strokeWidth="1.5" />
          <circle cx="20" cy="20" r="6" fill="none" stroke="#c9d4ee" strokeWidth="1.25" strokeDasharray="2 2" />
          <circle cx="20" cy="20" r="1.75" fill="#e4eaf7" />
          <path d="M0 0l6 6M40 0l-6 6M0 40l6-6M40 40l-6-6" stroke="#8fa2d4" strokeWidth="1.25" />
        </pattern>
        <filter id={`${id}-f`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="3" seed="7" />
          <feColorMatrix values="0 0 0 0 0.03  0 0 0 0 0.05  0 0 0 0 0.16  0 0 0 0.9 -0.28" />
        </filter>
      </defs>
      <rect width="240" height="120" fill={`url(#${id}-p)`} />
      <rect width="240" height="120" filter={`url(#${id}-f)`} />
    </svg>
  )
}

export function HeroChat() {
  return (
    <div className={styles.visual}>
      <div className={styles.phone}>
        <div className={styles.screen}>
          <div className={styles.header}>
            <span className={styles.avatar} aria-hidden="true">C</span>
            <span className={styles.contact}>
              <span className={styles.name}>Chioma A.</span>
              <span className={styles.presence}>online</span>
            </span>
          </div>
          <div className={styles.thread}>
            <div className={styles.in}>
              Hi, do you have the Adire fabric in blue?
              <span className={styles.time}>2:31 AM</span>
            </div>
            <div className={styles.out}>
              <AdireSwatch />
              Yes, in sky blue, navy and indigo, from ₦4,500 per yard
              <span className={styles.time}>2:31 AM <Ticks className={styles.ticks} /></span>
            </div>
            <div className={styles.in}>
              How much for 3 yards of navy?
              <span className={styles.time}>2:32 AM</span>
            </div>
            <div className={styles.out}>
              3 yards of navy Adire comes to ₦13,500, with free delivery within Lagos. Want to proceed?
              <span className={styles.time}>2:32 AM <Ticks className={styles.ticks} /></span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.lead}>
        <div className={styles.leadTop}>
          <span>New lead</span>
          <span className={styles.leadTime}>2:32 AM</span>
        </div>
        <div className={styles.leadName}>Chioma A.</div>
        <div className={styles.leadItem}>3 yards of navy Adire</div>
        <div className={styles.leadAmount}>₦13,500</div>
        <ol className={styles.pipeline}>
          <li className={styles.stageNow}>New</li>
          <li>Contacted</li>
          <li>Won</li>
        </ol>
      </div>
    </div>
  )
}
