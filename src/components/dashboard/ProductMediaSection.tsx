"use client"

import { useState, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
    VideoCameraIcon, DocumentIcon, TrashIcon,
    ArrowUpTrayIcon, ArrowPathIcon, ExclamationCircleIcon,
} from "@heroicons/react/24/outline"
import styles from "./KnowledgeBaseTab.module.css"

interface MediaItem {
    id: string
    filename: string
    mimeType: string
    description: string
    createdAt: string
}

interface ProductMediaSectionProps {
    agentId: string
}

const isImage = (mime: string) => mime.startsWith("image/")
const isVideo = (mime: string) => mime.startsWith("video/")

/**
 * Videos & documents the AI can send about the catalogue — demo clips,
 * brochures, price lists, spec sheets. Product PHOTOS are managed in the
 * Product Catalogue editor above; this section only handles video/document
 * items (it hides image items, which are product photos synced automatically).
 */
export function ProductMediaSection({ agentId }: ProductMediaSectionProps) {
    const queryClient = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [file, setFile] = useState<File | null>(null)
    const [description, setDescription] = useState("")
    const [uploading, setUploading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState("")

    const { data, isLoading } = useQuery({
        queryKey: ["media", agentId],
        queryFn: async () => {
            const res = await fetch(`/api/agents/${agentId}/media`)
            if (!res.ok) throw new Error("Failed to load media")
            return res.json() as Promise<{ media: MediaItem[] }>
        },
        staleTime: 30 * 1000,
    })

    // Only videos & documents live here — product photos (images) are shown in
    // the Product Catalogue editor.
    const items = (data?.media ?? []).filter((m) => !isImage(m.mimeType))
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["media", agentId] })

    const handleUpload = async () => {
        if (!file) return
        if (!description.trim()) { setErrorMsg("Add a short description so the AI knows when to send it."); return }
        setUploading(true)
        setErrorMsg("")
        try {
            const formData = new FormData()
            formData.append("file", file)
            formData.append("description", description.trim())
            const res = await fetch(`/api/agents/${agentId}/media`, { method: "POST", body: formData })
            const resData = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(resData.error ?? "Upload failed")
            setFile(null)
            setDescription("")
            if (fileInputRef.current) fileInputRef.current.value = ""
            invalidate()
        } catch (err: any) {
            setErrorMsg(err.message ?? "Upload failed")
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async (mediaId: string) => {
        setDeletingId(mediaId)
        setErrorMsg("")
        try {
            const res = await fetch(`/api/agents/${agentId}/media/${mediaId}`, { method: "DELETE" })
            if (!res.ok) {
                const resData = await res.json().catch(() => ({}))
                throw new Error(resData.error ?? "Failed to remove")
            }
            invalidate()
        } catch (err: any) {
            setErrorMsg(err.message ?? "Failed to remove")
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className={styles.root}>
            <div className={styles.header}>
                <div>
                    <div className={styles.title}>Videos &amp; Documents</div>
                    <div className={styles.subtitle}>
                        Add demo videos, brochures, price lists, or spec sheets. The AI sends the matching one when a
                        customer asks — give each a clear description. Limits: video 16MB, document 25MB.
                    </div>
                </div>
            </div>

            {/* Add form */}
            <div className={styles.list} style={{ marginBottom: 12 }}>
                <div className={styles.docRow} style={{ flexWrap: "wrap", gap: 10 }}>
                    <button className={styles.addBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading} type="button">
                        <ArrowUpTrayIcon width={14} height={14} />
                        {file ? "Change file" : "Choose file"}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                        className={styles.hiddenInput}
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    {file && <span className={styles.docName} style={{ flex: "1 1 160px" }}>{file.name}</span>}
                    <input
                        type="text"
                        placeholder="Description (e.g. 'Oraimo powerbank demo video', 'Full price list PDF')"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        style={{ flex: "2 1 240px", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", fontSize: 13 }}
                    />
                    <button className={styles.addBtn} onClick={handleUpload} disabled={uploading || !file || !description.trim()} type="button">
                        {uploading ? <ArrowPathIcon width={14} height={14} className={styles.spin} /> : <ArrowUpTrayIcon width={14} height={14} />}
                        {uploading ? "Uploading…" : "Add"}
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className={styles.error}><ExclamationCircleIcon width={14} height={14} /> {errorMsg}</div>
            )}

            {isLoading ? (
                <div className={styles.loading}><ArrowPathIcon width={18} height={18} className={styles.spin} /> Loading…</div>
            ) : items.length === 0 ? (
                <div className={styles.empty}>
                    <DocumentIcon width={28} height={28} className={styles.emptyIcon} />
                    <div className={styles.emptyTitle}>No videos or documents yet</div>
                    <div className={styles.emptyDesc}>Add a demo video or a brochure/price-list — the AI sends it when a customer asks.</div>
                </div>
            ) : (
                <div className={styles.list}>
                    {items.map((m) => (
                        <div key={m.id} className={styles.docRow}>
                            <div className={styles.docIcon}>
                                {isVideo(m.mimeType) ? <VideoCameraIcon width={16} height={16} /> : <DocumentIcon width={16} height={16} />}
                            </div>
                            <div className={styles.docInfo}>
                                <div className={styles.docName}>{m.description || m.filename}</div>
                                <div className={styles.docMeta} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <span>{isVideo(m.mimeType) ? "Video" : "Document"}</span>
                                    <span>•</span>
                                    <span>{m.filename}</span>
                                </div>
                            </div>
                            <button className={styles.deleteBtn} onClick={() => handleDelete(m.id)} disabled={deletingId === m.id} title="Delete">
                                {deletingId === m.id ? <ArrowPathIcon width={14} height={14} className={styles.spin} /> : <TrashIcon width={14} height={14} />}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
