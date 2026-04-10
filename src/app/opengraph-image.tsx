import { ImageResponse } from "next/og"
import { readFileSync } from "fs"
import { join } from "path"

export const runtime = "nodejs"
export const alt = "D-Zero AI — WhatsApp AI Agents for Business"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OGImage() {
  const logoData = readFileSync(join(process.cwd(), "public/logo-removed-bg.png"))
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0a1a0e",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,220,130,0.12) 0%, transparent 70%)",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />

        {/* Logo */}
        <img
          src={logoSrc}
          width={96}
          height={96}
          style={{ marginBottom: "28px", borderRadius: "22px" }}
        />

        {/* Wordmark */}
        <div
          style={{
            fontSize: "64px",
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-2px",
            marginBottom: "16px",
            display: "flex",
          }}
        >
          D-Zero AI
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "28px",
            color: "#00dc82",
            fontWeight: 500,
            letterSpacing: "-0.5px",
          }}
        >
          WhatsApp AI Agents for Business
        </div>

        {/* Bottom domain */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            fontSize: "18px",
            color: "rgba(255,255,255,0.3)",
          }}
        >
          dailzero.com
        </div>
      </div>
    ),
    { ...size }
  )
}
