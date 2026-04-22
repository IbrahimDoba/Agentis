import mammoth from "mammoth"
import { PDFParse } from "pdf-parse"


/**
 * Extract plain text from a file buffer based on MIME type.
 * Supports: text/plain, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === "application/pdf") {
        const parser = new PDFParse({ data: buffer })
        try {
            const data = await parser.getText()
            return data.text ?? ""
        } finally {
            await parser.destroy().catch(() => {})
        }
    }

    if (
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mimeType === "application/msword"
    ) {
        const result = await mammoth.extractRawText({ buffer })
        return result.value
    }

    // Plain text / markdown — just decode
    return buffer.toString("utf-8")
}

export const SUPPORTED_MIME_TYPES = [
    "text/plain",
    "text/markdown",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
]
