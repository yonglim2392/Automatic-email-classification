import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { completeTask, checkAllTasksDone } from "@/lib/services/tasks"
import { writeSummaryEmail } from "@/lib/services/claude"
import { sendEmail } from "@/lib/services/gmail"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { taskId, completionNote } = await request.json()

  await completeTask(taskId, session.user.id, completionNote ?? null)

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { email: true },
  })
  if (!task) return NextResponse.json({ ok: true })

  const allDone = await checkAllTasksDone(task.emailId)
  if (allDone) {
    const doneTasks = await prisma.task.findMany({
      where: { emailId: task.emailId },
      select: { title: true, completionNote: true, completedAt: true },
    })
    const summary = await writeSummaryEmail(
      task.email.subject,
      task.email.body,
      doneTasks as { title: string; completionNote: string | null; completedAt: Date }[],
    )
    await sendEmail(task.email.from, summary.subject, summary.body)
  }

  return NextResponse.json({ ok: true, allDone })
}
