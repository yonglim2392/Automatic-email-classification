import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { taskId } = await params
  const { title, description, taskType } = await request.json()

  const task = await prisma.task.update({
    where: { id: taskId },
    data: { title, description, taskType },
  })

  return NextResponse.json(task)
}
