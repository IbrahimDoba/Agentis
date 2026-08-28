/**
 * WhatsApp's linkifier swallows sentence punctuation sitting flush against a
 * URL, so "see https://wa.me/c/234. Check it out" becomes a link ending in "."
 * that resolves to nothing. Detach the two: mid-message the punctuation becomes
 * a newline, which reads naturally and terminates the link; at the very end of
 * a message it is simply dropped, since there is nothing left to punctuate.
 *
 * Only fires when the punctuation is followed by whitespace or end-of-text, so
 * dots inside a URL ("wa.me", "file.pdf") are left alone.
 */
export function detachUrlPunctuation(text: string): string {
  return text.replace(
    /((?:https?:\/\/|www\.)[^\s]*?)([.,!?;:]+)(\s+|$)/gi,
    (_match, url: string, _punct: string, trailing: string) => {
      if (!trailing) return url
      return trailing.includes("\n") ? `${url}${trailing}` : `${url}\n`
    }
  )
}
