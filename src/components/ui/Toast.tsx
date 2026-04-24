"use client"

import { CheckCircleIcon, XCircleIcon, XMarkIcon } from "@heroicons/react/24/outline"
import styles from "./Toast.module.css"
import type { ToastType } from "@/context/ToastContext"

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastStackProps {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null
  return (
    <div className={styles.stack}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
          {toast.type === "success" ? (
            <CheckCircleIcon width={18} height={18} className={styles.icon} />
          ) : (
            <XCircleIcon width={18} height={18} className={styles.icon} />
          )}
          <span className={styles.message}>{toast.message}</span>
          <button className={styles.close} onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <XMarkIcon width={15} height={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
