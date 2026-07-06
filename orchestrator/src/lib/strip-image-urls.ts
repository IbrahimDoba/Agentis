// Remove raw image URLs (and markdown-image wrappers) from text.
//
// Models like gpt-4o-mini keep surfacing the `imageUrl` a product tool returns —
// pasting it as a markdown image (`![alt](url)` or a botched `!https://…`) that
// WhatsApp renders as ugly, unclickable text. No reply should ever carry a raw
// image-file URL (images are SENT as images, never pasted), so we strip them:
//  - from a tool RESULT before the model sees it (so it can't paste it, and works
//    off the product slug for the page link instead), and
//  - from the final REPLY as a hard guarantee.
//
// Non-image links (product pages, payment links, wa.me, etc.) are left intact —
// only image-file URLs and the product image CDN host are removed.

const IMG_EXT = "webp|jpe?g|png|gif|avif|bmp|svgz?|tiff?|heic"
// URL characters excluding delimiters/quotes, so a match stops at the URL's end
// (e.g. the closing quote inside a JSON tool result).
const U = "[^\\s\"'<>)\\]}]"

const MD_IMAGE = /!\[[^\]]*\]\([^)]*\)/g // ![alt](url)
const BANG_BEFORE_URL = /!(?=https?:\/\/)/gi // a lone "!" right before a URL
const IMG_FILE_URL = new RegExp(`https?:\\/\\/${U}+\\.(?:${IMG_EXT})(?:\\?${U}*)?`, "gi")
const IMG_CDN_HOST = new RegExp(`https?:\\/\\/pub-[a-z0-9]+\\.r2\\.dev\\/${U}+`, "gi")

export function stripImageUrls(text: string): string {
  if (!text) return text
  return text
    .replace(MD_IMAGE, "")
    .replace(BANG_BEFORE_URL, "")
    .replace(IMG_FILE_URL, "")
    .replace(IMG_CDN_HOST, "")
    // tidy up whitespace left where a URL (often on its own line) used to be
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
