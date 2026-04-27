import type { Metadata } from "next"

const BASE_URL = "https://dailzero.com"

interface SolutionMetadataInput {
  title: string
  description: string
  slug: string
  ogImage: string
  ogImageAlt: string
  keywords: string[]
}

export function solutionMetadata({
  title,
  description,
  slug,
  ogImage,
  ogImageAlt,
  keywords,
}: SolutionMetadataInput): Metadata {
  const url = `${BASE_URL}/solutions/${slug}`
  const fullTitle = `${title} | D-Zero AI`

  return {
    title: fullTitle,
    description,
    keywords: [
      "WhatsApp AI",
      "WhatsApp automation",
      "AI agent",
      "D-Zero AI",
      ...keywords,
    ],
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: "D-Zero AI",
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1600,
          height: 900,
          alt: ogImageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [ogImage],
    },
  }
}
