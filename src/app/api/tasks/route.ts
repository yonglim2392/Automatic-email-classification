import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tasks = await prisma.task.findMany({
    include: {
      email: { select: { id: true, from: true, subject: true, receivedAt: true, status: true, summarySubject: true, summaryBody: true } },
      assignee: { select: { name: true } },
      attachments: { orderBy: { uploadedAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  })

  if (session.user.role === "admin") return NextResponse.json(tasks)

  // 일반 사용자: 본인이 primary 또는 co-assignee인 태스크만
  const userId = session.user.id
  const filtered = tasks.filter(t => {
    if (t.assigneeId === userId) return true
    const coIds: string[] = JSON.parse(t.coAssigneeIds ?? "[]")
    return coIds.includes(userId)
  })

  return NextResponse.json(filtered)
}
