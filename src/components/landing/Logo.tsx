import { useId } from "react"

export function LogoIcon({ size = 36 }: { size?: number }) {
  const uid = useId().replace(/:/g, "")
  const bg = `logoGradBg_${uid}`
  const stroke = `logoGradStroke_${uid}`
  const glow = `logoGlow_${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f1e15" />
          <stop offset="100%" stopColor="#162b1c" />
        </linearGradient>
        <linearGradient id={stroke} x1="12" y1="11" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00dc82" />
          <stop offset="100%" stopColor="#00c8b4" />
        </linearGradient>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background rounded square */}
      <rect width="48" height="48" rx="13" fill={`url(#${bg})`} />
      <rect width="48" height="48" rx="13" fill="none" stroke="#00dc82" strokeWidth="1" strokeOpacity="0.25" />

      {/* Geometric "A" — two legs + crossbar */}
      <g stroke={`url(#${stroke})`} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="37" x2="24" y2="12" />
        <line x1="24" y1="12" x2="36" y2="37" />
        <line x1="18" y1="27" x2="30" y2="27" />
      </g>

      {/* Glowing dot at crossbar center — the AI mark */}
      <circle cx="24" cy="27" r="3.8" fill="#00dc82" filter={`url(#${glow})`} />
      <circle cx="24" cy="27" r="2.2" fill="#0f1e15" />
      <circle cx="24" cy="27" r="1.1" fill="#00dc82" />
    </svg>
  )
}
