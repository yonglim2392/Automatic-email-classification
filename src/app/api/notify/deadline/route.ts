import { NextResponse } from "next/server"
import { getTasksNearDeadline } from "@/lib/services/tasks"
import { sendDeadlineWarning } from "@/lib/services/notify"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tasks = await getTasksNearDeadline()
  let sent = 0

  for (const task of tasks) {
    await sendDeadlineWarning(
      task.id,
      task.assignee.email,
      task.assignee.id,
      task.title,
      task.deadline!,
    )
    sent++
  }

  return NextResponse.json({ sent })
}
