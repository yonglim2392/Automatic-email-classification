import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { listNewEmails } from "@/lib/services/gmail"
import { parseEmail } from "@/lib/services/claude"
import { assignTasks } from "@/lib/services/routing"
import { createTasksFromEmail } from "@/lib/services/tasks"
import { sendAssignmentNotification } from "@/lib/services/notify"

export async function POST() {
  const session = await auth()
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const processedEmails = await prisma.email.findMany({ select: { gmailId: true } })
  const processedIds = processedEmails.map(e => e.gmailId)

  const newEmails = await listNewEmails(processedIds)
  let processed = 0

  for (const raw of newEmails) {
    const parsedTasks = await parseEmail(raw.subject, raw.body)
    if (parsedTasks.length === 0) continue

    const assignedTasks = await assignTasks(parsedTasks)
    const emailId = await createTasksFromEmail(raw, assignedTasks)

    const createdTasks = await prisma.task.findMany({
      where: { emailId },
      include: { assignee: true },
    })
    for (const task of createdTasks) {
      await sendAssignmentNotification(
        task.id,
        task.assignee.email,
        task.assignee.id,
        task.title,
        task.deadline,
      )
    }
    processed++
  }

  return NextResponse.json({ processed, total: newEmails.length })
}
