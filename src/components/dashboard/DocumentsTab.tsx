"use client"

import { useState, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
    DocumentTextIcon,
    GlobeAltIcon,
    TrashIcon,
    ArrowUpTrayIcon,
    ArrowPathIcon,
    PlusIcon,
    ExclamationCircleIcon,
    CheckCircleIcon,
} from "@heroicons/react/24/outline"
import { Input } from "@/components/ui/Input"
import styles from "./KnowledgeBaseTab.module.css"

/** Progress of a crawl. Separate from `status`, so a refresh never blanks the agent. */
type CrawlStatus = "queued" | "crawling" | "embedding" | "failed"

interface CrawlMeta {
    pagesCrawled?: number
    pagesFailed?: number
    deadlineHit?: boolean
}

interface OrchestratorDocument {
    id: string
    filename: string
    mimeType: string
    sizeBytes: number
    status: "pending" | "chunking" | "embedding" | "ready" | "failed"
    error: string | null
    chunkCount: number
    createdAt: string
    sourceType: "file" | "web"
    sourceUrl: string | null
    crawlStatus: CrawlStatus | null
    lastCrawledAt: string | null
    crawlMeta: CrawlMeta | null
}

interface DocumentsTabProps {
    agentId: string
}

// "failed" is absent on purpose — it is rendered as a badge, not a progress label.
const CRAWL_LABELS: Partial<Record<CrawlStatus, string>> = {
    queued: "Queued…",
    crawling: "Reading site…",
    embedding: "Learning…",
}

function isInFlight(doc: OrchestratorDocument): boolean {
    if (doc.crawlStatus && doc.crawlStatus !== "failed") return true
    return doc.status === "pending" || doc.status === "chunking" || doc.status === "embedding"
}

function StatusBadge({ doc }: { doc: OrchestratorDocument }) {
    // A crawl in flight reports its own progress; `status` still describes the
    // content currently being served, which is not what the operator is watching.
    if (doc.crawlStatus && doc.crawlStatus !== "failed") {
        return (
            <span className={styles.badgePending}>
                <ArrowPathIcon width={12} height={12} className={styles.spin} />
                {CRAWL_LABELS[doc.crawlStatus] ?? "Working…"}
            </span>
        )
    }

    // A refresh that failed on a link which already has content: the agent is
    // still answering from the previous crawl, so this is a warning, not a failure.
    if (doc.crawlStatus === "failed" && doc.status === "ready") {
        return (
            <>
                <span className={styles.badgeSuccess}><CheckCircleIcon width={12} height={12} /> Ready</span>
                <span className={styles.badgeError} title={doc.error || "The last refresh failed"}>
                    <ExclamationCircleIcon width={12} height={12} /> Refresh failed
                </span>
            </>
        )
    }

    if (doc.status === "ready") {
        return <span className={styles.badgeSuccess}><CheckCircleIcon width={12} height={12} /> Ready</span>
    }
    if (doc.status === "failed" || doc.crawlStatus === "failed") {
        return (
            <span className={styles.badgeError} title={doc.error || "Processing failed"}>
                <ExclamationCircleIcon width={12} height={12} /> Failed
            </span>
        )
    }
    return (
        <span className={styles.badgePending}>
            <ArrowPathIcon width={12} height={12} className={styles.spin} /> Processing…
        </span>
    )
}

/** "just now" / "3 hours ago" / "12 Aug" — a crawl date is usually recent. */
function timeAgo(iso: string): string {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins} min ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
    const days = Math.round(hours / 24)
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

