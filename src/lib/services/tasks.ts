import prisma from "@/lib/prisma"
import type { RawEmail } from "./gmail"
import type { AssignedTask } from "./routing"

export async function createTasksFromEmail(
  raw: RawEmail,
  assignedTasks: AssignedTask[],
): Promise<string> {
  const email = await prisma.email.create({
    data: {
      gmailId: raw.gmailId,
      from: raw.from,
      subject: raw.subject,
      body: raw.body,
      receivedAt: raw.receivedAt,
      status: "processed",
    },
  })

  for (const t of assignedTasks) {
    await prisma.task.create({
      data: {
        emailId: email.id,
        title: t.title,
        description: t.description,
        taskType: t.taskType,
        assigneeId: t.assigneeId,
        coAssigneeIds: JSON.stringify(t.coAssigneeIds ?? []),
        deadline: t.deadline ? new Date(t.deadline) : null,
        status: "pending",
      },
    })
  }

  return email.id
}

export async function completeTask(
  taskId: string,
  userId: string,
  completionNote: string | null,
  completedByName: string,
  isAdmin = false,
): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new Error("권한 없음")

  const coIds: string[] = JSON.parse(task.coAssigneeIds ?? "[]")
  const isAssignee = task.assigneeId === userId || coIds.includes(userId)
  if (!isAdmin && !isAssignee) throw new Error("권한 없음")

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "done", completedAt: new Date(), completionNote, completedByName, adminFeedback: null, adminFeedbackBy: null },
  })
}

export async function reassignTask(taskId: string, newAssigneeId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { emailId: true } })
  if (!task) return

  await prisma.task.update({
    where: { id: taskId },
    data: { assigneeId: newAssigneeId, status: "pending", completedAt: null, completionNote: null, completedByName: null },
  })

  // 이메일이 ready 상태면 미완료 태스크가 생겼으므로 processed로 롤백
  await prisma.email.updateMany({
    where: { id: task.emailId, status: "ready" },
    data: { status: "processed" },
  })
}

export async function checkAllTasksDone(emailId: string): Promise<boolean> {
  const tasks = await prisma.task.findMany({ where: { emailId } })
  return tasks.length > 0 && tasks.every(t => t.status === "done")
}

export async function getTasksNearDeadline() {
  const threeDaysLater = new Date()
  threeDaysLater.setDate(threeDaysLater.getDate() + 3)

  return prisma.task.findMany({
    where: {
      status: { not: "done" },
      deadline: { lte: threeDaysLater, gte: new Date() },
      notifications: { none: { type: "deadline_warning" } },
    },
    include: { assignee: true, email: true },
  })
}
