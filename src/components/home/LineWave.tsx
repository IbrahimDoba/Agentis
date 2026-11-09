"use client"
import { useEffect, useRef } from "react"

// Dailzero's signature: a ribbon of thin lines that slowly ripples. Drawn on a
// 2D canvas (not three.js) so it costs a few hundred strokes a frame and stays
// smooth on cheap Android phones.
//
// "sweep" is a twisted ribbon behind the hero: narrow at the left edge, the
// lines cross over each other mid-way, then fan out wide and leave through the
// top-right. "band" is a flat lens-shaped ribbon used lower on the page.

type Variant = "sweep" | "band"

const LINES = { sweep: 44, band: 40 }
const STEP_PX = 5

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v))

export function LineWave({ variant = "sweep", className }: { variant?: Variant; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let width = 0
    let height = 0
    let frame = 0
    let visible = true
    let start = performance.now()
    // Read once per resize, not per frame: getComputedStyle forces style recalc.
    let color = "0, 220, 130"
    let tint = "120, 235, 150"
    let strength = 1

    const readColor = () => {
      const style = getComputedStyle(canvas)
      color = style.getPropertyValue("--wave-rgb").trim() || color
      tint = style.getPropertyValue("--wave-tint").trim() || tint
      strength = Number(style.getPropertyValue("--wave-strength")) || 1
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      readColor()
    }

    // y for line i at horizontal position x (0..1), time t in seconds.
    const sweepY = (x: number, i: number, n: number, t: number) => {
      // Small per-line jitter so the lines never look ruled.
      const s = (i / (n - 1) - 0.5) * 2 + Math.sin(i * 1.7) * 0.035
      // Spine: low on the left, climbing steeply after the middle and out
      // through the top-right.
      const spine = height * (0.86 - 0.3 * x - 0.6 * sigmoid((x - 0.72) / 0.1))
      // Ribbon width grows towards the right.
      const span = height * (0.045 + 0.24 * x * x)
      // The twist: cos(phase) passes through zero around x = 0.58, where the
      // lines cross, then flips so the ribbon turns over. Each line's phase is
      // offset a little so they cross one after another, not at one point.
      const phase = (Math.PI / 2) * (x / 0.58) + s * 0.45 + 0.22 * Math.sin(t * 0.35)
      const twist = s * span * Math.cos(phase) + s * height * 0.012
      const ripple = Math.sin(x * 6 + t * 0.6 + s * 2) * height * 0.012 * (0.4 + x)
      return spine + twist + ripple
    }

    const bandY = (x: number, i: number, n: number, t: number) => {
      const spread = (i / (n - 1) - 0.5) * 2
      // Lens: thin at both ends, widest in the middle.
      const lens = Math.sin(Math.PI * x)
      const ripple = Math.sin(x * 4 + t * 0.5 + i * 0.06) * height * 0.08 * lens
      return height * 0.5 + spread * height * 0.28 * lens * (0.7 + 0.3 * Math.sin(t * 0.3 + x * 3)) + ripple
    }

    const draw = (now: number) => {
      const t = reduce ? 4 : (now - start) / 1000
      const n = LINES[variant]
      const yAt = variant === "sweep" ? sweepY : bandY
      ctx.clearRect(0, 0, width, height)
      ctx.lineWidth = 1
      for (let i = 0; i < n; i++) {
        // Centre lines strongest, every third line in the lighter tint, and
        // each line fades in from the left edge.
        const edge = 1 - Math.abs(i / (n - 1) - 0.5) * 2
        const alpha = (0.18 + edge * 0.55) * strength
        const rgb = i % 3 === 0 ? tint : color
        const grad = ctx.createLinearGradient(0, 0, width, 0)
        grad.addColorStop(0, `rgba(${rgb}, 0)`)
        grad.addColorStop(variant === "sweep" ? 0.3 : 0.15, `rgba(${rgb}, ${alpha})`)
        grad.addColorStop(variant === "sweep" ? 0.92 : 0.85, `rgba(${rgb}, ${alpha})`)
        grad.addColorStop(1, `rgba(${rgb}, 0)`)
        ctx.strokeStyle = grad
        ctx.beginPath()
        for (let px = 0; px <= width; px += STEP_PX) {
          const y = yAt(px / width, i, n, t)
          if (px === 0) ctx.moveTo(px, y)
          else ctx.lineTo(px, y)
        }
        ctx.stroke()
      }
    }

    const loop = (now: number) => {
      draw(now)
      if (visible && !reduce) frame = requestAnimationFrame(loop)
    }

    resize()
    draw(performance.now())

    const sizeObserver = new ResizeObserver(() => {
      resize()
      draw(performance.now())
    })
    sizeObserver.observe(canvas)

    // Off screen it stops drawing entirely, so a long page isn't animating
    // three canvases at once.
    const viewObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      cancelAnimationFrame(frame)
      if (visible && !reduce) frame = requestAnimationFrame(loop)
    })
    viewObserver.observe(canvas)

    // The theme toggle swaps --wave-rgb; pick it up without a remount.
    const themeObserver = new MutationObserver(() => {
      readColor()
      if (reduce || !visible) draw(performance.now())
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })

    start = performance.now()
    return () => {
      cancelAnimationFrame(frame)
      sizeObserver.disconnect()
      viewObserver.disconnect()
      themeObserver.disconnect()
    }
  }, [variant])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
