"use client"
import { useRef, useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import styles from "./Globe.module.css"

const GlobeGL = dynamic(() => import("react-globe.gl"), { ssr: false })

const CITIES = [
  { lat: 6.5244,  lng: 3.3792   }, // Lagos
  { lat: 9.0579,  lng: 7.4951   }, // Abuja
  { lat: -1.2921, lng: 36.8219  }, // Nairobi
  { lat: 30.0444, lng: 31.2357  }, // Cairo
  { lat: 51.5074, lng: -0.1278  }, // London
  { lat: 48.8566, lng: 2.3522   }, // Paris
  { lat: 40.7128, lng: -74.006  }, // New York
  { lat: 37.7749, lng: -122.4194}, // San Francisco
  { lat: 34.0522, lng: -118.2437}, // Los Angeles
  { lat: 1.3521,  lng: 103.8198 }, // Singapore
  { lat: 35.6762, lng: 139.6503 }, // Tokyo
  { lat: -23.5505,lng: -46.6333 }, // São Paulo
  { lat: 19.076,  lng: 72.8777  }, // Mumbai
  { lat: -33.8688,lng: 151.2093 }, // Sydney
  { lat: 25.2048, lng: 55.2708  }, // Dubai
  { lat: 52.52,   lng: 13.405   }, // Berlin
  { lat: -26.2041,lng: 28.0473  }, // Johannesburg
  { lat: 55.7558, lng: 37.6176  }, // Moscow
  { lat: 41.9028, lng: 12.4964  }, // Rome
  { lat: 22.3193, lng: 114.1694 }, // Hong Kong
]

// c: 0 = primary color, c: 1 = secondary color
const RAW_ARCS = [
  // Lagos as hub — 8 outgoing
  { startLat: 6.5244,  startLng: 3.3792,   endLat: 51.5074, endLng: -0.1278,   c: 0 },
  { startLat: 6.5244,  startLng: 3.3792,   endLat: 40.7128, endLng: -74.006,   c: 1 },
  { startLat: 6.5244,  startLng: 3.3792,   endLat: 1.3521,  endLng: 103.8198,  c: 0 },
  { startLat: 6.5244,  startLng: 3.3792,   endLat: 35.6762, endLng: 139.6503,  c: 1 },
  { startLat: 6.5244,  startLng: 3.3792,   endLat: -23.5505,endLng: -46.6333,  c: 0 },
  { startLat: 6.5244,  startLng: 3.3792,   endLat: 25.2048, endLng: 55.2708,   c: 1 },
  { startLat: 6.5244,  startLng: 3.3792,   endLat: -33.8688,endLng: 151.2093,  c: 0 },
  { startLat: 6.5244,  startLng: 3.3792,   endLat: 34.0522, endLng: -118.2437, c: 1 },
  // Europe
  { startLat: 51.5074, startLng: -0.1278,  endLat: 40.7128, endLng: -74.006,   c: 1 },
  { startLat: 51.5074, startLng: -0.1278,  endLat: 1.3521,  endLng: 103.8198,  c: 0 },
  { startLat: 51.5074, startLng: -0.1278,  endLat: -26.2041,endLng: 28.0473,   c: 1 },
  { startLat: 48.8566, startLng: 2.3522,   endLat: 30.0444, endLng: 31.2357,   c: 0 },
  { startLat: 52.52,   startLng: 13.405,   endLat: 40.7128, endLng: -74.006,   c: 1 },
  { startLat: 41.9028, startLng: 12.4964,  endLat: 25.2048, endLng: 55.2708,   c: 0 },
  { startLat: 55.7558, startLng: 37.6176,  endLat: 35.6762, endLng: 139.6503,  c: 1 },
  // Middle East / Asia
  { startLat: 25.2048, startLng: 55.2708,  endLat: 35.6762, endLng: 139.6503,  c: 0 },
  { startLat: 25.2048, startLng: 55.2708,  endLat: 19.076,  endLng: 72.8777,   c: 1 },
  { startLat: 25.2048, startLng: 55.2708,  endLat: 51.5074, endLng: -0.1278,   c: 0 },
  { startLat: 22.3193, startLng: 114.1694, endLat: 1.3521,  endLng: 103.8198,  c: 1 },
  { startLat: 22.3193, startLng: 114.1694, endLat: 35.6762, endLng: 139.6503,  c: 0 },
  { startLat: 19.076,  startLng: 72.8777,  endLat: 1.3521,  endLng: 103.8198,  c: 1 },
  // Americas
  { startLat: 37.7749, startLng: -122.4194,endLat: 1.3521,  endLng: 103.8198,  c: 0 },
  { startLat: 37.7749, startLng: -122.4194,endLat: 35.6762, endLng: 139.6503,  c: 1 },
  { startLat: -23.5505,startLng: -46.6333, endLat: 51.5074, endLng: -0.1278,   c: 0 },
  { startLat: 40.7128, startLng: -74.006,  endLat: 1.3521,  endLng: 103.8198,  c: 1 },
  // Africa connections
  { startLat: -1.2921, startLng: 36.8219,  endLat: 30.0444, endLng: 31.2357,   c: 0 },
  { startLat: -26.2041,startLng: 28.0473,  endLat: 6.5244,  endLng: 3.3792,    c: 1 },
  { startLat: 9.0579,  startLng: 7.4951,   endLat: 48.8566, endLng: 2.3522,    c: 0 },
  { startLat: -1.2921, startLng: 36.8219,  endLat: 51.5074, endLng: -0.1278,   c: 1 },
  // Pacific
  { startLat: -33.8688,startLng: 151.2093, endLat: 35.6762, endLng: 139.6503,  c: 0 },
  { startLat: -33.8688,startLng: 151.2093, endLat: 1.3521,  endLng: 103.8198,  c: 1 },
]

const PRIMARY   = "#00dc82"
const SECONDARY = "#00c8b4"
const NIGHT_IMAGE = "//unpkg.com/three-globe/example/img/earth-night.jpg"

function getSize() {
  if (typeof window === "undefined") return 560
  const vw = window.innerWidth
  if (vw < 400) return 300
  if (vw < 600) return 340
  if (vw < 900) return 420
  return 560
}

export default function Globe() {
  const globeRef = useRef<any>(null)
  const [size, setSize]       = useState(560)
  const [timeStr, setTimeStr] = useState("")

  // Responsive size
  useEffect(() => {
    setSize(getSize())
    const onResize = () => setSize(getSize())
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Live clock — ticks every second
  useEffect(() => {
    function tick() {
      setTimeStr(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "Africa/Lagos",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
          hour12: false,
        }).format(new Date())
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const arcsData = useMemo(() =>
    RAW_ARCS.map(arc => ({
      ...arc,
      color: arc.c === 0 ? PRIMARY : SECONDARY,
    }))
  , [])

  function onGlobeReady() {
    if (!globeRef.current) return
    const controls = globeRef.current.controls()
    controls.autoRotate      = true
    controls.autoRotateSpeed = 0.6
    controls.enableZoom      = false
    controls.enablePan       = false
    controls.enableDamping   = true
    controls.dampingFactor   = 0.08
    globeRef.current.pointOfView({ lat: 15, lng: 20, altitude: 1.9 })
  }

  return (
    <div className={styles.globeWrapper}>
      {timeStr && (
        <div className={styles.clock}>
          <span className={styles.clockIcon}>🌐</span>
          <span className={styles.clockTime}>{timeStr}</span>
        </div>
      )}

      <GlobeGL
        ref={globeRef}
        onGlobeReady={onGlobeReady}
        width={size}
        height={size}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl={NIGHT_IMAGE}
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        atmosphereColor={PRIMARY}
        atmosphereAltitude={0.15}
        pointsData={CITIES}
        pointAltitude={0.01}
        pointColor={() => PRIMARY}
        pointRadius={0.4}
        pointsMerge={false}
        arcsData={arcsData}
        arcColor="color"
        arcDashLength={0.35}
        arcDashGap={1.8}
        arcDashAnimateTime={1800}
        arcStroke={0.5}
        arcAltitude={0.22}
      />
    </div>
  )
}
