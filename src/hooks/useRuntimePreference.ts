"use client"

import { useEffect, useState } from "react"

export type RuntimePreference = "orchestrator" | "elevenlabs"

const STORAGE_KEY = "dzero.dashboard.runtimePreference"

export function useRuntimePreference(defaultRuntime: RuntimePreference = "orchestrator") {
  const [runtime, setRuntimeState] = useState<RuntimePreference>(defaultRuntime)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === "orchestrator" || stored === "elevenlabs") {
        setRuntimeState(stored)
      }
    } finally {
      setHydrated(true)
    }
  }, [])

  const setRuntime = (next: RuntimePreference) => {
    setRuntimeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Best effort persistence.
    }
  }

  return { runtime, setRuntime, hydrated }
}
