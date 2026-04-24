/**
 * Voice note transcription via OpenAI Whisper.
 *
 * Designed to be provider-swappable: if we move to Deepgram, AssemblyAI, etc.
 * in the future, only this file needs to change.
 */

import { downloadMediaMessage } from "@whiskeysockets/baileys"
import type { WAMessage } from "@whiskeysockets/baileys"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "transcribe" })

export interface TranscribeResult {
  text: string
  durationSeconds: number
}

export async function transcribeVoiceNote(
  msg: WAMessage,
  openaiApiKey: string
): Promise<TranscribeResult> {
  const durationSeconds = msg.message?.audioMessage?.seconds ?? 0

  logger.debug({ durationSeconds }, "Downloading voice note for transcription")

  const buffer = await downloadMediaMessage(msg, "buffer", {}) as Buffer

  // WhatsApp voice notes are ogg/opus — Whisper supports this natively
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/ogg" })
  formData.append("file", blob, "voice.ogg")
  formData.append("model", "whisper-1")
  formData.append("response_format", "json")

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiApiKey}` },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => "")
    throw new Error(`Whisper API ${res.status}: ${err}`)
  }

  const data = (await res.json()) as { text: string }
  logger.debug({ durationSeconds, preview: data.text.slice(0, 60) }, "Transcription complete")

  return { text: data.text.trim(), durationSeconds }
}
