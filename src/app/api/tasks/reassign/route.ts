import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { reassignTask } from "@/lib/services/tasks"

export async function POST(request: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { taskId, newAssigneeId } = await request.json()
  await reassignTask(taskId, newAssigneeId)
  return NextResponse.json({ ok: true })
}
