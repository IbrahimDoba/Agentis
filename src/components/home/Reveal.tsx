"use client"
import { useEffect, useRef, useState } from "react"
import styles from "./Home.module.css"

// Fades and lifts its direct children into place, staggered, the first time
// the block scrolls into view. The CSS only hides children once JS has marked
// the block as armed, so the content is never invisible without JS.
export function Reveal({ children, className, as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "ul" | "ol" }) {
  const ref = useRef<HTMLElement>(null)
  const [state, setState] = useState<"idle" | "armed" | "in">("idle")

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    // Already on screen at load: show without the lift so nothing jumps.
    const box = el.getBoundingClientRect()
    if (box.top < window.innerHeight * 0.9) return
    setState("armed")
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setState("in")
      observer.disconnect()
    }, { rootMargin: "0px 0px -12% 0px" })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag ref={ref as React.Ref<never>} className={`${styles.reveal} ${className ?? ""}`} data-reveal={state}>
      {children}
    </Tag>
  )
}
