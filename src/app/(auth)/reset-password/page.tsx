"use client"

import { useState, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./page.module.css"
import { Input } from "@/components/ui/Input"
import Button from "@/components/ui/Button"

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  if (!token) {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>Invalid link</h1>
        <p className={styles.subtitle}>This reset link is missing or invalid.</p>
        <div className={styles.footer}>
          <Link href="/forgot-password" className={styles.link}>Request a new link</Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.")
        return
      }

      setSuccess(true)
      setTimeout(() => router.push("/login"), 3000)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className={styles.card}>
        <div className={styles.successIcon}>✅</div>
        <h1 className={styles.title}>Password updated!</h1>
        <p className={styles.subtitle}>
          Your password has been reset successfully. Redirecting you to sign in...
        </p>
        <div className={styles.footer}>
          <Link href="/login" className={styles.link}>Go to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Set a new password</h1>
      <p className={styles.subtitle}>Choose a strong password for your account.</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.error}>{error}</div>}

        <Input
          label="New Password"
          name="password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />

        <Input
          label="Confirm Password"
          name="confirm"
          type="password"
          placeholder="Repeat your new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />

        <Button type="submit" fullWidth loading={loading}>
          Reset Password
        </Button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className={styles.container}>
      <Link href="/" className={styles.logo}>
        <LogoIcon size={32} />
        D-Zero AI
      </Link>
      <Suspense fallback={<div />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
