import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { writeSummaryEmail } from "@/lib/services/claude"

export async function POST(request: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { emailId } = await request.json()

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: {
      tasks: {
        select: { title: true, completionNote: true, completedAt: true },
      },
    },
  })

  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // 이미 생성된 요약이 있으면 재사용
  if (email.summarySubject && email.summaryBody) {
    return NextResponse.json({
      to: email.from,
      subject: email.summarySubject,
      body: email.summaryBody,
    })
  }

  const doneTasks = email.tasks.filter(t => t.completedAt !== null) as {
    title: string
    completionNote: string | null
    completedAt: Date
  }[]

  const summary = await writeSummaryEmail(email.subject, email.body, doneTasks)

  // 생성된 요약을 DB에 저장
  await prisma.email.update({
    where: { id: emailId },
    data: { summarySubject: summary.subject, summaryBody: summary.body },
  })

  return NextResponse.json({
    to: email.from,
    subject: summary.subject,
    body: summary.body,
  })
}
