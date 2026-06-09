import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const where = session.user.role === "admin" ? {} : { assigneeId: session.user.id }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      email: { select: { id: true, from: true, subject: true, receivedAt: true, status: true } },
      assignee: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(tasks)
}
