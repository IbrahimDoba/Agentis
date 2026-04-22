/**
 * Chunker — splits plain text into overlapping ~400 token chunks.
 *
 * Uses a word-count heuristic: 1 token ≈ 0.75 words.
 * Target: 400 tokens (~533 words) with 50-token (~67 word) overlap.
 */

const TARGET_WORDS = 533   // ~400 tokens
const OVERLAP_WORDS = 67   // ~50 tokens

/**
 * Split text into overlapping chunks.
 * Returns an array of chunk content strings.
 */
export function chunkText(text: string): string[] {
    // Normalize whitespace
    const normalized = text.replace(/\r\n/g, "\n").trim()
    if (!normalized) return []

    // Split into words preserving newlines as separators
    const words = normalized.split(/\s+/).filter(Boolean)
    if (words.length === 0) return []

    const chunks: string[] = []
    let start = 0

    while (start < words.length) {
        const end = Math.min(start + TARGET_WORDS, words.length)
        const chunkWords = words.slice(start, end)
        chunks.push(chunkWords.join(" "))

        if (end >= words.length) break
        start = end - OVERLAP_WORDS
    }

    return chunks
}
