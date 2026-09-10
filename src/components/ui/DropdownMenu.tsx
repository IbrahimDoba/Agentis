"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import styles from "./DropdownMenu.module.css"

export interface DropdownItem {
  label: string
  onSelect: () => void
  /** Renders in the danger colour and sits below a divider. */
  destructive?: boolean
  /** Shows the ↗ affordance for items that leave the app. */
  external?: boolean
  disabled?: boolean
}

interface DropdownMenuProps {
  items: DropdownItem[]
  /** Accessible name for the trigger — each row needs its own. */
  label: string
}

// Overflow ("⋯") menu. Written rather than pulled from a library because the
// only other menus in the product are native <select>s, and one file of focus
// handling is cheaper than a dependency plus its styling overrides.
export function DropdownMenu({ items, label }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()

  const close = useCallback((refocus = true) => {
    setOpen(false)
    setActiveIndex(-1)
    if (refocus) triggerRef.current?.focus()
  }, [])

  // Pointer-down rather than click: a click listener fires after the menu has
  // already re-rendered, which lets a menu item's own handler run and then
  // immediately be treated as an outside click.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open, close])

  // Move focus onto the menu once it opens so arrow keys and Escape work
  // without the user having to click into it first.
  useEffect(() => {
    if (open && activeIndex >= 0) itemRefs.current[activeIndex]?.focus()
  }, [open, activeIndex])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation()
      close()
      return
    }
    if (!open) return
    const last = items.length - 1
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => (i >= last ? 0 : i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? last : i - 1))
    } else if (e.key === "Home") {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === "End") {
      e.preventDefault()
      setActiveIndex(last)
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => {
          setOpen((o) => !o)
          setActiveIndex(-1)
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="3" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="13" cy="8" r="1.4" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className={styles.menu} id={menuId} role="menu">
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`${styles.item} ${item.destructive ? styles.destructive : ""}`}
              onClick={() => {
                item.onSelect()
                close()
              }}
            >
              <span>{item.label}</span>
              {item.external && (
                <span className={styles.external} aria-hidden="true">
                  ↗
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
