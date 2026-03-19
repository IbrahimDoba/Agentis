"use client"

import { useState } from "react"
import Link from "next/link"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./page.module.css"
import { Input } from "@/components/ui/Input"
import Button from "@/components/ui/Button"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Something went wrong. Please try again.")
        return
      }

      setSubmitted(true)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.logo}>
        <LogoIcon size={32} />
        D-Zero AI
      </Link>

      <div className={styles.card}>
        {submitted ? (
          <>
            <div className={styles.successIcon}>✉️</div>
            <h1 className={styles.title}>Check your email</h1>
            <p className={styles.subtitle}>
              If an account exists for <strong>{email}</strong>, you'll receive a password
              reset link shortly.
            </p>
            <div className={styles.footer}>
              <Link href="/login" className={styles.link}>
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Forgot your password?</h1>
            <p className={styles.subtitle}>
              Enter your email and we'll send you a link to reset your password.
            </p>

            <form className={styles.form} onSubmit={handleSubmit}>
              {error && <div className={styles.error}>{error}</div>}

              <Input
                label="Email"
                name="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <Button type="submit" fullWidth loading={loading}>
                Send Reset Link
              </Button>
            </form>

            <div className={styles.footer}>
              <Link href="/login" className={styles.link}>
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
