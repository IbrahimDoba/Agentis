"use client"

import { useState, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { DocumentTextIcon, TrashIcon, ArrowUpTrayIcon, ArrowPathIcon, ExclamationCircleIcon, CheckCircleIcon } from "@heroicons/react/24/outline"
import styles from "./KnowledgeBaseTab.module.css"

interface OrchestratorDocument {
    id: string
    filename: string
    mimeType: string
    sizeBytes: number
    status: "pending" | "chunking" | "embedding" | "ready" | "failed"
    error: string | null
    chunkCount: number
    createdAt: string
}

interface DocumentsTabProps {
    agentId: string
}

function StatusBadge({ status, error }: { status: OrchestratorDocument["status"]; error?: string | null }) {
    if (status === "ready") {
        return <span className={styles.badgeSuccess}><CheckCircleIcon width={12} height={12} /> Ready</span>
    }
    if (status === "failed") {
        return <span className={styles.badgeError} title={error || "Processing failed"}><ExclamationCircleIcon width={12} height={12} /> Failed</span>
    }
    return <span className={styles.badgePending}><ArrowPathIcon width={12} height={12} className={styles.spin} /> Processing…</span>
}

export function DocumentsTab({ agentId }: DocumentsTabProps) {
    const queryClient = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [uploading, setUploading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState("")

    const { data, isLoading } = useQuery({
        queryKey: ["documents", agentId],
        queryFn: async () => {
            const res = await fetch(`/api/agents/${agentId}/documents`)
            if (!res.ok) throw new Error("Failed to load documents")
            return res.json() as Promise<{ documents: OrchestratorDocument[] }>
        },
        refetchInterval: (query) => {
            // Poll every 3 seconds if any document is processing
            const hasPending = query.state.data?.documents.some(
                (doc) => doc.status === "pending" || doc.status === "chunking" || doc.status === "embedding"
            )
            return hasPending ? 3000 : false
        },
        staleTime: 30 * 1000,
    })

    const docs = data?.documents ?? []

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

    const handleDelete = async (docId: string) => {
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
                        Upload PDFs, DOCX, and text files. The AI orchestrator will retrieve from these to answer questions.
                    </div>
                </div>
                <div className={styles.addActions}>
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

            {isLoading ? (
                <div className={styles.loading}>
                    <ArrowPathIcon width={18} height={18} className={styles.spin} /> Loading documents…
                </div>
            ) : docs.length === 0 ? (
                <div className={styles.empty}>
                    <DocumentTextIcon width={32} height={32} className={styles.emptyIcon} />
                    <div className={styles.emptyTitle}>No documents yet</div>
                    <div className={styles.emptyDesc}>
                        Upload PDFs, Word documents, or text files — the agent will use them to answer questions.
                    </div>
                    <div className={styles.emptyHint}>Max size: 10MB</div>
                </div>
            ) : (
                <div className={styles.list}>
                    {docs.map((doc) => (
                        <div key={doc.id} className={styles.docRow}>
                            <div className={styles.docIcon}>
                                <DocumentTextIcon width={16} height={16} />
                            </div>
                            <div className={styles.docInfo}>
                                <div className={styles.docName}>{doc.filename}</div>
                                <div className={styles.docMeta} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span>{(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                                    <span>•</span>
                                    <span>{doc.chunkCount > 0 ? `${doc.chunkCount} chunks` : 'Processing'}</span>
                                    <StatusBadge status={doc.status} error={doc.error} />
                                </div>
                            </div>
                            <button
                                className={styles.deleteBtn}
                                onClick={() => handleDelete(doc.id)}
                                disabled={deletingId === doc.id}
                                title="Delete document"
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
