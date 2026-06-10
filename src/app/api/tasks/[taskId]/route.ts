import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { taskId } = await params
  const body = await request.json()
  const isAdmin = session.user.role === "admin"

  // 완료 취소 (reopen)
  if (body.action === "reopen") {
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const coIds: string[] = JSON.parse(task.coAssigneeIds ?? "[]")
    const isAssignee = task.assigneeId === session.user.id || coIds.includes(session.user.id)
    if (!isAdmin && !isAssignee) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await prisma.task.update({
      where: { id: taskId },
      data: { status: "pending", completedAt: null, completionNote: null, completedByName: null },
    })

    // 이메일 상태가 ready였으면 다시 processed로
    await prisma.email.updateMany({
      where: { id: task.emailId, status: "ready" },
      data: { status: "processed" },
    })

    return NextResponse.json({ ok: true })
  }

  // 완료 메모 수정
  if ("completionNote" in body) {
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const coIds: string[] = JSON.parse(task.coAssigneeIds ?? "[]")
    const isAssignee = task.assigneeId === session.user.id || coIds.includes(session.user.id)
    if (!isAdmin && !isAssignee) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await prisma.task.update({
      where: { id: taskId },
      data: { completionNote: body.completionNote },
    })

    return NextResponse.json({ ok: true })
  }

  // 태스크 내용 수정 (관리자 전용, pending 상태만)
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { title, description, taskType } = body
  const task = await prisma.task.update({
    where: { id: taskId },
    data: { title, description, taskType },
  })

  return NextResponse.json(task)
}
