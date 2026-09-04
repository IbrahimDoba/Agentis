/**
 * Chunker — splits a document into retrievable chunks along its own structure.
 *
 * This used to do `text.split(/\s+/)` and rejoin with spaces, which destroyed
 * every newline, then cut at a fixed word count. It was deliberately frozen:
 * 1,867 live chunks came from it and there was no way to re-index them.
 *
 * It was changed because that behaviour was producing false answers to real
 * customers. One agent's knowledge base described three locations, one worked
 * example each. Flattened, a single chunk held all three, and the agent told a
 * customer "our office in Abuja is <the Lagos address>" — then apologised and
 * said there was no Abuja office. The document was correct; the chunk was not.
 *
 * The freeze came with a re-index endpoint (POST /v1/documents/:id/reindex), so
 * existing documents can be rebuilt rather than left on the old behaviour.
 */

const HEADING_LINE = /^\s{0,3}#{1,6}\s+\S/
/** Authors write pseudo-headings in bold far more often than with #. */
const BOLD_HEADING_LINE = /^\*\*[^*\n]{1,100}\*\*:?$/
const RULE_LINE = /^\s{0,3}([-*_])\1{2,}\s*$/

function isHeadingLine(line: string): boolean {
    const t = line.trim()
    return HEADING_LINE.test(t) || BOLD_HEADING_LINE.test(t)
}

/**
 * Split plain text into blocks on the boundaries the author already put there:
 * headings, horizontal rules and blank lines. Consecutive non-blank lines stay
 * together so a markdown table is not torn apart row from header.
 */
export function textToBlocks(text: string): string[] {
    const lines = text.replace(/\r\n/g, "\n").split("\n")
    const blocks: string[] = []
    let buf: string[] = []

    const flush = () => {
        const body = buf.join("\n").trim()
        buf = []
        if (body) blocks.push(body)
    }

    for (const line of lines) {
        if (isHeadingLine(line)) {
            flush()
            blocks.push(line.trim())
            continue
        }
        if (RULE_LINE.test(line) || !line.trim()) {
            flush()
            continue
        }
        buf.push(line)
    }
    flush()
    return blocks
}

/** Split text into chunks that respect its structure. */
export function chunkText(text: string): string[] {
    const normalized = text.replace(/\r\n/g, "\n").trim()
    if (!normalized) return []
    return chunkStructuredText(textToBlocks(normalized))
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
    return /^#{1,3}\s/.test(block) || /^\*\*[^*\n]{1,100}\*\*:?$/.test(block.trim())
}

/**
 * How deep a heading sits. Markdown depth for `#`, and bold pseudo-headings sit
 * at a single consistent level so two of them read as siblings.
 */
function headingDepth(block: string): number {
    const m = /^(#{1,6})\s/.exec(block.trim())
    return m ? m[1]!.length : 3
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
    // Depth of the heading that opened the current chunk. A sibling or
    // higher-level heading starts a new one; a subsection may continue this one.
    let openDepth = Infinity

    const flush = () => {
        if (current.length === 0) return
        const prefix = [pageTitle, heading].filter(Boolean).join("\n")
        chunks.push(prefix ? `${prefix}\n\n${current.join("\n")}` : current.join("\n"))
        current = []
        currentWords = 0
        openDepth = Infinity
    }

    for (const block of clean) {
        if (isHeading(block)) {
            const depth = headingDepth(block)
            // Two sibling sections must not share a chunk. Flattened together,
            // one agent's Lagos, Ogun and Abuja sections became a single blob
            // and it answered with the wrong city's address.
            if (current.length > 0 && depth <= openDepth) flush()
            heading = block
            openDepth = Math.min(openDepth, depth)
        }

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
