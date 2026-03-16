"use client"

import { useState } from "react"
import styles from "./DemoForm.module.css"
import { Input } from "@/components/ui/Input"
import Button from "@/components/ui/Button"

export function DemoForm() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    name: "",
    email: "",
    businessName: "",
    preferredDate: "",
    preferredTime: "",
    message: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to submit")
      }

      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="demo" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <div className={styles.label}>Book a Demo</div>
          <h2 className={styles.title}>See D-Zero AI in action — for free</h2>
          <p className={styles.desc}>
            Let us show you how an AI agent can transform your customer service.
            We&apos;ll walk you through a live demo tailored to your business.
          </p>

          <ul className={styles.bullets}>
            <li className={styles.bullet}>
              <span className={styles.bulletIcon}>✓</span>
              30-minute personalized demo
            </li>
            <li className={styles.bullet}>
              <span className={styles.bulletIcon}>✓</span>
              Live WhatsApp agent demonstration
            </li>
            <li className={styles.bullet}>
              <span className={styles.bulletIcon}>✓</span>
              Custom setup for your industry
            </li>
            <li className={styles.bullet}>
              <span className={styles.bulletIcon}>✓</span>
              Q&A with our team
            </li>
          </ul>
        </div>

        <div className={styles.form}>
          {success ? (
            <div className={styles.success}>
              <div className={styles.successIcon}>🎉</div>
              <div className={styles.successTitle}>Demo request received!</div>
              <div className={styles.successDesc}>
                We&apos;ll reach out within 24 hours to confirm your booking.
              </div>
            </div>
          ) : (
            <>
              <h3 className={styles.formTitle}>Request your demo</h3>
              <form onSubmit={handleSubmit}>
                <div className={styles.fields}>
                  <div className={styles.row}>
                    <Input
                      label="Your Name"
                      name="name"
                      placeholder="John Doe"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                    <Input
                      label="Email"
                      name="email"
                      type="email"
                      placeholder="john@company.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <Input
                    label="Business Name"
                    name="businessName"
                    placeholder="Your Company Ltd"
                    value={form.businessName}
                    onChange={handleChange}
                    required
                  />
                  <div className={styles.row}>
                    <Input
                      label="Preferred Date"
                      name="preferredDate"
                      type="date"
                      value={form.preferredDate}
                      onChange={handleChange}
                      required
                    />
                    <Input
                      label="Preferred Time"
                      name="preferredTime"
                      type="time"
                      value={form.preferredTime}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <Input
                    label="Message (optional)"
                    name="message"
                    placeholder="Tell us about your use case..."
                    value={form.message}
                    onChange={handleChange}
                  />
                  {error && <p className={styles.error}>{error}</p>}
                  <Button type="submit" loading={loading} fullWidth>
                    Book My Demo →
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export default DemoForm
