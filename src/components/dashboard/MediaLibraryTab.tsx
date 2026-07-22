"use client"

import { useState, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
    PhotoIcon, VideoCameraIcon, DocumentIcon, TrashIcon,
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

interface MediaLibraryTabProps {
    agentId: string
}

function kindOf(mime: string): "image" | "video" | "document" {
    if (mime.startsWith("image/")) return "image"
    if (mime.startsWith("video/")) return "video"
    return "document"
}

function KindIcon({ mime }: { mime: string }) {
    const kind = kindOf(mime)
    if (kind === "image") return <PhotoIcon width={16} height={16} />
    if (kind === "video") return <VideoCameraIcon width={16} height={16} />
    return <DocumentIcon width={16} height={16} />
}

export function MediaLibraryTab({ agentId }: MediaLibraryTabProps) {
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

    const items = data?.media ?? []
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
            setErrorMsg(err.message ?? "Failed to remove media")
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className={styles.root}>
            <div className={styles.header}>
                <div>
                    <div className={styles.title}>Media library</div>
                    <div className={styles.subtitle}>
                        Upload images, videos, and documents (brochures, price lists, PDFs). The AI sends the matching
                        item when a customer asks — so give each a clear description. Limits: image 5MB, video 16MB, document 25MB.
                    </div>
                </div>
            </div>

            {/* Add form */}
            <div className={styles.list} style={{ marginBottom: 16 }}>
                <div className={styles.docRow} style={{ flexWrap: "wrap", gap: 10 }}>
                    <button
                        className={styles.addBtn}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        type="button"
                    >
                        <ArrowUpTrayIcon width={14} height={14} />
                        {file ? "Change file" : "Choose file"}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
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
                    <button
                        className={styles.addBtn}
                        onClick={handleUpload}
                        disabled={uploading || !file || !description.trim()}
                        type="button"
                    >
                        {uploading ? <ArrowPathIcon width={14} height={14} className={styles.spin} /> : <ArrowUpTrayIcon width={14} height={14} />}
                        {uploading ? "Uploading…" : "Add to library"}
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className={styles.error}>
                    <ExclamationCircleIcon width={14} height={14} /> {errorMsg}
                </div>
            )}

            {isLoading ? (
                <div className={styles.loading}>
                    <ArrowPathIcon width={18} height={18} className={styles.spin} /> Loading media…
                </div>
            ) : items.length === 0 ? (
                <div className={styles.empty}>
                    <PhotoIcon width={32} height={32} className={styles.emptyIcon} />
                    <div className={styles.emptyTitle}>No media yet</div>
                    <div className={styles.emptyDesc}>
                        Upload a product image, a demo video, or a brochure/price-list document — the AI will send it when a customer asks.
                    </div>
                </div>
            ) : (
                <div className={styles.list}>
                    {items.map((m) => (
                        <div key={m.id} className={styles.docRow}>
                            <div className={styles.docIcon}><KindIcon mime={m.mimeType} /></div>
                            <div className={styles.docInfo}>
                                <div className={styles.docName}>{m.description || m.filename}</div>
                                <div className={styles.docMeta} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <span style={{ textTransform: "capitalize" }}>{kindOf(m.mimeType)}</span>
                                    <span>•</span>
                                    <span>{m.filename}</span>
                                </div>
                            </div>
                            <button
                                className={styles.deleteBtn}
                                onClick={() => handleDelete(m.id)}
                                disabled={deletingId === m.id}
                                title="Delete media"
                            >
                                {deletingId === m.id
                                    ? <ArrowPathIcon width={14} height={14} className={styles.spin} />
                                    : <TrashIcon width={14} height={14} />}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
