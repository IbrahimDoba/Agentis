"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import styles from "./page.module.css"
import { Input, Textarea, Select } from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import { useDashboardData } from "@/hooks/useDashboardData"
import { useTheme } from "@/components/ThemeProvider"
import { SunIcon, MoonIcon, ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline"
import { signOut } from "next-auth/react"

const BUSINESS_CATEGORIES = [
  { value: "Non-Online Gambling & Gaming (E.g. Brick and mortar)", label: "Non-Online Gambling & Gaming (E.g. Brick and mortar)" },
  { value: "Event Planning and Service", label: "Event Planning and Service" },
  { value: "Matrimonial Service", label: "Matrimonial Service" },
  { value: "Finance and Banking", label: "Finance and Banking" },
  { value: "Food and Grocery", label: "Food and Grocery" },
  { value: "Alcoholic Beverages", label: "Alcoholic Beverages" },
  { value: "Public Service", label: "Public Service" },
  { value: "Hotel and Lodging", label: "Hotel and Lodging" },
  { value: "Medical and Health", label: "Medical and Health" },
  { value: "Over-the-Counter Drugs", label: "Over-the-Counter Drugs" },
  { value: "Non-profit", label: "Non-profit" },
  { value: "Professional Services", label: "Professional Services" },
  { value: "Shopping and Retail", label: "Shopping and Retail" },
  { value: "Travel and Transportation", label: "Travel and Transportation" },
  { value: "Restaurant", label: "Restaurant" },
  { value: "Other", label: "Other" },
]

export default function ProfilePage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useDashboardData()
  const { theme, toggle } = useTheme()

  const [referralsEnabled, setReferralsEnabled] = useState(false)
  const [togglingReferrals, setTogglingReferrals] = useState(false)

  const [form, setForm] = useState({
    name: "",
    phone: "",
    businessName: "",
    businessCategory: "",
    businessDescription: "",
    businessAddress: "",
    businessEmail: "",
    businessWebsite: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (data?.user) {
      setReferralsEnabled(data.user.referralsEnabled ?? false)
    }
  }, [data?.user?.referralsEnabled])

  useEffect(() => {
    if (data?.user) {
      const u = data.user
      setForm({
        name: u.name ?? "",
        phone: u.phone ?? "",
        businessName: u.businessName ?? "",
        businessCategory: u.businessCategory ?? "",
        businessDescription: u.businessDescription ?? "",
        businessAddress: u.businessAddress ?? "",
        businessEmail: u.businessEmail ?? "",
        businessWebsite: u.businessWebsite ?? "",
      })
    }
  }, [data?.user])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: "" }))
  }

  const handleToggleReferrals = async (enabled: boolean) => {
    setReferralsEnabled(enabled)
    setTogglingReferrals(true)
    try {
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralsEnabled: enabled }),
      })
      queryClient.invalidateQueries({ queryKey: ["me"] })
    } catch {
      setReferralsEnabled(!enabled) // revert on failure
    } finally {
      setTogglingReferrals(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")
    setErrors({})

    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.errors) {
          setErrors(data.errors)
        } else {
          setError(data.error || "Failed to save profile")
        }
        return
      }

      setSuccess("Profile updated successfully!")
      queryClient.invalidateQueries({ queryKey: ["me"] })
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div style={{ height: 28, width: 160, background: "var(--border)", borderRadius: 6, marginBottom: 8 }} />
          <div style={{ height: 14, width: 260, background: "var(--border)", borderRadius: 6 }} />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Profile</h1>
        <p className={styles.subtitle}>Manage your personal and business information.</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        {/* Personal Information */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Personal Information</div>
            <div className={styles.sectionDesc}>Your name and contact details.</div>
          </div>
          <div className={styles.fields}>
            <div className={styles.row}>
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
                label="Phone Number"
                name="phone"
                type="tel"
                placeholder="+234 801 234 5678"
                value={form.phone}
                onChange={handleChange}
                error={errors.phone}
              />
            </div>
            <div>
              <Input
                label="Email Address"
                name="email"
                type="email"
                value={data?.user?.email ?? ""}
                disabled
              />
              <p className={styles.emailNote}>Email address cannot be changed.</p>
            </div>
          </div>
        </div>

        {/* Business Information */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Business Information</div>
            <div className={styles.sectionDesc}>Add some details about your business.</div>
          </div>
          <div className={styles.fields}>
            <div className={styles.row}>
              <Input
                label="Business Name"
                name="businessName"
                placeholder="Your Company Ltd"
                value={form.businessName}
                onChange={handleChange}
                error={errors.businessName}
                required
              />
              <Select
                label="Category"
                name="businessCategory"
                value={form.businessCategory}
                onChange={handleChange}
                error={errors.businessCategory}
                options={BUSINESS_CATEGORIES}
                placeholder="Select a category"
              />
            </div>

            <Textarea
              label="Description · Optional"
              name="businessDescription"
              placeholder="Briefly describe your business"
              value={form.businessDescription}
              onChange={handleChange}
              error={errors.businessDescription}
              maxLength={512}
              style={{ minHeight: 90 }}
              hint={`${form.businessDescription.length}/512`}
            />

            <Input
              label="Address · Optional"
              name="businessAddress"
              placeholder="Enter business address"
              value={form.businessAddress}
              onChange={handleChange}
              error={errors.businessAddress}
              maxLength={256}
            />

            <div className={styles.row}>
              <Input
                label="Email · Optional"
                name="businessEmail"
                type="email"
                placeholder="Enter business email"
                value={form.businessEmail}
                onChange={handleChange}
                error={errors.businessEmail}
                maxLength={128}
              />
              <Input
                label="Website · Optional"
                name="businessWebsite"
                type="url"
                placeholder="https://www.example.com"
                value={form.businessWebsite}
                onChange={handleChange}
                error={errors.businessWebsite}
                maxLength={256}
              />
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Appearance</div>
            <div className={styles.sectionDesc}>Choose how the dashboard looks to you.</div>
          </div>
          <div className={styles.themeOptions}>
            <button
              type="button"
              className={`${styles.themeOption} ${theme === "light" ? styles.themeOptionActive : ""}`}
              onClick={() => theme !== "light" && toggle()}
            >
              <SunIcon width={22} height={22} className={styles.themeOptionIcon} />
              <span className={styles.themeOptionLabel}>Light</span>
              <span className={styles.themeOptionDesc}>Clean white interface</span>
            </button>
            <button
              type="button"
              className={`${styles.themeOption} ${theme === "dark" ? styles.themeOptionActive : ""}`}
              onClick={() => theme !== "dark" && toggle()}
            >
              <MoonIcon width={22} height={22} className={styles.themeOptionIcon} />
              <span className={styles.themeOptionLabel}>Dark</span>
              <span className={styles.themeOptionDesc}>Easy on the eyes</span>
            </button>
          </div>
        </div>

        {/* Referral Program */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Referral Program</div>
            <div className={styles.sectionDesc}>Earn 15% commission for every paying customer you refer.</div>
          </div>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <div className={styles.toggleLabel}>
                {referralsEnabled ? "Referrals enabled" : "Enable referrals"}
              </div>
              <div className={styles.toggleDesc}>
                {referralsEnabled
                  ? "Your referral link is active and the Referrals tab is visible in your sidebar."
                  : "Turn this on to get your referral link and track your commissions."}
              </div>
            </div>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={referralsEnabled}
                disabled={togglingReferrals}
                onChange={(e) => handleToggleReferrals(e.target.checked)}
              />
              <span className={styles.toggleTrack} />
            </label>
          </div>
        </div>

        <div className={styles.actions}>
          <Button type="submit" loading={loading} size="lg">
            Save Changes
          </Button>
        </div>

        {/* Sign Out */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Sign Out</div>
            <div className={styles.sectionDesc}>Sign out of your account on this device.</div>
          </div>
          <button
            type="button"
            className={styles.signOutBtn}
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <ArrowRightStartOnRectangleIcon width={16} height={16} />
            Sign out
          </button>
        </div>
      </form>
    </div>
  )
}
