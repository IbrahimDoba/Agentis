import React from "react"

// Minimal markdown renderer specifically for the dashboard guide pages.
// Emits plain HTML elements (no className) and lets the parent .body CSS
// style them via descendant selectors. Supports headings (### / ####),
// paragraphs, ordered / unordered lists, bold / italic / inline code /
// links, blockquotes, horizontal rules, and pipe-syntax tables.
//
// We don't reuse src/lib/markdown.tsx because that one is hard-wired to
// the blog stylesheet and doesn't support tables.

function parseInline(text: string, baseKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Order matters: code before bold/italic before links so we don't
  // mis-tokenise nested markup.
  const regex = /(`([^`]+)`|\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const k = `${baseKey}-${i++}`
    if (match[2]) {
      parts.push(<code key={k}>{match[2]}</code>)
    } else if (match[3]) {
      parts.push(<strong key={k}>{match[3]}</strong>)
    } else if (match[4]) {
      parts.push(<em key={k}>{match[4]}</em>)
    } else if (match[5] && match[6]) {
      const isExternal = match[6].startsWith("http")
      parts.push(
        <a
          key={k}
          href={match[6]}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
        >
          {match[5]}
        </a>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function isTableSeparator(line: string): boolean {
  // | --- | --- | or |---|---| etc.
  return /^\s*\|?\s*(:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line)
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\||\|$/g, "")
  return trimmed.split("|").map((c) => c.trim())
}

export function renderGuideMarkdown(markdown: string): React.ReactNode[] {
  const lines = markdown.split("\n")
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip blank lines
    if (line.trim() === "") {
      i++
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key++} />)
      i++
      continue
    }

    // Headings
    if (line.startsWith("### ")) {
      out.push(<h2 key={key++}>{parseInline(line.slice(4), key)}</h2>)
      i++
      continue
    }
    if (line.startsWith("#### ")) {
      out.push(<h3 key={key++}>{parseInline(line.slice(5), key)}</h3>)
      i++
      continue
    }

    // Tables (header line, separator line, then body rows)
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[i]))
        i++
      }
      out.push(
        <table key={key++}>
          <thead>
            <tr>
              {headers.map((h, hi) => (
                <th key={hi}>{parseInline(h, key * 100 + hi)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>{parseInline(c, key * 100 + ri * 10 + ci)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
      continue
    }

    // Unordered lists
    if (/^\s*[-*]\s/.test(line)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        items.push(
          <li key={i}>{parseInline(lines[i].replace(/^\s*[-*]\s/, ""), key++)}</li>
        )
        i++
      }
      out.push(<ul key={key++}>{items}</ul>)
      continue
    }

    // Ordered lists
    if (/^\s*\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(
          <li key={i}>{parseInline(lines[i].replace(/^\s*\d+\.\s/, ""), key++)}</li>
        )
        i++
      }
      out.push(<ol key={key++}>{items}</ol>)
      continue
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2))
        i++
      }
      out.push(
        <blockquote key={key++}>
          <p>{parseInline(buf.join(" "), key++)}</p>
        </blockquote>
      )
      continue
    }

    // Paragraph (collect consecutive non-blank, non-special lines)
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim()) &&
      !lines[i].startsWith(">") &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      out.push(<p key={key++}>{parseInline(paraLines.join(" "), key++)}</p>)
    }
  }

  return out
}
