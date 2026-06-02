import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { accountPasswordSchema } from "@/lib/validations"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = accountPasswordSchema.safeParse(body)

    if (!parsed.success) {
      const errors: Record<string, string> = {}
      parsed.error.issues.forEach((err) => {
        const field = err.path[0] as string
        errors[field] = err.message
      })
      return NextResponse.json({ errors }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true },
    })

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const { currentPassword, newPassword } = parsed.data

    if (user.passwordHash) {
      if (!currentPassword) {
        return NextResponse.json(
          { errors: { currentPassword: "Current password is required" } },
          { status: 400 }
        )
      }

      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!isCurrentPasswordValid) {
        return NextResponse.json(
          { errors: { currentPassword: "Current password is incorrect" } },
          { status: 400 }
        )
      }

      const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash)
      if (isSamePassword) {
        return NextResponse.json(
          { errors: { newPassword: "Choose a new password different from your current one" } },
          { status: 400 }
        )
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    return NextResponse.json({ success: true, hasPassword: true })
  } catch (error) {
    console.error("[POST /api/me/password]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
