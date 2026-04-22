"use client"

import { useState, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { DocumentTextIcon, LinkIcon, TrashIcon, ArrowUpTrayIcon, PlusIcon, ArrowPathIcon, GlobeAltIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline"
import { Input } from "@/components/ui/Input"
import styles from "./KnowledgeBaseTab.module.css"

interface KBDoc {
  id: string
  name: string
  type: "file" | "url" | "text"
  usage_mode: string
}

interface KnowledgeBaseTabProps {
  agentId: string
  elevenlabsAgentId?: string | null
  agentRuntime?: string
}

function formatDocType(type: string) {
  if (type === "file") return "Document"
  if (type === "url") return "URL"
  return "Text"
}

function DocIcon({ type }: { type: string }) {
  if (type === "url") return <GlobeAltIcon width={16} height={16} />
  return <DocumentTextIcon width={16} height={16} />
}

export function KnowledgeBaseTab({ agentId, elevenlabsAgentId, agentRuntime }: KnowledgeBaseTabProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<"idle" | "url">("idle")
  const [urlInput, setUrlInput] = useState("")
  const [urlName, setUrlName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [addingUrl, setAddingUrl] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["knowledge-base", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/knowledge-base`)
      if (!res.ok) throw new Error("Failed to load knowledge base")
      return res.json() as Promise<{ docs: KBDoc[] }>
    },
    enabled: !!elevenlabsAgentId,
    staleTime: 30 * 1000,
  })

  const docs = data?.docs ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["knowledge-base", agentId] })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/agents/${agentId}/knowledge-base`, { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      invalidate()
    } catch (err: any) {
      setError(err.message ?? "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return
    setAddingUrl(true)
    setError("")
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge-base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim(), name: urlName.trim() || urlInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to add URL")
      setUrlInput("")
      setUrlName("")
      setMode("idle")
      invalidate()
    } catch (err: any) {
      setError(err.message ?? "Failed to add URL")
    } finally {
      setAddingUrl(false)
    }
  }

  const handleDelete = async (docId: string) => {
    setDeletingId(docId)
    setError("")
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge-base/${docId}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to remove")
      invalidate()
    } catch (err: any) {
      setError(err.message ?? "Failed to remove document")
    } finally {
      setDeletingId(null)
    }
  }

  if (!elevenlabsAgentId) {
    return (
      <div className={styles.notConnected}>
        <ExclamationCircleIcon width={32} height={32} className={styles.notConnectedIcon} />
        <div className={styles.notConnectedTitle}>Knowledge base not available yet</div>
        <div className={styles.notConnectedDesc}>
          Your agent is still being set up. The knowledge base will be available once setup is complete.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Knowledge Base</div>
          <div className={styles.subtitle}>
            Documents and URLs the agent can reference when answering customer questions.
          </div>
        </div>
        <div className={styles.addActions}>
          <button
            className={styles.addBtn}
            onClick={() => { setMode(mode === "url" ? "idle" : "url"); setError("") }}
            disabled={uploading}
          >
            <LinkIcon width={14} height={14} /> Add URL
          </button>
          <button
            className={styles.addBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <ArrowPathIcon width={14} height={14} className={styles.spin} /> : <ArrowUpTrayIcon width={14} height={14} />}
            {uploading ? "Uploading…" : "Upload File"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx,.html,.epub"
            className={styles.hiddenInput}
            onChange={handleFileUpload}
          />
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <ExclamationCircleIcon width={14} height={14} /> {error}
        </div>
      )}

      {mode === "url" && (
        <div className={styles.urlForm}>
          <div className={styles.urlFields}>
            <Input
              label="URL"
              placeholder="https://yourwebsite.com/info"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <Input
              label="Name (optional)"
              placeholder="e.g. Product catalogue page"
              value={urlName}
              onChange={(e) => setUrlName(e.target.value)}
            />
          </div>
          <div className={styles.urlActions}>
            <button className={styles.saveBtn} onClick={handleAddUrl} disabled={!urlInput.trim() || addingUrl}>
              {addingUrl ? <ArrowPathIcon width={14} height={14} className={styles.spin} /> : <PlusIcon width={14} height={14} />}
              {addingUrl ? "Adding…" : "Add URL"}
            </button>
            <button className={styles.cancelBtn} onClick={() => { setMode("idle"); setUrlInput(""); setUrlName("") }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={styles.loading}>
          <ArrowPathIcon width={18} height={18} className={styles.spin} /> Loading knowledge base…
        </div>
      ) : docs.length === 0 ? (
        <div className={styles.empty}>
          <DocumentTextIcon width={32} height={32} className={styles.emptyIcon} />
          <div className={styles.emptyTitle}>No documents yet</div>
          <div className={styles.emptyDesc}>
            Upload PDFs, Word documents, or add URLs — the agent will use them to answer questions.
          </div>
          <div className={styles.emptyHint}>Supported formats: PDF, TXT, DOCX, HTML, EPUB</div>
        </div>
      ) : (
        <div className={styles.list}>
          {docs.map((doc) => (
            <div key={doc.id} className={styles.docRow}>
              <div className={styles.docIcon}>
                <DocIcon type={doc.type} />
              </div>
              <div className={styles.docInfo}>
                <div className={styles.docName}>{doc.name}</div>
                <div className={styles.docMeta}>{formatDocType(doc.type)}</div>
              </div>
              <button
                className={styles.deleteBtn}
                onClick={() => handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                title="Remove from knowledge base"
              >
                {deletingId === doc.id
                  ? <ArrowPathIcon width={14} height={14} className={styles.spin} />
                  : <TrashIcon width={14} height={14} />
                }
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default KnowledgeBaseTab
