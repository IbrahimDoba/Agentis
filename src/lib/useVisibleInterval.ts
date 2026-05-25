import { useEffect, useRef } from "react"

/**
 * Run `callback` every `intervalMs`, but ONLY while the document is visible
 * AND `enabled` is true. Pauses when the tab is hidden (visibilitychange) and
 * resumes when it returns to the foreground.
 *
 * Replaces blind `setInterval` pollers that keep hitting the DB even when the
 * tab is backgrounded or the work being polled for has finished (pass
 * `enabled` to gate on "is there anything worth polling for").
 */
export function useVisibleInterval(
  callback: () => void,
  intervalMs: number,
  enabled = true
): void {
  // Keep the latest callback without restarting the interval each render.
  const savedCallback = useRef(callback)
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) return

    let handle: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (handle !== null) return
      handle = setInterval(() => savedCallback.current(), intervalMs)
    }
    const stop = () => {
      if (handle !== null) {
        clearInterval(handle)
        handle = null
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") start()
      else stop()
    }

    // Only start if currently visible.
    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [intervalMs, enabled])
}
