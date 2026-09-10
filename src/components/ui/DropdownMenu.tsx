"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
  // Viewport coordinates for the portalled menu. Null until measured, so the
  // menu never paints at 0,0 for a frame before being placed.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
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
      const target = e.target as Node
      // The menu lives on <body> now, so it is NOT inside wrapRef — without the
      // second test every menu click would count as an outside click and close
      // the menu before the item's own handler ran.
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open, close])

  // The menu renders in a portal on <body> because its natural parent is a
  // table with `overflow-x: auto` for narrow screens — and a scroll container
  // clips absolutely-positioned children on BOTH axes (per spec, setting one
  // axis to auto forces the other from visible to auto). Positioning is
  // therefore viewport-relative and measured from the trigger.
  useLayoutEffect(() => {
    // No reset on close — the menu is unmounted then, and this effect runs
    // before paint on the next open, so a stale position is never visible.
    if (!open) return
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const menuHeight = menu?.offsetHeight ?? 0
    const menuWidth = menu?.offsetWidth ?? 210
    const GAP = 4
    const MARGIN = 8

    // Flip above the trigger when there isn't room below — otherwise the last
    // row's menu opens off the bottom of the window.
    const roomBelow = window.innerHeight - rect.bottom
    const flip = menuHeight > 0 && roomBelow < menuHeight + GAP + MARGIN
    const top = flip ? rect.top - menuHeight - GAP : rect.bottom + GAP

    // Right-aligned to the trigger, clamped so it can't leave the viewport.
    const left = Math.max(MARGIN, Math.min(
      rect.right - menuWidth,
      window.innerWidth - menuWidth - MARGIN
    ))

    setPos({ top, left })
  }, [open])

  // Fixed coordinates stop matching the trigger the moment anything scrolls, so
  // close instead of chasing it. Capture phase catches scrolls in the table
  // wrapper and any other ancestor, not just the window.
  useEffect(() => {
    if (!open) return
    const onScroll = () => close(false)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
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

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            id={menuId}
            role="menu"
            // No onKeyDown here: React propagates events through the component
            // tree rather than the DOM tree, so keystrokes inside the portal
            // already reach the wrapper's handler. A second one would step the
            // active index twice per arrow press.
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              // Hidden until measured, so it can't flash in the wrong place.
              visibility: pos ? "visible" : "hidden",
            }}
          >
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
          </div>,
          document.body
        )}
    </div>
  )
}
