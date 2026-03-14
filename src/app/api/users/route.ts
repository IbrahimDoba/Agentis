import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { agents: true } },
      },
    })

    const safeUsers = (users as any[]).map((user: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...u } = user
      return {
        ...u,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      }
    })

    return NextResponse.json(safeUsers)
  } catch (error) {
    console.error("[GET /api/users]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
