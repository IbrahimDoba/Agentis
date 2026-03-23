"use client"

import { forwardRef, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, useState } from "react"
import styles from "./Input.module.css"
import { cn } from "@/lib/utils"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, required, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-")
    const isPassword = props.type === "password"
    const [showPassword, setShowPassword] = useState(false)

    return (
      <div className={styles.group}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <div className={styles.inputWrapper}>
          <input
            ref={ref}
            id={inputId}
            className={cn(styles.input, isPassword && styles.inputWithToggle, error ? styles.inputError : undefined, className)}
            {...props}
            type={isPassword ? (showPassword ? "text" : "password") : props.type}
          />
          {isPassword && (
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          )}
        </div>
        {error && <span className={styles.error}>{error}</span>}
        {hint && !error && <span className={styles.hint}>{hint}</span>}
      </div>
    )
  }
)

Input.displayName = "Input"

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, required, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-")
    return (
      <div className={styles.group}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(styles.input, styles.textarea, error ? styles.inputError : undefined, className)}
          {...props}
        />
        {error && <span className={styles.error}>{error}</span>}
        {hint && !error && <span className={styles.hint}>{hint}</span>}
      </div>
    )
  }
)

Textarea.displayName = "Textarea"

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, required, options, placeholder, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-")
    return (
      <div className={styles.group}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={cn(styles.input, error ? styles.inputError : undefined, className)}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <span className={styles.error}>{error}</span>}
        {hint && !error && <span className={styles.hint}>{hint}</span>}
      </div>
    )
  }
)

Select.displayName = "Select"

export default Input
