/**
 * Voice synthesis — stub for future "reply with voice note" feature.
 *
 * When we're ready to implement this, this file will call ElevenLabs / OpenAI TTS
 * and return an audio buffer that the worker can send via sock.sendMessage().
 */

export interface SynthesizeOptions {
  text: string
  agentId: string
  // voice?: string  — add when provider is chosen
}

export async function synthesizeReply(_options: SynthesizeOptions): Promise<Buffer> {
  throw new Error("Voice synthesis not yet implemented")
}
