import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { v2 as cloudinary } from "cloudinary"

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const kind = String(formData.get("kind") ?? "")

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`

    // Logos must keep their aspect ratio (don't face-crop them); profile photos
    // get the square face-gravity crop.
    const isLogo = kind === "logo"
    const result = await cloudinary.uploader.upload(base64, {
      folder: isLogo ? "agentis/logos" : "agentis/profiles",
      transformation: isLogo
        ? [{ width: 512, height: 512, crop: "limit" }]
        : [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
    })

    return NextResponse.json({ url: result.secure_url })
  } catch (error) {
    console.error("[POST /api/upload]", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
