import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Self-contained server bundle, so the Docker runtime stage can ship without
  // node_modules. Set only by Dockerfile.frontend — Vercel needs the default
  // output, so this must stay opt-in rather than unconditional.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Blog articles are read from disk at request time, which the bundler cannot
  // see. Without this the standalone image ships with no articles and every
  // blog post fails.
  outputFileTracingIncludes: {
    "/blog/[slug]": ["./src/content/blog/**/*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "uploadthing.com",
      },
      {
        protocol: "https",
        hostname: "**.ufs.sh",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      // WhatsApp profile-picture CDNs — used when the auto-imported profile
      // photo falls back to the raw WhatsApp URL (e.g. Supabase rehost
      // bucket missing). Covers both pps. and mmg. variants WhatsApp serves.
      {
        protocol: "https",
        hostname: "pps.whatsapp.net",
      },
      {
        protocol: "https",
        hostname: "**.whatsapp.net",
      },
      // Supabase Storage public URLs — used when the profile picture is
      // successfully re-hosted to our own bucket.
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
}

export default nextConfig
