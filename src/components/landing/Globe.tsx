"use client"
import { useRef, useState } from "react"
import dynamic from "next/dynamic"

const GlobeGL = dynamic(() => import("react-globe.gl"), { ssr: false })

const CITIES = [
  { lat: 6.5244, lng: 3.3792 },
  { lat: 9.0579, lng: 7.4951 },
  { lat: -1.2921, lng: 36.8219 },
  { lat: 30.0444, lng: 31.2357 },
  { lat: 51.5074, lng: -0.1278 },
  { lat: 48.8566, lng: 2.3522 },
  { lat: 40.7128, lng: -74.006 },
  { lat: 37.7749, lng: -122.4194 },
  { lat: 1.3521, lng: 103.8198 },
  { lat: 35.6762, lng: 139.6503 },
  { lat: -23.5505, lng: -46.6333 },
  { lat: 19.076, lng: 72.8777 },
  { lat: -33.8688, lng: 151.2093 },
  { lat: 25.2048, lng: 55.2708 },
  { lat: 52.52, lng: 13.405 },
  { lat: -26.2041, lng: 28.0473 },
]

const ARCS = [
  { startLat: 6.5244, startLng: 3.3792, endLat: 51.5074, endLng: -0.1278, color: "#00dc82" },
  { startLat: 6.5244, startLng: 3.3792, endLat: 40.7128, endLng: -74.006, color: "#00c8b4" },
  { startLat: 6.5244, startLng: 3.3792, endLat: 1.3521, endLng: 103.8198, color: "#00dc82" },
  { startLat: 51.5074, startLng: -0.1278, endLat: 40.7128, endLng: -74.006, color: "#00c8b4" },
  { startLat: 30.0444, startLng: 31.2357, endLat: 48.8566, endLng: 2.3522, color: "#00dc82" },
  { startLat: 25.2048, startLng: 55.2708, endLat: 35.6762, endLng: 139.6503, color: "#00c8b4" },
  { startLat: 25.2048, startLng: 55.2708, endLat: 19.076, endLng: 72.8777, color: "#00dc82" },
  { startLat: -1.2921, startLng: 36.8219, endLat: 30.0444, endLng: 31.2357, color: "#00c8b4" },
  { startLat: 37.7749, startLng: -122.4194, endLat: 1.3521, endLng: 103.8198, color: "#00dc82" },
  { startLat: -23.5505, startLng: -46.6333, endLat: 51.5074, endLng: -0.1278, color: "#00c8b4" },
  { startLat: 52.52, startLng: 13.405, endLat: 40.7128, endLng: -74.006, color: "#00dc82" },
  { startLat: -26.2041, startLng: 28.0473, endLat: 6.5244, endLng: 3.3792, color: "#00c8b4" },
  { startLat: 9.0579, startLng: 7.4951, endLat: 48.8566, endLng: 2.3522, color: "#00dc82" },
  { startLat: -33.8688, startLng: 151.2093, endLat: 35.6762, endLng: 139.6503, color: "#00c8b4" },
]

const GLOBE_SIZE = 560

export default function Globe() {
  const globeRef = useRef<any>(null)

  function onGlobeReady() {
    if (!globeRef.current) return
    const controls = globeRef.current.controls()
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.7
    controls.enableZoom = false
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    globeRef.current.pointOfView({ lat: 15, lng: 20, altitude: 1.9 })
  }

  return (
    <GlobeGL
      ref={globeRef}
      onGlobeReady={onGlobeReady}
      width={GLOBE_SIZE}
      height={GLOBE_SIZE}
      backgroundColor="rgba(0,0,0,0)"
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
      bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
      atmosphereColor="#00dc82"
      atmosphereAltitude={0.14}
      pointsData={CITIES}
      pointAltitude={0.01}
      pointColor={() => "#00dc82"}
      pointRadius={0.4}
      pointsMerge={false}
      arcsData={ARCS}
      arcColor="color"
      arcDashLength={0.4}
      arcDashGap={2}
      arcDashAnimateTime={2200}
      arcStroke={0.5}
      arcAltitude={0.22}
    />
  )
}
