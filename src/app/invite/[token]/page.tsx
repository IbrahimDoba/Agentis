"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { LogoIcon } from "@/components/landing/Logo"
import Link from "next/link"
import styles from "./page.module.css"

interface InviteInfo {
  email: string
  role: string
  ownerName: string
  ownerBusiness: string
  isExistingUser: boolean
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else setInvite(data)
      })
      .catch(() => setError("Failed to load invite"))
      .finally(() => setLoading(false))
  }, [token])

  async function handleAccept() {
    if (!invite) return
    setSubmitting(true)
    setFieldErrors({})

    if (!invite.isExistingUser) {
      const errs: Record<string, string> = {}
      if (!name.trim()) errs.name = "Name is required"
      if (!password) errs.password = "Password is required"
      else if (password.length < 8) errs.password = "At least 8 characters"
      if (Object.keys(errs).length) { setFieldErrors(errs); setSubmitting(false); return }
    }

    try {
      const res = await fetch(`/api/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      })
      const data = await res.json()

      if (!res.ok) { setError(data.error || "Something went wrong"); setSubmitting(false); return }

      // Switch into the invited workspace immediately
      await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: data.workspaceId }),
      })

      if (data.alreadyLoggedIn) {
        router.push("/dashboard")
        return
      }

      // Sign them in
      const result = await signIn("credentials", {
        email: invite.email,
        password,
        redirect: false,
      })

      if (result?.error) {
        // Existing user — they need to sign in manually
        router.push(`/login?invited=1`)
      } else {
        router.push("/dashboard")
      }
    } catch {
      setError("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.loading}>Loading invite...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Link href="/" className={styles.logo}><LogoIcon size={30} /> D-Zero AI</Link>
        <div className={styles.card}>
          <div className={styles.errorIcon}>⚠️</div>
          <h1 className={styles.title}>Invite unavailable</h1>
          <p className={styles.subtitle}>{error}</p>
          <Link href="/login" className={styles.btn}>Go to Login</Link>
        </div>
      </div>
    )
  }

  if (!invite) return null

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.logo}><LogoIcon size={30} /> D-Zero AI</Link>

      <div className={styles.card}>
        <div className={styles.workspaceBadge}>
          <span className={styles.workspaceDot} />
          {invite.ownerBusiness}
        </div>

        <h1 className={styles.title}>You&apos;re invited</h1>
        <p className={styles.subtitle}>
          <strong>{invite.ownerName}</strong> has invited you to join their workspace as a{" "}
          <span className={styles.roleBadge}>{invite.role === "ADMIN" ? "Admin" : "Member"}</span>
        </p>

        <div className={styles.emailRow}>
          <span className={styles.emailLabel}>Invite sent to</span>
          <span className={styles.emailValue}>{invite.email}</span>
        </div>

        {!invite.isExistingUser && (
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label}>Your name</label>
              <input
                className={`${styles.input} ${fieldErrors.name ? styles.inputError : ""}`}
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {fieldErrors.name && <span className={styles.fieldError}>{fieldErrors.name}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Create a password</label>
              <input
                className={`${styles.input} ${fieldErrors.password ? styles.inputError : ""}`}
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {fieldErrors.password && <span className={styles.fieldError}>{fieldErrors.password}</span>}
            </div>
          </div>
        )}

        {invite.isExistingUser && (
          <p className={styles.existingNote}>
            You already have a D-Zero AI account. Click below to accept the invite.
          </p>
        )}

        <button
          className={styles.btn}
          onClick={handleAccept}
          disabled={submitting}
        >
          {submitting ? "Accepting..." : "Accept Invite"}
        </button>

        <p className={styles.footer}>
          By accepting, you agree to the{" "}
          <Link href="/terms" className={styles.link}>Terms of Service</Link>
        </p>
      </div>
    </div>
  )
}
