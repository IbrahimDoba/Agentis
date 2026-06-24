"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import {
  PlusIcon, PencilIcon, TrashIcon,
  ArrowPathIcon, CubeIcon, XMarkIcon,
  PhotoIcon, StarIcon,
} from "@heroicons/react/24/outline"
import { Input } from "@/components/ui/Input"
import type { Product } from "@/types"
import styles from "./ProductsEditor.module.css"

function nanoid() {
  return Math.random().toString(36).slice(2, 10)
}

interface FormState {
  name: string
  description: string
  price: string
  link: string
  images: string[]
}

const EMPTY_FORM: FormState = { name: "", description: "", price: "", link: "", images: [] }

// Back-compat: older products only carry a single `imageUrl`. Treat it as the
// sole (cover) photo so editing an old product doesn't lose its image.
function productImages(product: Product): string[] {
  if (product.images && product.images.length > 0) return product.images
  return product.imageUrl ? [product.imageUrl] : []
}

interface ProductsEditorProps {
  value: Product[]
  onChange: (products: Product[]) => void
}

export function ProductsEditor({ value, onChange }: ProductsEditorProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setUploadError("")
    setModalOpen(true)
  }

  const openEdit = (product: Product) => {
    setEditingId(product.id)
    setForm({
      name: product.name,
      description: product.description ?? "",
      price: product.price ?? "",
      link: product.link ?? "",
      images: productImages(product),
    })
    setUploadError("")
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setUploadError("")
  }

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  // Upload one or more photos. Each file is sent to /api/upload and the returned
  // URL is appended to the product's image list. images[0] is the cover (used
  // for the catalogue overview + card preview); the rest are extra angles the AI
  // sends as a per-product album.
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setIsUploading(true)
    setUploadError("")
    try {
      const uploaded: string[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/upload", { method: "POST", body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Upload failed")
        uploaded.push(data.url)
      }
      setForm((f) => ({ ...f, images: [...f.images, ...uploaded] }))
    } catch {
      setUploadError("One or more photos failed to upload. Try again.")
    } finally {
      setIsUploading(false)
      // Reset so selecting the same file again still fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const removeImage = (index: number) => {
    setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== index) }))
  }

  // Promote a photo to cover by moving it to the front of the list.
  const makeCover = (index: number) => {
    setForm((f) => {
      if (index <= 0) return f
      const next = [...f.images]
      const [pick] = next.splice(index, 1)
      next.unshift(pick)
      return { ...f, images: next }
    })
  }

  const handleSave = () => {
    if (!form.name.trim()) return
    // Keep imageUrl in sync with the cover (images[0]) so the catalogue album,
    // ElevenLabs text sync, and single-image send keep working unchanged.
    const patch = {
      name: form.name,
      description: form.description,
      price: form.price,
      link: form.link,
      images: form.images,
      imageUrl: form.images[0] ?? "",
    }
    if (editingId) {
      onChange(value.map((p) => p.id === editingId ? { ...p, ...patch } : p))
    } else {
      onChange([...value, { id: nanoid(), ...patch }])
    }
    closeModal()
  }

  const handleDelete = (id: string) => {
    onChange(value.filter((p) => p.id !== id))
  }

  return (
    <div className={styles.root}>
      {/* Section header */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionLeft}>
          <span className={styles.sectionTitle}>Product Catalogue</span>
          {value.length > 0 && <span className={styles.badge}>{value.length}</span>}
        </div>
        <p className={styles.sectionHint}>
          The AI agent uses these to answer product questions and send images to customers.
          Add several photos to a product and the AI sends them all as an album when a customer asks about it.
        </p>
      </div>

      {/* Grid */}
      <div className={styles.grid}>
        {value.map((product) => {
          const imgs = productImages(product)
          const cover = imgs[0]
          return (
          <div key={product.id} className={styles.card}>
            {/* Image */}
            <div className={styles.cardImage}>
              {cover ? (
                <Image
                  src={cover}
                  alt={product.name}
                  fill
                  className={styles.cardImg}
                />
              ) : (
                <div className={styles.cardImgFallback}>
                  <CubeIcon width={28} height={28} />
                </div>
              )}
              {/* Photo-count badge (only when more than one) */}
              {imgs.length > 1 && (
                <span
                  style={{
                    position: "absolute", top: 6, left: 6, zIndex: 1,
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "2px 6px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: "rgba(0,0,0,0.6)", color: "#fff",
                  }}
                >
                  <PhotoIcon width={11} height={11} /> {imgs.length}
                </span>
              )}
              {/* Hover actions */}
              <div className={styles.cardOverlay}>
                <button
                  type="button"
                  className={styles.overlayBtn}
                  onClick={() => openEdit(product)}
                  aria-label="Edit"
                >
                  <PencilIcon width={14} height={14} />
                </button>
                <button
                  type="button"
                  className={`${styles.overlayBtn} ${styles.overlayBtnDanger}`}
                  onClick={() => handleDelete(product.id)}
                  aria-label="Delete"
                >
                  <TrashIcon width={14} height={14} />
                </button>
              </div>
            </div>

            {/* Info */}
            <div className={styles.cardBody}>
              <span className={styles.cardName}>{product.name}</span>
              {product.price && <span className={styles.cardPrice}>{product.price}</span>}
              {product.description && (
                <span className={styles.cardDesc}>{product.description}</span>
              )}
            </div>
          </div>
          )
        })}

        {/* Add card */}
        <button type="button" className={styles.addCard} onClick={openAdd}>
          <div className={styles.addCardInner}>
            <PlusIcon width={20} height={20} />
            <span>Add Product</span>
          </div>
        </button>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className={styles.modalBackdrop} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                {editingId ? "Edit Product" : "Add Product"}
              </span>
              <button type="button" className={styles.modalClose} onClick={closeModal}>
                <XMarkIcon width={18} height={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Cover / add-photos dropzone */}
              <div
                className={styles.modalImageUpload}
                onClick={() => !isUploading && fileInputRef.current?.click()}
              >
                {form.images[0] ? (
                  <Image
                    src={form.images[0]}
                    alt="Product cover"
                    fill
                    className={styles.modalImg}
                  />
                ) : (
                  <div className={styles.modalImgPlaceholder}>
                    <PhotoIcon width={32} height={32} />
                    <span>Click to upload product photos</span>
                    <span className={styles.modalImgHint}>You can select several · JPG, PNG, WebP · Max 4MB each</span>
                  </div>
                )}
                {isUploading && (
                  <div className={styles.modalImgSpinner}>
                    <ArrowPathIcon width={22} height={22} className={styles.spin} />
                  </div>
                )}
                {form.images[0] && !isUploading && (
                  <div className={styles.modalImgChangeOverlay}>
                    <PhotoIcon width={16} height={16} />
                    <span>Add more photos</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className={styles.hiddenInput}
                onChange={handleImageUpload}
              />
              {uploadError && <p className={styles.uploadErr}>{uploadError}</p>}

              {/* Thumbnail strip — all photos for this product (first = cover) */}
              {form.images.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {form.images.map((url, i) => (
                    <div
                      key={`${url}-${i}`}
                      style={{
                        position: "relative", width: 64, height: 64, borderRadius: 8,
                        overflow: "hidden", flexShrink: 0,
                        border: i === 0 ? "2px solid var(--accent, #16a34a)" : "1px solid var(--border, #d4d4d8)",
                      }}
                    >
                      <Image src={url} alt={`Photo ${i + 1}`} fill style={{ objectFit: "cover" }} />
                      {i === 0 && (
                        <span style={{
                          position: "absolute", bottom: 0, left: 0, right: 0,
                          fontSize: 9, lineHeight: "13px", textAlign: "center",
                          background: "rgba(0,0,0,0.65)", color: "#fff",
                        }}>Cover</span>
                      )}
                      {i !== 0 && (
                        <button
                          type="button"
                          onClick={() => makeCover(i)}
                          aria-label="Make cover photo"
                          title="Make cover"
                          style={{
                            position: "absolute", bottom: 2, left: 2,
                            width: 18, height: 18, padding: 0, borderRadius: 4, border: "none",
                            background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <StarIcon width={11} height={11} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        aria-label="Remove photo"
                        title="Remove"
                        style={{
                          position: "absolute", top: 2, right: 2,
                          width: 18, height: 18, padding: 0, borderRadius: 4, border: "none",
                          background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <XMarkIcon width={11} height={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Fields */}
              <div className={styles.modalFields}>
                <div className={styles.formRow}>
                  <Input
                    label="Product Name *"
                    name="name"
                    value={form.name}
                    onChange={handleFieldChange}
                    placeholder="e.g. Wireless Headphones"
                  />
                  <Input
                    label="Price (optional)"
                    name="price"
                    value={form.price}
                    onChange={handleFieldChange}
                    placeholder="e.g. ₦25,000"
                  />
                </div>
                <Input
                  label="Description (optional)"
                  name="description"
                  value={form.description}
                  onChange={handleFieldChange}
                  placeholder="Short product description the AI can reference…"
                />
                <Input
                  label="Link (optional)"
                  name="link"
                  value={form.link}
                  onChange={handleFieldChange}
                  placeholder="https://yourstore.com/product"
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.cancelBtn} onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={!form.name.trim() || isUploading}
              >
                {editingId ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductsEditor
