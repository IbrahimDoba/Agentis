"use client"

import { forwardRef, ButtonHTMLAttributes } from "react"
import styles from "./Button.module.css"
import { cn } from "@/lib/utils"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md" | "lg"
  fullWidth?: boolean
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      disabled,
      children,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          styles.btn,
          styles[variant],
          styles[size],
          fullWidth ? styles.fullWidth : undefined,
          loading ? styles.loading : undefined,
          className
        )}
        {...props}
      >
        {loading && <span className={styles.spinner} />}
        {children}
      </button>
    )
  }
)

Button.displayName = "Button"

export default Button
