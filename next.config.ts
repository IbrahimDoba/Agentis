import type { NextConfig } from "next"

const nextConfig: NextConfig = {
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
