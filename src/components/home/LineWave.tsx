"use client"
import { useEffect, useRef } from "react"

// Dailzero's signature: a ribbon of thin lines that slowly ripples. Drawn on a
// 2D canvas (not three.js) so it costs a few hundred strokes a frame and stays
// smooth on cheap Android phones.
//
// "sweep" rises from bottom-left to top-right behind the hero; "band" is a flat
// lens-shaped ribbon used as a divider lower on the page.

type Variant = "sweep" | "band"

const LINES = { sweep: 64, band: 40 }
const STEP_PX = 6

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
    let strength = 1

    const readColor = () => {
      const style = getComputedStyle(canvas)
      const raw = style.getPropertyValue("--wave-rgb").trim()
      if (raw) color = raw
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
      const spread = (i / (n - 1) - 0.5) * 2
      // Smooth S-curve from the bottom-left corner up to the top-right.
      const rise = 1 / (1 + Math.exp(-9 * (x - 0.62)))
      const base = height * (0.92 - 0.95 * rise)
      // Lines bunch together on the left and fan out to the right.
      const fan = spread * height * 0.16 * (0.15 + x * x)
      const ripple = Math.sin(x * 5.2 + t * 0.55 + i * 0.045) * height * 0.025 * (0.3 + x)
      return base + fan + ripple
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
        // Centre lines strongest; the edges fade out.
        const edge = 1 - Math.abs(i / (n - 1) - 0.5) * 2
        ctx.strokeStyle = `rgba(${color}, ${(0.06 + edge * 0.3) * strength})`
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