export function DocumentsTab({ agentId }: DocumentsTabProps) {
    const queryClient = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [mode, setMode] = useState<"idle" | "url">("idle")
    const [urlInput, setUrlInput] = useState("")
    const [addingUrl, setAddingUrl] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [refreshingId, setRefreshingId] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState("")

    const { data, isLoading } = useQuery({
        queryKey: ["documents", agentId],
        queryFn: async () => {
            const res = await fetch(`/api/agents/${agentId}/documents`)
            if (!res.ok) throw new Error("Failed to load documents")
            return res.json() as Promise<{ documents: OrchestratorDocument[] }>
        },
        refetchInterval: (query) => {
            // Poll every 3 seconds while anything is uploading or crawling.
            const busy = query.state.data?.documents.some(isInFlight)
            return busy ? 3000 : false
        },
        staleTime: 30 * 1000,
    })

    const docs = data?.documents ?? []
    const webCount = docs.filter((d) => d.sourceType === "web").length

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["documents", agentId] })

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        setErrorMsg("")
        try {
            const formData = new FormData()
            formData.append("file", file)
            const res = await fetch(`/api/agents/${agentId}/documents`, { method: "POST", body: formData })
            const resData = await res.json()
            if (!res.ok) throw new Error(resData.error ?? "Upload failed")
            invalidate()
        } catch (err: any) {
            setErrorMsg(err.message ?? "Upload failed")
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    const handleAddWebsite = async () => {
        if (!urlInput.trim()) return
        setAddingUrl(true)
        setErrorMsg("")
        try {
            const res = await fetch(`/api/agents/${agentId}/documents/web`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: urlInput.trim() }),
            })
            const resData = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(resData.error ?? "Failed to add website")
            setUrlInput("")
            setMode("idle")
            invalidate()
        } catch (err: any) {
            setErrorMsg(err.message ?? "Failed to add website")
        } finally {
            setAddingUrl(false)
        }
    }

    const handleRefresh = async (docId: string) => {
        setRefreshingId(docId)
        setErrorMsg("")
        try {
            const res = await fetch(`/api/agents/${agentId}/documents/${docId}/recrawl`, { method: "POST" })
            const resData = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(resData.error ?? "Failed to refresh")
            invalidate()
        } catch (err: any) {
            setErrorMsg(err.message ?? "Failed to refresh website")
        } finally {
            setRefreshingId(null)
        }
    }

    const handleDelete = async (docId: string, label: string) => {
        if (!window.confirm(`Remove "${label}"? This deletes it for good.`)) return
        setDeletingId(docId)
        setErrorMsg("")
        try {
            const res = await fetch(`/api/agents/${agentId}/documents/${docId}`, { method: "DELETE" })
            if (!res.ok) {
                const resData = await res.json().catch(() => ({}))
                throw new Error(resData.error ?? "Failed to remove")
            }
            invalidate()
        } catch (err: any) {
            setErrorMsg(err.message ?? "Failed to remove document")
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className={styles.root}>
            <div className={styles.header}>
                <div>
                    <div className={styles.title}>Documents / RAG</div>
                    <div className={styles.subtitle}>
                        Upload PDFs, DOCX and text files, or point the agent at your website. It reads all of
                        this to answer questions.
                    </div>
                </div>
                <div className={styles.addActions}>
                    <button
                        className={styles.addBtn}
                        onClick={() => setMode(mode === "url" ? "idle" : "url")}
                        disabled={addingUrl}
                    >
                        <GlobeAltIcon width={14} height={14} />
                        Add Website
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
                        // Let the server reject types, but hint the browser:
                        accept=".pdf,.txt,.docx,.md"
                        className={styles.hiddenInput}
                        onChange={handleFileUpload}
                    />
                </div>
            </div>

            {errorMsg && (
                <div className={styles.error}>
                    <ExclamationCircleIcon width={14} height={14} /> {errorMsg}
                </div>
            )}

            {mode === "url" && (
                <div className={styles.urlForm}>
                    <div className={styles.urlFields} style={{ gridTemplateColumns: "1fr" }}>
                        <Input
                            label="Website address"
                            placeholder="https://yourbusiness.com"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddWebsite() }}
                        />
                    </div>
                    <div className={styles.docMeta}>
                        We read up to 25 pages from this site, and only this site. Pages built entirely with
                        JavaScript cannot be read. You can add {Math.max(0, 5 - webCount)} more.
                    </div>
                    <div className={styles.urlActions}>
                        <button
                            className={styles.saveBtn}
                            onClick={handleAddWebsite}
                            disabled={!urlInput.trim() || addingUrl}
                        >
                            {addingUrl ? <ArrowPathIcon width={14} height={14} className={styles.spin} /> : <PlusIcon width={14} height={14} />}
                            {addingUrl ? "Adding…" : "Add Website"}
                        </button>
                        <button className={styles.cancelBtn} onClick={() => { setMode("idle"); setUrlInput("") }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className={styles.loading}>
                    <ArrowPathIcon width={18} height={18} className={styles.spin} /> Loading documents…
                </div>
            ) : docs.length === 0 ? (
                <div className={styles.empty}>
                    <DocumentTextIcon width={32} height={32} className={styles.emptyIcon} />
                    <div className={styles.emptyTitle}>Nothing here yet</div>
                    <div className={styles.emptyDesc}>
                        Add your website, or upload PDFs, Word documents and text files — the agent will use
                        them to answer questions.
                    </div>
                    <div className={styles.emptyHint}>Max file size: 10MB</div>
                </div>
            ) : (
                <div className={styles.list}>
                    {docs.map((doc) => {
                        const isWeb = doc.sourceType === "web"
                        const busy = isInFlight(doc)
                        return (
                            <div key={doc.id} className={styles.docRow}>
                                <div className={styles.docIcon}>
                                    {isWeb
                                        ? <GlobeAltIcon width={16} height={16} />
                                        : <DocumentTextIcon width={16} height={16} />}
                                </div>
                                <div className={styles.docInfo}>
                                    <div className={styles.docName}>{doc.filename}</div>
                                    <div className={styles.docMeta} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                                        {isWeb ? (
                                            <>
                                                <span>{doc.sourceUrl}</span>
                                                {doc.crawlMeta?.pagesCrawled ? (
                                                    <>
                                                        <span>•</span>
                                                        <span>{doc.crawlMeta.pagesCrawled} pages</span>
                                                    </>
                                                ) : null}
                                            </>
                                        ) : (
                                            <span>{(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                                        )}
                                        <span>•</span>
                                        <span>{doc.chunkCount > 0 ? `${doc.chunkCount} chunks` : "Processing"}</span>
                                        {isWeb && doc.lastCrawledAt && (
                                            <>
                                                <span>•</span>
                                                <span>Updated {timeAgo(doc.lastCrawledAt)}</span>
                                            </>
                                        )}
                                        <StatusBadge doc={doc} />
                                    </div>
                                </div>
                                {isWeb && (
                                    <button
                                        onClick={() => handleRefresh(doc.id)}
                                        disabled={busy || refreshingId === doc.id}
                                        title="Read this site again and replace what the agent knows from it"
                                        className={styles.cancelBtn}
                                        style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                                    >
                                        <ArrowPathIcon
                                            width={13}
                                            height={13}
                                            className={busy || refreshingId === doc.id ? styles.spin : undefined}
                                        />
                                        Refresh
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDelete(doc.id, doc.filename)}
                                    disabled={deletingId === doc.id}
                                    title={isWeb ? "Remove this website" : "Remove this document"}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.06)", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: deletingId === doc.id ? "not-allowed" : "pointer", flexShrink: 0 }}
                                >
                                    {deletingId === doc.id
                                        ? <ArrowPathIcon width={13} height={13} className={styles.spin} />
                                        : <TrashIcon width={13} height={13} />
                                    }
                                    Remove
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
