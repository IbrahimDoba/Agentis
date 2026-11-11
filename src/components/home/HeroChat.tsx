"use client"
import { useEffect, useState } from "react"
import { Check, CheckCheck } from "lucide-react"
import styles from "./Hero.module.css"

// A late-night enquiry handled end to end, played as a loop. Every step is
// something the product really does: answer from the owner's prices, take
// the order, save the lead and ping the owner.

const STEPS = [
  { at: 400 },   // 1 customer asks
  { at: 1300 },  // 2 AI typing
  { at: 2500 },  // 3 AI answers
  { at: 3900 },  // 4 customer confirms
  { at: 4900 },  // 5 order card
  { at: 5600 },  // 6 price sent
  { at: 6200 },  // 7 order taken
  { at: 6800 },  // 8 owner notified
  { at: 7600 },  // 9 lead saved
]
const LOOP_MS = 11500
const FINAL = STEPS.length

const PILLS = ["Price sent", "Order taken", "Owner notified"]

export function HeroChat() {
  // Starts empty rather than finished: the server HTML paints before
  // hydration, and a full chat that then blanks and replays looks broken.
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(FINAL)
      return
    }
    let timers: ReturnType<typeof setTimeout>[] = []
    const play = () => {
      setStep(0)
      timers = STEPS.map((s, i) => setTimeout(() => setStep(i + 1), s.at))
      timers.push(setTimeout(play, LOOP_MS))
    }
    play()
    return () => timers.forEach(clearTimeout)
  }, [])

  const shown = (n: number) => (step >= n ? "true" : "false")

  return (
    <div className={styles.chat} aria-label="Example: the AI answers a customer on WhatsApp and takes their order" role="img">
      <div className={styles.bubbleIn} data-shown={shown(1)}>
        How much is the black sneakers in size 43?
        <span className={styles.time}>11:47 pm</span>
      </div>

      <div className={styles.typing} data-shown={step === 2 ? "true" : "false"}>
        <span /><span /><span />
      </div>

      <div className={styles.bubbleOut} data-shown={shown(3)}>
        <span className={styles.agent}>Your AI agent</span>
        It&apos;s ₦45,000 and size 43 is in stock. Should I reserve a pair for you?
        <span className={styles.time}>11:47 pm <CheckCheck size={14} aria-hidden="true" /></span>
      </div>

      <div className={styles.bubbleIn} data-shown={shown(4)}>
        Yes please, deliver to Lekki
        <span className={styles.time}>11:48 pm</span>
      </div>

      <div className={styles.order} data-shown={shown(5)}>
        <div className={styles.orderTop}>
          <span className={styles.orderId}>Order 1043</span>
          <span className={styles.orderPrice}>₦45,000</span>
        </div>
        <div className={styles.orderItem}>Black sneakers, size 43 · Lekki</div>
        <div className={styles.pills}>
          {PILLS.map((p, i) => (
            <span key={p} className={styles.pill} data-on={shown(6 + i)}>
              <Check size={12} aria-hidden="true" />
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.saved} data-shown={shown(9)}>
        <span className={styles.savedIcon}><Check size={14} aria-hidden="true" /></span>
        Lead saved to your dashboard
      </div>
    </div>
  )
}
