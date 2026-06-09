import { sendEmail } from "./gmail"
import prisma from "@/lib/prisma"

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

export async function sendAssignmentNotification(
  taskId: string,
  assigneeEmail: string,
  assigneeId: string,
  taskTitle: string,
  deadline: Date | null,
): Promise<void> {
  const deadlineStr = deadline ? deadline.toLocaleDateString("ko-KR") : "마감기한 없음"

  await sendEmail(
    assigneeEmail,
    `[새 업무] ${taskTitle}`,
    `새 업무가 배정되었습니다.\n\n업무: ${taskTitle}\n마감기한: ${deadlineStr}\n\n대시보드: ${APP_URL}/dashboard`,
  )

  await prisma.notification.create({
    data: { taskId, userId: assigneeId, type: "assignment" },
  })
}

export async function sendDeadlineWarning(
  taskId: string,
  assigneeEmail: string,
  assigneeId: string,
  taskTitle: string,
  deadline: Date,
): Promise<void> {
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  await sendEmail(
    assigneeEmail,
    `[마감 임박 D-${daysLeft}] ${taskTitle}`,
    `마감이 ${daysLeft}일 남았습니다.\n\n업무: ${taskTitle}\n마감기한: ${deadline.toLocaleDateString("ko-KR")}\n\n대시보드: ${APP_URL}/dashboard`,
  )

  await prisma.notification.create({
    data: { taskId, userId: assigneeId, type: "deadline_warning" },
  })
}
