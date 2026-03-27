"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Loader2, Package } from "lucide-react"
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
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleAdd = () => {
    if (!form.name.trim()) return
    const product: Product = { id: nanoid(), ...form }
    onChange([...value, product])
    setForm(EMPTY_FORM)
    setAddingNew(false)
  }

  const handleEditStart = (product: Product) => {
    setEditingId(product.id)
    setAddingNew(false)
    setForm({
      name: product.name,
      description: product.description ?? "",
      price: product.price ?? "",
      link: product.link ?? "",
      imageUrl: product.imageUrl ?? "",
    })
  }

  const handleEditSave = () => {
    if (!form.name.trim()) return
    onChange(value.map((p) => p.id === editingId ? { ...p, ...form } : p))
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleDelete = (id: string) => {
    onChange(value.filter((p) => p.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const handleCancel = () => {
    setEditingId(null)
    setAddingNew(false)
    setForm(EMPTY_FORM)
    setUploadError("")
  }

  const productForm = (onSave: () => void) => (
    <div className={styles.inlineForm}>
      <div className={styles.imageRow}>
        <div
          className={styles.imagePicker}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          {form.imageUrl ? (
            <Image src={form.imageUrl} alt="Product" width={56} height={56} className={styles.productImg} />
          ) : (
            <Package size={20} className={styles.imgPlaceholderIcon} />
          )}
          {isUploading && <div className={styles.imgSpinner}><Loader2 size={16} className={styles.spin} /></div>}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handleImageUpload} />
        <div className={styles.imageHint}>
          {isUploading ? "Uploading…" : "Click to add photo (optional)"}
          {uploadError && <span className={styles.uploadErr}>{uploadError}</span>}
        </div>
      </div>
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
        placeholder="Short product description…"
      />
      <Input
        label="Link (optional)"
        name="link"
        value={form.link}
        onChange={handleFieldChange}
        placeholder="https://yourstore.com/product"
      />
      <div className={styles.formActions}>
        <button type="button" className={styles.saveBtn} onClick={onSave} disabled={!form.name.trim() || isUploading}>
          Save
        </button>
        <button type="button" className={styles.cancelBtn} onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>Products</span>
          {value.length > 0 && (
            <span className={styles.badge}>{value.length}</span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className={styles.body}>
          {value.length === 0 && !addingNew && (
            <div className={styles.empty}>No products added yet.</div>
          )}

          {value.map((product) => (
            <div key={product.id} className={styles.productRow}>
              <div className={styles.productMeta}>
                <div className={styles.productThumb}>
                  {product.imageUrl ? (
                    <Image src={product.imageUrl} alt={product.name} width={36} height={36} className={styles.thumbImg} />
                  ) : (
                    <div className={styles.thumbFallback}>{product.name[0]?.toUpperCase()}</div>
                  )}
                </div>
                <div className={styles.productInfo}>
                  <span className={styles.productName}>{product.name}</span>
                  {product.price && <span className={styles.productPrice}>{product.price}</span>}
                </div>
              </div>
              <div className={styles.productActions}>
                <button type="button" className={styles.iconBtn} onClick={() => handleEditStart(product)}>
                  <Pencil size={14} />
                </button>
                <button type="button" className={styles.iconBtnDanger} onClick={() => handleDelete(product.id)}>
                  <Trash2 size={14} />
                </button>
              </div>

              {editingId === product.id && productForm(handleEditSave)}
            </div>
          ))}

          {addingNew && productForm(handleAdd)}

          {!addingNew && editingId === null && (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => { setAddingNew(true); setEditingId(null) }}
            >
              <Plus size={14} /> Add Product
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ProductsEditor
