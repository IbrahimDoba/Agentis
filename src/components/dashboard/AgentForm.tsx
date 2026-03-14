"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import styles from "./AgentForm.module.css"
import { Input, Textarea } from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import type { AgentPublic } from "@/types"

interface AgentFormProps {
  initialData?: Partial<AgentPublic>
  agentId?: string
}

export function AgentForm({ initialData, agentId }: AgentFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    businessName: initialData?.businessName ?? "",
    businessDescription: initialData?.businessDescription ?? "",
    productsServices: initialData?.productsServices ?? "",
    faqs: initialData?.faqs ?? "",
    operatingHours: initialData?.operatingHours ?? "",
    websiteLinks: initialData?.websiteLinks ?? "",
    responseGuidelines: initialData?.responseGuidelines ?? "",
    whatsappBusinessName: initialData?.whatsappBusinessName ?? "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [enhanced, setEnhanced] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: "" }))
  }

  const handleEnhance = async () => {
    if (!form.businessDescription || form.businessDescription.length < 20) {
      setError("Please fill in the business description first (min 20 chars)")
      return
    }
    setEnhancing(true)
    setError("")
    try {
      const res = await fetch("/api/agents/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          businessDescription: form.businessDescription,
          productsServices: form.productsServices,
          faqs: form.faqs,
          operatingHours: form.operatingHours,
          responseGuidelines: form.responseGuidelines,
        }),
      })

      if (!res.ok) throw new Error("Enhancement failed")

      const data = await res.json()
      setForm((f) => ({ ...f, responseGuidelines: data.instructions }))
      setEnhanced(true)
    } catch {
      setError("Failed to enhance with AI. Please try again.")
    } finally {
      setEnhancing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")
    setErrors({})

    try {
      const url = agentId ? `/api/agents/${agentId}` : "/api/agents"
      const method = agentId ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.errors) {
          setErrors(data.errors)
        } else {
          setError(data.error || "Failed to save agent")
        }
        return
      }

      setSuccess(agentId ? "Agent updated successfully!" : "Agent created! Our team will review and set it up.")
      // Invalidate cached agent/dashboard data so they reflect changes on next visit
      queryClient.invalidateQueries({ queryKey: ["me"] })
      if (!agentId) {
        router.push(`/dashboard/agent/${data.id}`)
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {/* Business Info */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Business Information</div>
          <div className={styles.sectionDesc}>Tell us about your business so the AI agent can represent you accurately.</div>
        </div>
        <div className={styles.fields}>
          <div className={styles.row}>
            <Input
              label="Business Name"
              name="businessName"
              placeholder="e.g. TechStore Nigeria"
              value={form.businessName}
              onChange={handleChange}
              error={errors.businessName}
              required
            />
            <Input
              label="WhatsApp Business Name (optional)"
              name="whatsappBusinessName"
              placeholder="Name on WhatsApp profile"
              value={form.whatsappBusinessName}
              onChange={handleChange}
              error={errors.whatsappBusinessName}
            />
          </div>

          <Textarea
            label="Business Description"
            name="businessDescription"
            placeholder="Describe your business — what you do, your mission, your target customers..."
            value={form.businessDescription}
            onChange={handleChange}
            error={errors.businessDescription}
            required
            style={{ minHeight: 120 }}
          />

          <Textarea
            label="Products & Services"
            name="productsServices"
            placeholder="List your main products and services with key details, pricing ranges, etc."
            value={form.productsServices}
            onChange={handleChange}
            error={errors.productsServices}
            required
            style={{ minHeight: 100 }}
          />
        </div>
      </div>

      {/* FAQs and Hours */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>FAQs & Operating Hours</div>
          <div className={styles.sectionDesc}>Common questions your customers ask and when you&apos;re available.</div>
        </div>
        <div className={styles.fields}>
          <Textarea
            label="Frequently Asked Questions"
            name="faqs"
            placeholder="Q: What are your delivery times? A: We deliver within 2-3 business days..."
            value={form.faqs}
            onChange={handleChange}
            error={errors.faqs}
            required
            style={{ minHeight: 140 }}
          />

          <Input
            label="Operating Hours"
            name="operatingHours"
            placeholder="e.g. Monday–Friday 9am–6pm, Saturday 10am–4pm"
            value={form.operatingHours}
            onChange={handleChange}
            error={errors.operatingHours}
            required
          />

          <Input
            label="Website Links (optional)"
            name="websiteLinks"
            placeholder="https://yourwebsite.com, https://yourshop.com"
            value={form.websiteLinks}
            onChange={handleChange}
            error={errors.websiteLinks}
          />
        </div>
      </div>

      {/* AI Enhancement */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Response Guidelines</div>
          <div className={styles.sectionDesc}>
            Define how your agent should respond. Use our AI to generate optimized instructions automatically.
          </div>
        </div>

        <div className={styles.fields}>
          <div className={styles.enhanceBar}>
            <div className={styles.enhanceInfo}>
              <span className={styles.enhanceIcon}>✨</span>
              <div>
                <div className={styles.enhanceTitle}>AI Enhancement</div>
                <div className={styles.enhanceDesc}>
                  Let GPT-4o mini generate professional agent instructions based on your business info.
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleEnhance}
              loading={enhancing}
            >
              Enhance with AI
            </Button>
          </div>

          {enhanced && (
            <div className={styles.enhancedBadge}>
              ✓ AI Enhanced
            </div>
          )}

          <Textarea
            label="Response Guidelines"
            name="responseGuidelines"
            placeholder="Be friendly and professional. Always greet customers by name. Escalate complaints to a human agent..."
            value={form.responseGuidelines}
            onChange={handleChange}
            error={errors.responseGuidelines}
            style={{ minHeight: 160 }}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" loading={loading} size="lg">
          {agentId ? "Save Changes" : "Create Agent →"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default AgentForm
