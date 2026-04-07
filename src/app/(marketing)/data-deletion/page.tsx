"use client"

import { useState } from "react"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import { TrashIcon, CheckCircleIcon, ShieldCheckIcon, ClockIcon, DocumentTextIcon, UserIcon } from "@heroicons/react/24/outline"
import styles from "./page.module.css"

const REQUEST_TYPES = [
  { value: "full_account", label: "Delete my entire account and all associated data" },
  { value: "conversation_data", label: "Delete WhatsApp conversation data only" },
  { value: "business_data", label: "Delete my business configuration and profile data" },
  { value: "all_personal", label: "Delete all personal data (retain anonymised analytics)" },
]

function generateRef() {
  return "DDR-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase()
}

export default function DataDeletionPage() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    requestType: "",
    additionalInfo: "",
    confirmed: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [ref, setRef] = useState("")

  function validate() {
    const e: Record<string, string> = {}
    if (!form.fullName.trim()) e.fullName = "Full name is required"
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Enter a valid email address"
    if (!form.requestType) e.requestType = "Please select the type of data to delete"
    if (!form.confirmed) e.confirmed = "You must confirm this request before submitting"
    return e
  }

  function update(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => { const n = { ...e }; delete n[field]; return n })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    const refCode = generateRef()
    try {
      await fetch("/api/data-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ref: refCode }),
      })
      setRef(refCode)
      setSubmitted(true)
    } catch {
      setErrors({ form: "Something went wrong. Please try again or email us directly at support@dailzero.com." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <div className={styles.hero}>
          <div className={styles.badge}>
            <ShieldCheckIcon width={14} height={14} />
            Privacy & Data Rights
          </div>
          <h1 className={styles.title}>Request Data Deletion</h1>
          <p className={styles.subtitle}>
            You have the right to request deletion of your personal data. Submit your request below
            and we will process it within <strong>30 days</strong>.
          </p>
        </div>

        <div className={styles.inner}>
          {/* Info cards */}
          <div className={styles.infoRow}>
            <div className={styles.infoCard}>
              <div className={styles.infoIcon}><ClockIcon width={18} height={18} /></div>
              <div className={styles.infoTitle}>30-Day Processing</div>
              <p className={styles.infoText}>We process all deletion requests within 30 days of verification.</p>
            </div>
            <div className={styles.infoCard}>
              <div className={styles.infoIcon}><DocumentTextIcon width={18} height={18} /></div>
              <div className={styles.infoText2}>Reference Number</div>
              <p className={styles.infoText}>You&apos;ll receive a reference number to track your request status.</p>
            </div>
            <div className={styles.infoCard}>
              <div className={styles.infoIcon}><UserIcon width={18} height={18} /></div>
              <div className={styles.infoTitle}>Verification Required</div>
              <p className={styles.infoText}>We may contact you to verify your identity before processing.</p>
            </div>
          </div>

          <div className={styles.grid}>
            {/* What gets deleted */}
            <aside className={styles.sidebar}>
              <div className={styles.sideCard}>
                <h3 className={styles.sideTitle}>What we delete</h3>
                <ul className={styles.sideList}>
                  <li>Account credentials and profile information</li>
                  <li>Business configuration and agent settings</li>
                  <li>WhatsApp conversation transcripts and metadata</li>
                  <li>AI-generated conversation summaries</li>
                  <li>Payment history and billing records (subject to legal retention requirements)</li>
                  <li>All personal data tied to your account</li>
                </ul>
              </div>

              <div className={styles.sideCard}>
                <h3 className={styles.sideTitle}>What we may retain</h3>
                <ul className={styles.sideList}>
                  <li>Financial records required by Nigerian law (up to 7 years)</li>
                  <li>Anonymised, non-identifiable analytics data</li>
                  <li>Records of your deletion request itself</li>
                  <li>Data Meta/WhatsApp independently retains under their own policies</li>
                </ul>
                <p className={styles.sideNote}>
                  Data held by Meta (WhatsApp) must be requested separately via{" "}
                  <a href="https://www.facebook.com/help/contact/540977946302970" target="_blank" rel="noopener noreferrer">
                    Meta&apos;s privacy portal
                  </a>.
                </p>
              </div>

              <div className={styles.sideCard}>
                <h3 className={styles.sideTitle}>Need help?</h3>
                <p className={styles.sideNote}>
                  You can also email us directly at{" "}
                  <a href="mailto:support@dailzero.com">support@dailzero.com</a>{" "}
                  with the subject line <em>&quot;Data Deletion Request&quot;</em>.
                </p>
              </div>
            </aside>

            {/* Form */}
            <div className={styles.formCard}>
              {submitted ? (
                <div className={styles.success}>
                  <div className={styles.successIconWrap}>
                    <CheckCircleIcon width={36} height={36} />
                  </div>
                  <h2 className={styles.successTitle}>Request Submitted</h2>
                  <p className={styles.successText}>
                    Your data deletion request has been received. We will verify your identity and
                    process the deletion within <strong>30 days</strong>. You will receive a
                    confirmation email at <strong>{form.email}</strong>.
                  </p>
                  <div className={styles.refBox}>
                    <span className={styles.refLabel}>Your reference number</span>
                    <span className={styles.refCode}>{ref}</span>
                    <span className={styles.refNote}>Save this number to follow up on your request.</span>
                  </div>
                  <button className={styles.newRequest} onClick={() => {
                    setSubmitted(false)
                    setForm({ fullName: "", email: "", phone: "", requestType: "", additionalInfo: "", confirmed: false })
                    setRef("")
                  }}>
                    Submit another request
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.formHeader}>
                    <TrashIcon width={20} height={20} className={styles.formIcon} />
                    <div>
                      <h2 className={styles.formTitle}>Data Deletion Request Form</h2>
                      <p className={styles.formSubtitle}>All fields marked * are required.</p>
                    </div>
                  </div>

                  {errors.form && <div className={styles.formError}>{errors.form}</div>}

                  <form onSubmit={handleSubmit} noValidate className={styles.form}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label className={styles.label}>Full Name *</label>
                        <input
                          className={`${styles.input} ${errors.fullName ? styles.inputError : ""}`}
                          placeholder="Your full name"
                          value={form.fullName}
                          onChange={e => update("fullName", e.target.value)}
                        />
                        {errors.fullName && <span className={styles.error}>{errors.fullName}</span>}
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Email Address *</label>
                        <input
                          className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
                          type="email"
                          placeholder="The email linked to your account"
                          value={form.email}
                          onChange={e => update("email", e.target.value)}
                        />
                        {errors.email && <span className={styles.error}>{errors.email}</span>}
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>
                        WhatsApp Phone Number{" "}
                        <span className={styles.optional}>(optional — for end users who interacted via WhatsApp)</span>
                      </label>
                      <input
                        className={styles.input}
                        type="tel"
                        placeholder="+234 800 000 0000"
                        value={form.phone}
                        onChange={e => update("phone", e.target.value)}
                      />
                      <span className={styles.hint}>
                        If you messaged a business using D-Zero AI on WhatsApp and want your conversation data deleted, provide the phone number you used.
                      </span>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Type of Deletion Request *</label>
                      {REQUEST_TYPES.map(rt => (
                        <label key={rt.value} className={styles.radioLabel}>
                          <input
                            type="radio"
                            name="requestType"
                            value={rt.value}
                            checked={form.requestType === rt.value}
                            onChange={e => update("requestType", e.target.value)}
                            className={styles.radio}
                          />
                          <span>{rt.label}</span>
                        </label>
                      ))}
                      {errors.requestType && <span className={styles.error}>{errors.requestType}</span>}
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>
                        Additional Information{" "}
                        <span className={styles.optional}>(optional)</span>
                      </label>
                      <textarea
                        className={styles.textarea}
                        placeholder="Any specific details about the data you want deleted, or context that would help us process your request..."
                        value={form.additionalInfo}
                        onChange={e => update("additionalInfo", e.target.value)}
                        rows={4}
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={`${styles.checkLabel} ${errors.confirmed ? styles.checkLabelError : ""}`}>
                        <input
                          type="checkbox"
                          checked={form.confirmed}
                          onChange={e => update("confirmed", e.target.checked)}
                          className={styles.checkbox}
                        />
                        <span>
                          I confirm that I am the account holder or an authorised representative, and I understand that
                          this action is <strong>irreversible</strong>. Deleted data cannot be recovered.
                        </span>
                      </label>
                      {errors.confirmed && <span className={styles.error}>{errors.confirmed}</span>}
                    </div>

                    <button type="submit" className={styles.submitBtn} disabled={loading}>
                      {loading ? (
                        <span className={styles.spinner} />
                      ) : (
                        <><TrashIcon width={16} height={16} /> Submit Deletion Request</>
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
