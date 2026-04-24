"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import {
  PlusIcon, PencilIcon, TrashIcon,
  ArrowPathIcon, CubeIcon, XMarkIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline"
import { Input } from "@/components/ui/Input"
import type { Product } from "@/types"
import styles from "./ProductsEditor.module.css"

function nanoid() {
  return Math.random().toString(36).slice(2, 10)
}

const EMPTY_FORM = { name: "", description: "", price: "", link: "", imageUrl: "" }

interface ProductsEditorProps {
  value: Product[]
  onChange: (products: Product[]) => void
}

export function ProductsEditor({ value, onChange }: ProductsEditorProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
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
      imageUrl: product.imageUrl ?? "",
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    setUploadError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      setForm((f) => ({ ...f, imageUrl: data.url }))
    } catch {
      setUploadError("Image upload failed. Try again.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleSave = () => {
    if (!form.name.trim()) return
    if (editingId) {
      onChange(value.map((p) => p.id === editingId ? { ...p, ...form } : p))
    } else {
      onChange([...value, { id: nanoid(), ...form }])
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
        </p>
      </div>

      {/* Grid */}
      <div className={styles.grid}>
        {value.map((product) => (
          <div key={product.id} className={styles.card}>
            {/* Image */}
            <div className={styles.cardImage}>
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  className={styles.cardImg}
                />
              ) : (
                <div className={styles.cardImgFallback}>
                  <CubeIcon width={28} height={28} />
                </div>
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
        ))}

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
              {/* Image upload — big, prominent */}
              <div
                className={styles.modalImageUpload}
                onClick={() => !isUploading && fileInputRef.current?.click()}
              >
                {form.imageUrl ? (
                  <Image
                    src={form.imageUrl}
                    alt="Product"
                    fill
                    className={styles.modalImg}
                  />
                ) : (
                  <div className={styles.modalImgPlaceholder}>
                    <PhotoIcon width={32} height={32} />
                    <span>Click to upload product photo</span>
                    <span className={styles.modalImgHint}>JPG, PNG, WebP · Max 4MB</span>
                  </div>
                )}
                {isUploading && (
                  <div className={styles.modalImgSpinner}>
                    <ArrowPathIcon width={22} height={22} className={styles.spin} />
                  </div>
                )}
                {form.imageUrl && !isUploading && (
                  <div className={styles.modalImgChangeOverlay}>
                    <PhotoIcon width={16} height={16} />
                    <span>Change photo</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={handleImageUpload}
              />
              {uploadError && <p className={styles.uploadErr}>{uploadError}</p>}

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
