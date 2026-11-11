"use client"
import { useEffect, useState } from "react"

const TYPE_MS = 70
const DELETE_MS = 35
const HOLD_MS = 2200

const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
}

// Types each phrase, holds it, deletes it, moves to the next. The full first
// phrase is in the server HTML (and stays put under reduced motion), so the
// headline reads correctly before hydration and for screen readers.
export function TypedWord({ words, className, caretClassName }: { words: string[]; className?: string; caretClassName?: string }) {
  const [index, setIndex] = useState(0)
  const [length, setLength] = useState(words[0].length)
  const [deleting, setDeleting] = useState(false)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    setAnimate(!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    if (!animate) return
    const word = words[index]
    let delay = deleting ? DELETE_MS : TYPE_MS
    if (!deleting && length === word.length) delay = HOLD_MS

    const timer = setTimeout(() => {
      if (!deleting && length === word.length) setDeleting(true)
      else if (deleting && length === 0) {
        setDeleting(false)
        setIndex((i) => (i + 1) % words.length)
      } else setLength((l) => l + (deleting ? -1 : 1))
    }, delay)
    return () => clearTimeout(timer)
  }, [animate, deleting, index, length, words])

  return (
    <>
      <span style={VISUALLY_HIDDEN}>{words[0]}</span>
      <span className={className} aria-hidden="true">
        {words[index].slice(0, length)}
        <span className={caretClassName} />
      </span>
    </>
  )
}
