"use client"

import { useEffect, useRef } from "react"

// Lightweight canvas confetti burst — no dependency. Fires once on mount and
// cleans itself up. Rendered fixed + pointer-events:none so it overlays the UI.
export function Confetti({ durationMs = 2800 }: { durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
    }
    resize()

    const colors = ["#22c55e", "#16a34a", "#2563eb", "#f59e0b", "#db2777", "#7c3aed"]
    const originX = canvas.width / 2
    const originY = canvas.height / 3
    const parts = Array.from({ length: 180 }, () => ({
      x: originX,
      y: originY,
      vx: (Math.random() - 0.5) * 20 * dpr,
      vy: (Math.random() - 1.1) * 17 * dpr,
      size: (4 + Math.random() * 6) * dpr,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
    }))

    const gravity = 0.42 * dpr
    const start = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const elapsed = now - start
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of parts) {
        p.vy += gravity
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }
      if (elapsed < durationMs) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    window.addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [durationMs])

  return (
    <canvas
      ref={ref}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}
      aria-hidden
    />
  )
}
