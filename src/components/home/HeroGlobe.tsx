"use client"
import { useEffect, useRef } from "react"
import { LAND_DOTS } from "./globe-land"

// A dotted globe behind the hero, turning slowly, with messages flying between
// cities on the side facing the viewer. Canvas 2D on purpose: the old three.js globe cost a WebGL
// context and a texture download for what is meant to be background.

const DEG = Math.PI / 180
const TILT = 18 * DEG
const SPIN = 0.05 // radians a second
const FLIGHTS = 10

// Lagos first: it is the hub, so a third of all flights start there.
const CITIES: [number, number][] = [
  [6.52, 3.38], // Lagos
  [9.06, 7.5], // Abuja
  [12.0, 8.52], // Kano
  [4.82, 7.03], // Port Harcourt
  [5.6, -0.19], // Accra
  [14.72, -17.47], // Dakar
  [5.36, -4.01], // Abidjan
  [-1.29, 36.82], // Nairobi
  [-26.2, 28.05], // Johannesburg
  [-33.92, 18.42], // Cape Town
  [30.04, 31.24], // Cairo
  [33.57, -7.59], // Casablanca
  [-4.32, 15.31], // Kinshasa
  [51.51, -0.13], // London
  [48.86, 2.35], // Paris
  [25.2, 55.27], // Dubai
  [40.71, -74.0], // New York
  [-23.55, -46.63], // Sao Paulo
  [19.08, 72.88], // Mumbai
  [6.34, 5.63], // Benin City
  [7.38, 3.95], // Ibadan
  [9.03, 38.74], // Addis Ababa
  [-6.79, 39.21], // Dar es Salaam
  [0.35, 32.58], // Kampala
  [-8.84, 13.23], // Luanda
  [36.75, 3.06], // Algiers
  [15.5, 32.56], // Khartoum
  [40.42, -3.7], // Madrid
  [52.52, 13.4], // Berlin
  [41.01, 28.98], // Istanbul
  [24.71, 46.68], // Riyadh
  [38.91, -77.04], // Washington
  [-34.6, -58.38], // Buenos Aires
  [1.35, 103.82], // Singapore
  [39.9, 116.4], // Beijing
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
      // The globe can override the shared wave colours: fine dots on a light
      // page need a darker green and more weight than the line ribbon does.
      color = style.getPropertyValue("--globe-rgb").trim() || style.getPropertyValue("--wave-rgb").trim() || color
      tint = style.getPropertyValue("--wave-tint").trim() || tint
      strength = Number(style.getPropertyValue("--globe-strength")) || Number(style.getPropertyValue("--wave-strength")) || 1
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

    const cities = CITIES.map((c) => toVec(...c))
    const angle = (a: Vec, b: Vec) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
    const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
    const clamp = (u: number) => Math.min(1, Math.max(0, u))

    type Flight = { from: number; to: number; start: number; duration: number; rgb: "color" | "tint" }
    const flights: (Flight | null)[] = Array(FLIGHTS).fill(null)

    // Only routes between cities on the near side, so every flight is seen
    // from take-off to landing instead of vanishing behind the globe.
    const pickFlight = (rot: number, t: number, slot: number): Flight | null => {
      const near = cities.map((c, i) => (project(c, rot).z > 0.3 ? i : -1)).filter((i) => i >= 0)
      if (near.length < 2) return null
      for (let tries = 0; tries < 12; tries++) {
        const from = Math.random() < 0.33 && near.includes(0) ? 0 : near[Math.floor(Math.random() * near.length)]
        const to = near[Math.floor(Math.random() * near.length)]
        const gap = angle(cities[from], cities[to])
        const busy = flights.some((f) => f && ((f.from === from && f.to === to) || (f.from === to && f.to === from)))
        if (from === to || busy || gap < 8 * DEG || gap > 75 * DEG) continue
        return { from, to, start: t, duration: 1.6 + gap * 1.6, rgb: slot % 2 ? "tint" : "color" }
      }
      return null
    }

    // Reduced motion: a still picture of Lagos already connected.
    const still: Flight[] = [7, 13, 15, 8].map((to, i) => ({ from: 0, to, start: 0, duration: 1, rgb: i % 2 ? "tint" : "color" }))

    const point = (f: Flight, u: number, rot: number) => {
      const lift = 1 + Math.sin(Math.PI * u) * (0.04 + angle(cities[f.from], cities[f.to]) * 0.22)
      return project(slerp(cities[f.from], cities[f.to], u), rot, lift)
    }

    const drawFlight = (f: Flight, rot: number, t: number) => {
      // The head flies out first, the tail follows and reels the line in.
      const p = reduce ? 0.66 : (t - f.start) / (f.duration * 1.5)
      const head = ease(clamp(p / 0.66))
      const tail = reduce ? 0 : ease(clamp((p - 0.4) / 0.6))
      const rgb = f.rgb === "tint" ? tint : color
      const steps = 28

      // Drawn as short segments so the trail can fade out behind the head.
      let prev = point(f, tail, rot)
      for (let k = 1; k <= steps; k++) {
        const u = tail + (head - tail) * (k / steps)
        const s = point(f, u, rot)
        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(s.x, s.y)
        ctx.strokeStyle = `rgba(${rgb}, ${(0.1 + 0.75 * (k / steps)) * strength})`
        ctx.stroke()
        prev = s
      }

      if (head < 1) {
        const glow = ctx.createRadialGradient(prev.x, prev.y, 0, prev.x, prev.y, 9)
        glow.addColorStop(0, `rgba(${rgb}, ${0.55 * strength})`)
        glow.addColorStop(1, `rgba(${rgb}, 0)`)
        ctx.fillStyle = glow
        ctx.fillRect(prev.x - 9, prev.y - 9, 18, 18)
        ctx.beginPath()
        ctx.arc(prev.x, prev.y, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb}, ${strength})`
        ctx.fill()
      } else if (!reduce) {
        // Landing ring at the destination.
        const ring = clamp((p - 0.66) / 0.4)
        const end = project(cities[f.to], rot)
        ctx.beginPath()
        ctx.arc(end.x, end.y, 3 + ring * 12, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${rgb}, ${(1 - ring) * 0.7 * strength})`
        ctx.stroke()
      }
    }

    const drawArcs = (rot: number, t: number) => {
      ctx.lineWidth = 1.25
      ctx.lineCap = "round"

      for (const [i, c] of cities.entries()) {
        const s = project(c, rot)
        if (s.z <= 0.05) continue
        ctx.beginPath()
        ctx.arc(s.x, s.y, i === 0 ? 3 : 1.8, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${color}, ${(i === 0 ? 1 : 0.35 + 0.4 * s.z) * strength})`
        ctx.fill()
      }

      if (reduce) {
        still.forEach((f) => drawFlight(f, rot, t))
        return
      }

      flights.forEach((f, slot) => {
        if (f && t - f.start > f.duration * 1.5) flights[slot] = null
        // First flights take off one after another rather than all at once.
        if (!flights[slot] && t > slot * 0.45) flights[slot] = pickFlight(rot, t, slot)
        const live = flights[slot]
        if (live) drawFlight(live, rot, t)
      })
    }

    const draw = (now: number) => {
      const t = reduce ? 0 : (now - start) / 1000
      // Starts with West Africa facing the viewer, then turns east.
      const rot = -CITIES[0][1] * DEG - 0.35 - t * SPIN
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
