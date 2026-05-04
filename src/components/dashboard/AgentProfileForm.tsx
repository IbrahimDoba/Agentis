"use client"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { CameraIcon, ArrowPathIcon, TagIcon, InformationCircleIcon } from "@heroicons/react/24/outline"
import styles from "./AgentProfileForm.module.css"
import { Input, Textarea } from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import { useToast } from "@/context/ToastContext"
import type { AgentPublic } from "@/types"

const CATEGORIES = [
  "E-commerce & Retail",
  "Food & Restaurant",
  "Healthcare & Wellness",
  "Education & Training",
  "Finance & Insurance",
  "Real Estate",
  "Logistics & Delivery",
  "Fashion & Beauty",
  "Technology & Software",
  "Travel & Hospitality",
  "Legal Services",
  "Automotive",
  "Events & Entertainment",
  "Construction & Home Services",
  "Other",
]

interface AgentProfileFormProps {
  agent: AgentPublic
  onDirtyChange?: (dirty: boolean) => void
}

export function AgentProfileForm({ agent, onDirtyChange }: AgentProfileFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const initialForm = {
    businessName: agent.businessName ?? "",
    category: agent.category ?? "",
    businessDescription: agent.businessDescription ?? "",
    profileImageUrl: agent.profileImageUrl ?? "",
  }
  const [form, setForm] = useState(initialForm)
  const { showToast } = useToast()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>(agent.profileImageUrl ?? "")

  const isDirty = (Object.keys(initialForm) as (keyof typeof initialForm)[])
    .some((k) => form[k] !== initialForm[k])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewUrl(URL.createObjectURL(file))
    setIsUploading(true)
    setUploadError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      setPreviewUrl(data.url)
      setForm((f) => ({ ...f, profileImageUrl: data.url }))
    } catch {
      setUploadError("Failed to upload image. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: "" }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.errors) setErrors(data.errors)
        else showToast("Failed to save profile.", "error")
        return
      }
      showToast("Profile updated successfully!")
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      router.refresh()
    } catch {
      showToast("Something went wrong. Please try again.", "error")
    } finally {
      setSaving(false)
    }
  }

  const initials = form.businessName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {/* Info banner */}
      <div className={styles.infoBanner}>
        <InformationCircleIcon width={15} height={15} className={styles.infoIcon} />
        <span>This information will be shown on your agent&apos;s WhatsApp Business profile, visible to customers who message you.</span>
      </div>

      {/* Profile Picture */}
      <div className={styles.avatarSection}>
        <div className={styles.avatarWrap} onClick={() => !isUploading && fileInputRef.current?.click()}>
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="Profile"
              width={96}
              height={96}
              className={styles.avatarImg}
            />
          ) : (
            <div className={styles.avatarFallback}>
              {initials || "AI"}
            </div>
          )}
          <div className={styles.avatarOverlay}>
            {isUploading ? (
              <ArrowPathIcon width={20} height={20} className={styles.uploadSpinner} />
            ) : (
              <CameraIcon width={20} height={20} />
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          onChange={handleFileChange}
          disabled={isUploading}
        />
        <div className={styles.avatarInfo}>
          <div className={styles.avatarLabel}>Profile Photo</div>
          <div className={styles.avatarHint}>
            {isUploading ? "Uploading…" : "Click to upload · JPG, PNG, WebP · Max 4MB"}
          </div>
          {uploadError && <div className={styles.uploadError}>{uploadError}</div>}
        </div>
      </div>

      {errors.form && <div className={styles.formError}>{errors.form}</div>}

      {/* Identity */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Identity</div>
        <div className={styles.fields}>
          <div className={styles.row}>
            <Input
              label="Business Name"
              name="businessName"
              value={form.businessName}
              onChange={handleChange}
              error={errors.businessName}
              required
            />
            <div className={styles.selectWrap}>
              <label className={styles.selectLabel}>
                <TagIcon width={13} height={13} /> Category
              </label>
              <select
                name="category"
                className={styles.select}
                value={form.category}
                onChange={handleChange}
              >
                <option value="">Select a category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <Textarea
            label="Description"
            name="businessDescription"
            placeholder="What does your business do?"
            value={form.businessDescription}
            onChange={handleChange}
            error={errors.businessDescription}
            style={{ minHeight: 100 }}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" loading={saving || isUploading}>
          Save Profile
        </Button>
      </div>
    </form>
  )
}

export default AgentProfileForm
