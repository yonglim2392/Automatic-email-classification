import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { reassignTask } from "@/lib/services/tasks"
import { sendAssignmentNotification } from "@/lib/services/notify"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { taskId, newAssigneeId } = await request.json()
  await reassignTask(taskId, newAssigneeId)

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: true },
  })
  if (task) {
    try {
      await sendAssignmentNotification(
        task.id,
        task.assignee.email,
        task.assignee.id,
        task.title,
        task.deadline,
      )
    } catch { /* 알림 실패해도 재배정은 완료 */ }
  }

  return NextResponse.json({ ok: true })
}
