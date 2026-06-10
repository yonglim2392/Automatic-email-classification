import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { listNewEmails, markAsRead } from "@/lib/services/gmail"
import { parseEmail } from "@/lib/services/claude"
import { assignTasks, getTaskTypeDefinitions } from "@/lib/services/routing"
import { createTasksFromEmail } from "@/lib/services/tasks"
import { sendAssignmentNotification } from "@/lib/services/notify"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const processedEmails = await prisma.email.findMany({ select: { gmailId: true } })
  const processedIds = processedEmails.map(e => e.gmailId)

  const newEmails = await listNewEmails(processedIds)
  const taskTypes = await getTaskTypeDefinitions()
  let processed = 0
  let failed = 0

  for (const raw of newEmails) {
    try {
      const parsedTasks = await parseEmail(raw.subject, raw.body, taskTypes.length > 0 ? taskTypes : undefined)

      if (parsedTasks.length === 0) {
        await prisma.email.create({
          data: {
            gmailId: raw.gmailId,
            from: raw.from,
            subject: raw.subject,
            body: raw.body,
            receivedAt: raw.receivedAt,
            status: "skipped",
          },
        })
        try { await markAsRead(raw.gmailId) } catch { /* Gmail API 실패 무시 */ }
        continue
      }

      const assignedTasks = await assignTasks(parsedTasks)
      const emailId = await createTasksFromEmail(raw, assignedTasks)

      const createdTasks = await prisma.task.findMany({
        where: { emailId },
        include: { assignee: true },
      })
      for (const task of createdTasks) {
        try {
          await sendAssignmentNotification(
            task.id,
            task.assignee.email,
            task.assignee.id,
            task.title,
            task.deadline,
          )
        } catch { /* 알림 실패해도 폴링은 계속 */ }
      }

      try { await markAsRead(raw.gmailId) } catch { /* Gmail API 실패 무시 */ }
      processed++
    } catch {
      try {
        await prisma.email.upsert({
          where: { gmailId: raw.gmailId },
          update: { status: "failed" },
          create: {
            gmailId: raw.gmailId,
            from: raw.from,
            subject: raw.subject,
            body: raw.body,
            receivedAt: raw.receivedAt,
            status: "failed",
          },
        })
      } catch { /* DB 저장도 실패하면 무시 */ }
      failed++
    }
  }

  return NextResponse.json({ processed, failed, total: newEmails.length })
}
