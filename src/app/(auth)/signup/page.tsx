"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./page.module.css"
import { Input } from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import { signupSchema } from "@/lib/validations"

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [refCode, setRefCode] = useState<string | null>(null)

  useEffect(() => {
    const ref = searchParams.get("ref")
    if (ref) setRefCode(ref)
  }, [searchParams])

  const [form, setForm] = useState({
    name: "",
    email: "",
    businessName: "",
    phone: "",
    password: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [agreeError, setAgreeError] = useState("")

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: "" }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Client-side validation
    const parsed = signupSchema.safeParse(form)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0] as string
        if (!fieldErrors[field]) fieldErrors[field] = issue.message
      })
      setErrors(fieldErrors)
      return
    }
    if (!agreed) {
      setAgreeError("You must agree to the Terms & Conditions to continue.")
      return
    }
    setAgreeError("")
    setErrors({})
    setLoading(true)

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(refCode ? { refCode } : {}) }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.errors) {
          setErrors(data.errors)
        } else {
          setError(data.error || "Something went wrong")
        }
        return
      }

      // Store password briefly so verify page can auto sign-in after verification
      sessionStorage.setItem("__signup_pw", form.password)
      router.push(`/verify-email?email=${encodeURIComponent(form.email)}`)
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
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.subtitle}>Start automating your WhatsApp customer support</p>
        {refCode && (
          <div style={{ background: "var(--accent-light)", border: "1px solid var(--accent)", borderRadius: "var(--radius-md)", padding: "0.6rem 0.9rem", fontSize: "13px", color: "var(--accent)", fontWeight: 600, marginBottom: "0.5rem" }}>
            🎉 You were invited — you&apos;re signing up with a referral link.
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}

          <Input
            label="Full Name"
            name="name"
            placeholder="John Doe"
            value={form.name}
            onChange={handleChange}
            error={errors.name}
            required
          />

          <Input
            label="Business Name"
            name="businessName"
            placeholder="Your Company Ltd"
            value={form.businessName}
            onChange={handleChange}
            error={errors.businessName}
            required
          />

          <div className={styles.fieldWithTooltip}>
            <Input
              label="WhatsApp Phone Number"
              name="phone"
              type="tel"
              placeholder="+234 800 000 0000"
              value={form.phone}
              onChange={handleChange}
              error={errors.phone}
              autoComplete="tel"
            />
            <p className={styles.tooltip}>
              📞 We&apos;ll use this number to confirm and activate your AI agent on WhatsApp.
            </p>
          </div>

          <Input
            label="Email Address"
            name="email"
            type="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={handleChange}
            error={errors.email}
            required
            autoComplete="email"
          />

          <Input
            label="Password"
            name="password"
            type="password"
            placeholder="At least 8 characters"
            value={form.password}
            onChange={handleChange}
            error={errors.password}
            required
            autoComplete="new-password"
          />

          <div className={styles.checkboxWrapper}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked)
                  if (e.target.checked) setAgreeError("")
                }}
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" className={styles.link} target="_blank">
                  Terms &amp; Conditions
                </Link>
              </span>
            </label>
            {agreeError && <p className={styles.agreeError}>{agreeError}</p>}
          </div>

          <Button type="submit" fullWidth loading={loading}>
            Create Account
          </Button>
        </form>

        <div className={styles.footer}>
          Already have an account?{" "}
          <Link href="/login" className={styles.link}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
