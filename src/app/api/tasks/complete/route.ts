import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { completeTask, checkAllTasksDone } from "@/lib/services/tasks"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { taskId, completionNote } = await request.json()

  console.log("[complete] taskId=%s userId=%s role=%s", taskId, session.user.id, session.user.role)

  try {
    await completeTask(taskId, session.user.id, completionNote ?? null, session.user.name ?? "", session.user.role === "admin")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[complete] FAIL taskId=%s userId=%s error=%s", taskId, session.user.id, msg)
    return NextResponse.json({ error: msg }, { status: 403 })
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { emailId: true },
  })
  if (!task) return NextResponse.json({ ok: true })

  const allDone = await checkAllTasksDone(task.emailId)
  if (allDone) {
    await prisma.email.update({
      where: { id: task.emailId },
      data: { status: "ready" },
    })
  }

  return NextResponse.json({ ok: true, allDone })
}
