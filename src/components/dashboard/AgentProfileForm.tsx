"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Camera, Loader2, CheckCircle, Globe, Mail, Phone, MapPin, Tag, Info } from "lucide-react"
import styles from "./AgentProfileForm.module.css"
import { Input, Textarea } from "@/components/ui/Input"
import Button from "@/components/ui/Button"
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
}

export function AgentProfileForm({ agent }: AgentProfileFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    businessName: agent.businessName ?? "",
    category: agent.category ?? "",
    businessDescription: agent.businessDescription ?? "",
    address: agent.address ?? "",
    contactEmail: agent.contactEmail ?? "",
    contactPhone: agent.contactPhone ?? "",
    websiteLinks: agent.websiteLinks ?? "",
    profileImageUrl: agent.profileImageUrl ?? "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>(agent.profileImageUrl ?? "")

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
    setSuccess(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
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
        return
      }
      setSuccess(true)
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      router.refresh()
    } catch {
      setErrors({ form: "Something went wrong. Please try again." })
    } finally {
      setSaving(false)
    }
  }

  const initials = form.businessName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {/* Info banner */}
      <div className={styles.infoBanner}>
        <Info size={15} className={styles.infoIcon} />
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
              <Loader2 size={20} className={styles.uploadSpinner} />
            ) : (
              <Camera size={20} />
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
      {success && (
        <div className={styles.successMsg}>
          <CheckCircle size={15} /> Profile updated successfully
        </div>
      )}

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
                <Tag size={13} /> Category
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

      {/* Contact */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Contact &amp; Location</div>
        <div className={styles.fields}>
          <div className={styles.row}>
            <div className={styles.iconField}>
              <Mail size={14} className={styles.fieldIcon} />
              <Input
                label="Contact Email"
                name="contactEmail"
                type="email"
                placeholder="hello@yourbusiness.com"
                value={form.contactEmail}
                onChange={handleChange}
                error={errors.contactEmail}
              />
            </div>
            <div className={styles.iconField}>
              <Phone size={14} className={styles.fieldIcon} />
              <Input
                label="Contact Phone"
                name="contactPhone"
                type="tel"
                placeholder="+234 800 000 0000"
                value={form.contactPhone}
                onChange={handleChange}
                error={errors.contactPhone}
              />
            </div>
          </div>
          <div className={styles.iconField}>
            <Globe size={14} className={styles.fieldIcon} />
            <Input
              label="Website"
              name="websiteLinks"
              placeholder="https://yourbusiness.com"
              value={form.websiteLinks}
              onChange={handleChange}
              error={errors.websiteLinks}
            />
          </div>
          <div className={styles.iconField}>
            <MapPin size={14} className={styles.fieldIcon} />
            <Input
              label="Business Address"
              name="address"
              placeholder="123 Main Street, Lagos, Nigeria"
              value={form.address}
              onChange={handleChange}
              error={errors.address}
            />
          </div>
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
