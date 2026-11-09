"use client"
import { useEffect, useRef } from "react"
import { LAND_DOTS } from "./globe-land"

// A dotted globe behind the hero, turning slowly, with messages arcing out of
// Lagos. Canvas 2D on purpose: the old three.js globe cost a WebGL
// context and a texture download for what is meant to be background.

const DEG = Math.PI / 180
const TILT = 18 * DEG
const SPIN = 0.05 // radians a second
const ARC_SECONDS = 1.6

const LAGOS: [number, number] = [6.52, 3.38]
const CITIES: [number, number][] = [
  [9.06, 7.5], // Abuja
  [5.6, -0.19], // Accra
  [-1.29, 36.82], // Nairobi
  [-26.2, 28.05], // Johannesburg
  [51.51, -0.13], // London
  [25.2, 55.27], // Dubai
  [40.71, -74.0], // New York
  [30.04, 31.24], // Cairo
]

type Vec = [number, number, number]

const toVec = (lat: number, lng: number): Vec => [
  Math.cos(lat * DEG) * Math.sin(lng * DEG),
  Math.sin(lat * DEG),
  Math.cos(lat * DEG) * Math.cos(lng * DEG),
]

// Point at u (0..1) along the great circle from a to b.
function slerp(a: Vec, b: Vec, u: number): Vec {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const omega = Math.acos(dot)
  if (omega < 1e-6) return a
  const s = Math.sin(omega)
  const ka = Math.sin((1 - u) * omega) / s
  const kb = Math.sin(u * omega) / s
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]
}

export function HeroGlobe({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let width = 0
    let height = 0
    let cx = 0
    let cy = 0
    let radius = 0
    let frame = 0
    let visible = true
    const start = performance.now()
    let color = "0, 220, 130"
    let tint = "150, 240, 120"
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
      // Wide: sits behind the chat column. Narrow: rises from the bottom edge
      // under the stacked chat, so the headline stays on a clean background.
      if (width > 960) {
        radius = Math.min(height * 0.46, width * 0.3)
        cx = width * 0.72
        cy = height * 0.55
      } else {
        radius = Math.min(width * 0.62, 340)
        cx = width / 2
        cy = height - radius * 0.55
      }
      readColor()
    }

    // Rotate by the spin, tilt the north pole towards the viewer, project.
    const project = (v: Vec, rot: number, lift = 1) => {
      const cr = Math.cos(rot)
      const sr = Math.sin(rot)
      const x = v[0] * cr + v[2] * sr
      const z0 = -v[0] * sr + v[2] * cr
      const y = v[1] * Math.cos(TILT) - z0 * Math.sin(TILT)
      const z = v[1] * Math.sin(TILT) + z0 * Math.cos(TILT)
      return { x: cx + x * radius * lift, y: cy - y * radius * lift, z, r: Math.hypot(x, y) * lift }
    }

    const land: Vec[] = []
    for (let k = 0; k < LAND_DOTS.length; k += 2) land.push(toVec(LAND_DOTS[k] / 10, LAND_DOTS[k + 1] / 10))

    const drawGlobe = (rot: number) => {
      // A faint body and rim so the oceans still read as part of a sphere.
      const body = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.35, 0, cx, cy, radius)
      body.addColorStop(0, `rgba(${color}, ${0.07 * strength})`)
      body.addColorStop(1, `rgba(${color}, ${0.015 * strength})`)
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fillStyle = body
      ctx.fill()
      ctx.strokeStyle = `rgba(${color}, ${0.16 * strength})`
      ctx.lineWidth = 1
      ctx.stroke()

      // Dots fade and shrink towards the rim, which is what makes it look round.
      const size = Math.max(1.1, radius / 230)
      ctx.fillStyle = `rgb(${color})`
      for (const v of land) {
        const s = project(v, rot)
        if (s.z <= 0.02) continue
        ctx.globalAlpha = (0.12 + 0.5 * s.z) * strength
        const d = size * (0.55 + 0.45 * s.z)
        ctx.fillRect(s.x - d / 2, s.y - d / 2, d, d)
      }
      ctx.globalAlpha = 1
    }

    const origin = toVec(...LAGOS)
    const targets = CITIES.map((c) => toVec(...c))

    const drawArcs = (rot: number, t: number) => {
      ctx.lineWidth = 1.25
      ctx.lineCap = "round"
      targets.forEach((target, i) => {
        // Staggered so one or two messages are always in flight, never all.
        const cycle = ((t / ARC_SECONDS + i) % CITIES.length) / 2
        const head = reduce ? 1 : Math.min(1, cycle)
        const tail = reduce ? 0 : Math.max(0, Math.min(1, cycle - 0.35))
        if (!reduce && (head <= tail || cycle > 1.35)) return

        const rgb = i % 2 ? tint : color
        ctx.beginPath()
        let pen = false
        for (let k = 0; k <= 40; k++) {
          const u = tail + (head - tail) * (k / 40)
          const s = project(slerp(origin, target, u), rot, 1 + Math.sin(Math.PI * u) * 0.18)
          // Hidden only where the sphere is in front of it.
          if (s.z < 0 && s.r < 1) {
            pen = false
            continue
          }
          if (pen) ctx.lineTo(s.x, s.y)
          else ctx.moveTo(s.x, s.y)
          pen = true
        }
        ctx.strokeStyle = `rgba(${rgb}, ${0.75 * strength})`
        ctx.stroke()

        if (head === 1) {
          const end = project(target, rot)
          if (end.z > 0) {
            ctx.beginPath()
            ctx.arc(end.x, end.y, 2.5, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${rgb}, ${0.9 * strength})`
            ctx.fill()
          }
        }
      })

      const home = project(origin, rot)
      if (home.z > 0) {
        const pulse = reduce ? 0 : (t % 2) / 2
        ctx.beginPath()
        ctx.arc(home.x, home.y, 3 + pulse * 10, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${color}, ${(1 - pulse) * 0.6 * strength})`
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(home.x, home.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${color}, ${strength})`
        ctx.fill()
      }
    }

    const draw = (now: number) => {
      const t = reduce ? 0 : (now - start) / 1000
      // Starts with West Africa facing the viewer, then turns east.
      const rot = -LAGOS[1] * DEG - 0.35 - t * SPIN
      ctx.clearRect(0, 0, width, height)
      drawGlobe(rot)
      drawArcs(rot, t)
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

    const viewObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      cancelAnimationFrame(frame)
      if (visible && !reduce) frame = requestAnimationFrame(loop)
    })
    viewObserver.observe(canvas)

    const themeObserver = new MutationObserver(() => {
      readColor()
      if (reduce || !visible) draw(performance.now())
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })

    return () => {
      cancelAnimationFrame(frame)
      sizeObserver.disconnect()
      viewObserver.disconnect()
      themeObserver.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
