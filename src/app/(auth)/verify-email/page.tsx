"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./page.module.css"
import Button from "@/components/ui/Button"

const CODE_LENGTH = 4

function VerifyEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get("email") ?? ""

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""))
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!email) router.replace("/signup")
    inputRefs.current[0]?.focus()
  }, [email, router])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const handleDigitChange = (index: number, value: string) => {
    // Allow paste of full code
    if (value.length > 1) {
      const clean = value.replace(/\D/g, "").slice(0, CODE_LENGTH)
      const next = Array(CODE_LENGTH).fill("")
      clean.split("").forEach((ch, i) => { next[i] = ch })
      setDigits(next)
      const focusIdx = Math.min(clean.length, CODE_LENGTH - 1)
      inputRefs.current[focusIdx]?.focus()
      if (clean.length === CODE_LENGTH) submitCode(next)
      return
    }

    if (value && !/^\d$/.test(value)) return
    const next = [...digits]
    next[index] = value
    setDigits(next)
    setError("")

    if (value && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
    if (next.every((d) => d !== "")) {
      submitCode(next)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const submitCode = async (codeDigits: string[]) => {
    const code = codeDigits.join("")
    if (code.length < CODE_LENGTH) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Invalid code. Please try again.")
        setDigits(Array(CODE_LENGTH).fill(""))
        inputRefs.current[0]?.focus()
        return
      }

      // Auto sign-in — retrieve stored password
      const storedPassword = sessionStorage.getItem("__signup_pw")
      sessionStorage.removeItem("__signup_pw")

      if (storedPassword) {
        const result = await signIn("credentials", {
          email,
          password: storedPassword,
          redirect: false,
        })
        if (!result?.error) {
          router.push("/dashboard")
          router.refresh()
          return
        }
      }
      // Fallback — redirect to login with success message
      router.push("/login?verified=1")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    setResending(true)
    setError("")
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to resend code")
        return
      }
      setResendCooldown(60)
      setDigits(Array(CODE_LENGTH).fill(""))
      inputRefs.current[0]?.focus()
    } catch {
      setError("Failed to resend code. Please try again.")
    } finally {
      setResending(false)
    }
  }

  const maskedEmail = email
    ? email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 4)) + c)
    : ""

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.logo}>
        <LogoIcon size={32} />
        D-Zero AI
      </Link>

      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <div className={styles.icon}>✉️</div>
        </div>
        <h1 className={styles.title}>Check your email</h1>
        <p className={styles.subtitle}>
          We sent a 4-digit verification code to<br />
          <strong>{maskedEmail}</strong>
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.codeRow}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              className={`${styles.digitInput} ${error ? styles.digitError : ""}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={CODE_LENGTH} // allows paste
              value={digits[i]}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              autoComplete="one-time-code"
              disabled={loading}
            />
          ))}
        </div>

        {loading && (
          <div className={styles.verifying}>
            <span className={styles.spinner} />
            Verifying…
          </div>
        )}

        <div className={styles.resendRow}>
          <span className={styles.resendText}>Didn&apos;t receive it?</span>
          <button
            className={styles.resendBtn}
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
          >
            {resending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
          </button>
        </div>

        <div className={styles.footer}>
          Wrong email?{" "}
          <Link href="/signup" className={styles.link}>Go back</Link>
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div />}>
      <VerifyEmailForm />
    </Suspense>
  )
}
