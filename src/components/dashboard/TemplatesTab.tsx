"use client"

import { useState, useEffect } from "react"
import styles from "./TemplatesTab.module.css"

interface MessageTemplate {
  id: string
  name: string
  content: string
  createdAt: string
  updatedAt: string
}

interface TemplatesTabProps {
  agentId: string
}

export function TemplatesTab({ agentId }: TemplatesTabProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [tipOpen, setTipOpen] = useState(false)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formContent, setFormContent] = useState("")
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchTemplates()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const fetchTemplates = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/agents/${agentId}/templates`)
      const data = await res.json()
      if (data.error) setError(data.error)
      else setTemplates(data.templates ?? [])
    } catch {
      setError("Failed to load templates")
    } finally {
      setLoading(false)
    }
  }

  const openAddForm = () => {
    setEditingId(null)
    setFormName("")
    setFormContent("")
    setFormError("")
    setShowForm(true)
  }

  const openEditForm = (template: MessageTemplate) => {
    setEditingId(template.id)
    setFormName(template.name)
    setFormContent(template.content)
    setFormError("")
    setShowForm(true)
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormName("")
    setFormContent("")
    setFormError("")
  }

  const saveTemplate = async () => {
    if (!formName.trim() || !formContent.trim()) {
      setFormError("Name and content are required.")
      return
    }
    setSaving(true)
    setFormError("")
    try {
      const url = editingId
        ? `/api/agents/${agentId}/templates/${editingId}`
        : `/api/agents/${agentId}/templates`
      const method = editingId ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, content: formContent }),
      })
      const data = await res.json()
      if (data.error) {
        setFormError(data.error)
      } else {
        if (editingId) {
          setTemplates((prev) =>
            prev.map((t) => (t.id === editingId ? data.template : t))
          )
        } else {
          setTemplates((prev) => [...prev, data.template])
        }
        cancelForm()
      }
    } catch {
      setFormError("Failed to save template.")
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/agents/${agentId}/templates/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.error) alert(data.error)
      else setTemplates((prev) => prev.filter((t) => t.id !== id))
    } catch {
      alert("Failed to delete template.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Follow-up Templates</div>
          <div className={styles.subtitle}>
            Create reusable instructions for generating personalized follow-up messages.
          </div>
        </div>
        {!showForm && (
          <button className={styles.addBtn} onClick={openAddForm}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Template
          </button>
        )}
      </div>

      {showForm && (
        <div className={styles.formCard}>
          <div className={styles.formTitle}>{editingId ? "Edit Template" : "New Template"}</div>

          <div className={styles.tipBox}>
            <button className={styles.tipToggle} onClick={() => setTipOpen((p) => !p)}>
              <span className={styles.tipTitle}>How to write a good template</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ transform: tipOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {tipOpen && (
              <>
                <p className={styles.tipText}>
                  Tell the AI <strong>who you are</strong>, <strong>what angle to take</strong>, and <strong>what action you want the customer to take</strong>. The AI will automatically use the customer&apos;s name and what they discussed in the conversation.
                </p>
                <div className={styles.tipExampleLabel}>Sales follow-up example:</div>
                <div className={styles.tipExample}>
                  My name is Chioma, I&apos;m the founder of LuxeHair. The customer enquired about our hair extensions. Follow up to let them know we have their preferred style in stock and offer them a limited discount if they order this week.
                </div>
                <div className={styles.tipExampleLabel} style={{ marginTop: "0.5rem" }}>Order confirmation example:</div>
                <div className={styles.tipExample}>
                  I&apos;m Tunde, owner of QuickBite Restaurant. The customer placed a food order. Confirm their order has been received, give an estimated delivery time, and ask if they have any special instructions.
                </div>
              </>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Template name</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. CEO intro follow-up, Order confirmation"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Instruction</label>
            <textarea
              className={styles.textarea}
              placeholder="My name is [Your Name], I'm the [Your Role] at [Business]. The customer [what they did]. Follow up by [what you want to say] and [your CTA]."
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={5}
            />
          </div>
          {formError && <div className={styles.formError}>{formError}</div>}
          <div className={styles.formActions}>
            <button className={styles.saveBtn} onClick={saveTemplate} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className={styles.cancelBtn} onClick={cancelForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading templates…</span>
        </div>
      )}

      {error && !loading && (
        <div className={styles.errorState}>{error}</div>
      )}

      {!loading && !error && templates.length === 0 && !showForm && (
        <div className={styles.emptyState}>
          No templates yet. Add one to start generating personalized follow-ups.
        </div>
      )}

      {!loading && templates.length > 0 && (
        <div className={styles.list}>
          {templates.map((template) => (
            <div key={template.id} className={styles.card}>
              <div className={styles.cardBody}>
                <div className={styles.cardName}>{template.name}</div>
                <div className={styles.cardContent}>
                  {template.content.length > 120
                    ? template.content.slice(0, 120) + "…"
                    : template.content}
                </div>
              </div>
              <div className={styles.cardActions}>
                <button
                  className={styles.iconBtn}
                  title="Edit"
                  onClick={() => openEditForm(template)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  title="Delete"
                  onClick={() => deleteTemplate(template.id)}
                  disabled={deletingId === template.id}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" /><path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TemplatesTab
