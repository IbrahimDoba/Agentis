"use client"
import { useState } from "react"
import Link from "next/link"
import { Mail, Clock, MessageSquare, ArrowRight, CheckCircle, Send, Calendar } from "lucide-react"
import { Navbar } from "@/components/landing/Navbar"
import styles from "./page.module.css"

const SUBJECTS = [
  "General Enquiry",
  "I want to get started",
  "Pricing & Plans",
  "Technical Support",
  "Partnership Opportunity",
  "Other",
]

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "", email: "", businessName: "", subject: "", message: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = "Name is required"
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Enter a valid email"
    if (!form.businessName.trim()) e.businessName = "Business name is required"
    if (!form.subject) e.subject = "Please select a subject"
    if (form.message.trim().length < 10) e.message = "Message must be at least 10 characters"
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      setSent(true)
    } catch {
      setErrors({ message: "Failed to send message. Please try again." })
    } finally {
      setLoading(false)
    }
  }

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => { const n = { ...e }; delete n[field]; return n })
  }

  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <div className={styles.inner}>

          {/* Header */}
          <div className={styles.header}>
            <div className={styles.badge}>Contact Us</div>
            <h1 className={styles.title}>
              Let&apos;s <span>start a conversation</span>
            </h1>
            <p className={styles.subtitle}>
              Have questions about D-Zero AI? Want to see it in action? Reach out and we&apos;ll get back to you within 24 hours.
            </p>
          </div>

          <div className={styles.grid}>
            {/* Left: info cards */}
            <div className={styles.infoCol}>
              <div className={styles.infoCard}>
                <div className={styles.infoIconWrap}><Mail size={20} /></div>
                <div>
                  <div className={styles.infoTitle}>Email</div>
                  <div className={styles.infoValue}>support@dailzero.com</div>
                  <div className={styles.infoSub}>For all enquiries</div>
                </div>
              </div>

              <div className={styles.infoCard}>
                <div className={styles.infoIconWrap}><Clock size={20} /></div>
                <div>
                  <div className={styles.infoTitle}>Response Time</div>
                  <div className={styles.infoValue}>Within 24 hours</div>
                  <div className={styles.infoSub}>Mon – Fri, 9am – 6pm WAT</div>
                </div>
              </div>

              <div className={styles.infoCard}>
                <div className={styles.infoIconWrap}><MessageSquare size={20} /></div>
                <div>
                  <div className={styles.infoTitle}>WhatsApp</div>
                  <div className={styles.infoValue}>Available on request</div>
                  <div className={styles.infoSub}>For approved clients only</div>
                </div>
              </div>

              <div className={styles.demoBanner}>
                <div className={styles.demoBannerTitle}>Want to see D-Zero AI in action?</div>
                <div className={styles.demoBannerText}>
                  Book a free 30-minute demo and watch an AI agent handle real customer conversations live.
                </div>
                <Link href="/pricing" className={styles.demoBannerBtn}>
                  <Calendar size={15} />
                  Book a Free Demo
                </Link>
              </div>
            </div>

            {/* Right: form */}
            <div className={styles.formCard}>
              {sent ? (
                <div className={styles.success}>
                  <div className={styles.successIcon}>
                    <CheckCircle size={30} />
                  </div>
                  <h2 className={styles.successTitle}>Message sent!</h2>
                  <p className={styles.successText}>
                    Thanks for reaching out. We&apos;ll review your message and get back to you within 24 hours.
                  </p>
                  <button className={styles.successBack} onClick={() => setSent(false)}>
                    Send another message <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className={styles.formTitle}>Send us a message</h2>
                  <p className={styles.formSubtitle}>Fill in the form below and we&apos;ll be in touch shortly.</p>

                  <form className={styles.form} onSubmit={handleSubmit} noValidate>
                    <div className={styles.row}>
                      <div className={styles.field}>
                        <label className={styles.label}>Full Name</label>
                        <input
                          className={styles.input}
                          placeholder="John Doe"
                          value={form.name}
                          onChange={e => update("name", e.target.value)}
                        />
                        {errors.name && <span className={styles.error}>{errors.name}</span>}
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Email Address</label>
                        <input
                          className={styles.input}
                          type="email"
                          placeholder="john@company.com"
                          value={form.email}
                          onChange={e => update("email", e.target.value)}
                        />
                        {errors.email && <span className={styles.error}>{errors.email}</span>}
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Business Name</label>
                      <input
                        className={styles.input}
                        placeholder="Your company or brand name"
                        value={form.businessName}
                        onChange={e => update("businessName", e.target.value)}
                      />
                      {errors.businessName && <span className={styles.error}>{errors.businessName}</span>}
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Subject</label>
                      <select
                        className={styles.select}
                        value={form.subject}
                        onChange={e => update("subject", e.target.value)}
                      >
                        <option value="">Select a subject…</option>
                        {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {errors.subject && <span className={styles.error}>{errors.subject}</span>}
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Message</label>
                      <textarea
                        className={styles.textarea}
                        placeholder="Tell us about your business and what you're looking for…"
                        value={form.message}
                        onChange={e => update("message", e.target.value)}
                      />
                      {errors.message && <span className={styles.error}>{errors.message}</span>}
                    </div>

                    <button type="submit" className={styles.submitBtn} disabled={loading}>
                      {loading ? "Sending…" : <><Send size={16} /> Send Message</>}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
