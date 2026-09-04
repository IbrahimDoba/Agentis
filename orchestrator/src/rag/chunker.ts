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

// ---------------------------------------------------------------------------
// Structured (web page) chunking
// ---------------------------------------------------------------------------
//
// chunkText above is left exactly as it is: 1,867 live chunks were produced by
// its current behaviour and there is no re-index path, so changing it would
// silently shift retrieval for every existing agent with no way back.
//
// Web pages need different treatment. They arrive as discrete blocks (headings,
// paragraphs, list items) and that structure is the useful part — a price
// sitting under "## Delivery" is findable, the same price in a wall of text is
// not. So: pack whole blocks, never split one that fits, and stamp every chunk
// with the page title and the heading it sits under.

const STRUCTURED_TARGET_WORDS = 450
/** One block of overlap, capped so a long block does not dominate the next chunk. */
const STRUCTURED_OVERLAP_WORDS = 60

function words(s: string): number {
    return s.split(/\s+/).filter(Boolean).length
}

function isHeading(block: string): boolean {
    return /^#{1,3}\s/.test(block)
}

/**
 * Chunk one page's blocks. `pageTitle` and the nearest preceding heading are
 * prepended to every chunk, which is the single biggest retrieval win for web
 * content: a chunk from the middle of a pricing page otherwise carries no
 * lexical anchor at all and never matches "how much is delivery".
 */
export function chunkStructuredText(blocks: string[], pageTitle = ""): string[] {
    const clean = blocks.map((b) => b.trim()).filter(Boolean)
    if (clean.length === 0) return []

    const chunks: string[] = []
    let current: string[] = []
    let currentWords = 0
    let heading = ""

    const flush = () => {
        if (current.length === 0) return
        const prefix = [pageTitle, heading].filter(Boolean).join("\n")
        chunks.push(prefix ? `${prefix}\n\n${current.join("\n")}` : current.join("\n"))
        current = []
        currentWords = 0
    }

    for (const block of clean) {
        if (isHeading(block)) heading = block

        const w = words(block)

        // A single block over the target still becomes its own chunk rather than
        // being cut mid-sentence; only a genuinely huge one is split.
        if (w > STRUCTURED_TARGET_WORDS * 2) {
            flush()
            for (const piece of splitLongBlock(block)) {
                const prefix = [pageTitle, heading].filter(Boolean).join("\n")
                chunks.push(prefix ? `${prefix}\n\n${piece}` : piece)
            }
            continue
        }

        if (currentWords + w > STRUCTURED_TARGET_WORDS && current.length > 0) {
            const tail = current[current.length - 1]
            flush()
            // Carry one block of context forward, unless it is large enough to
            // crowd out the new chunk.
            if (words(tail) <= STRUCTURED_OVERLAP_WORDS && !isHeading(tail)) {
                current = [tail]
                currentWords = words(tail)
            }
        }

        current.push(block)
        currentWords += w
    }

    flush()
    return chunks
}

/** Split an oversized block at sentence boundaries. */
function splitLongBlock(block: string): string[] {
    const sentences = block.split(/(?<=[.!?])\s+/)
    const out: string[] = []
    let buf: string[] = []
    let n = 0
    for (const s of sentences) {
        const w = words(s)
        if (n + w > STRUCTURED_TARGET_WORDS && buf.length > 0) {
            out.push(buf.join(" "))
            buf = []
            n = 0
        }
        buf.push(s)
        n += w
    }
    if (buf.length > 0) out.push(buf.join(" "))
    return out
}
