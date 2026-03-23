import React from "react"
import styles from "@/app/(marketing)/blog/[slug]/page.module.css"

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Handle **bold**, *italic*, and [link](url)
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className={styles.strong}>{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={match.index}>{match[3]}</em>)
    } else if (match[4] && match[5]) {
      const isExternal = match[5].startsWith("http")
      parts.push(
        <a
          key={match.index}
          href={match[5]}
          className={styles.a}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
        >
          {match[4]}
        </a>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

export function renderMarkdown(markdown: string): React.ReactNode[] {
  const lines = markdown.split("\n")
  const nodes: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines
    if (line.trim() === "") { i++; continue }

    // HR
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={key++} className={styles.hr} />)
      i++; continue
    }

    // H3 (### ) -> h2 in prose
    if (line.startsWith("### ")) {
      nodes.push(<h2 key={key++} className={styles.h2}>{parseInline(line.slice(4))}</h2>)
      i++; continue
    }

    // H4 (#### ) -> h3
    if (line.startsWith("#### ")) {
      nodes.push(<h3 key={key++} className={styles.h3}>{parseInline(line.slice(5))}</h3>)
      i++; continue
    }

    // H5 (#####) -> h4
    if (line.startsWith("##### ")) {
      nodes.push(<h4 key={key++} className={styles.h4}>{parseInline(line.slice(6))}</h4>)
      i++; continue
    }

    // Unordered list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: React.ReactNode[] = []
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(<li key={i} className={styles.li}>{parseInline(lines[i].slice(2))}</li>)
        i++
      }
      nodes.push(<ul key={key++} className={styles.ul}>{items}</ul>)
      continue
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i} className={styles.li}>{parseInline(lines[i].replace(/^\d+\. /, ""))}</li>)
        i++
      }
      nodes.push(<ol key={key++} className={styles.ol}>{items}</ol>)
      continue
    }

    // Blockquote
    if (line.startsWith("> ")) {
      nodes.push(
        <blockquote key={key++} className={styles.blockquote}>
          <p className={styles.p}>{parseInline(line.slice(2))}</p>
        </blockquote>
      )
      i++; continue
    }

    // Paragraph (skip italic-only lines that are image captions)
    if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      i++; continue
    }

    // Regular paragraph - collect multi-line
    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !lines[i].startsWith("- ") && !lines[i].startsWith("* ") && !/^\d+\. /.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !lines[i].startsWith(">")) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      nodes.push(<p key={key++} className={styles.p}>{parseInline(paraLines.join(" "))}</p>)
    }
  }

  return nodes
}
