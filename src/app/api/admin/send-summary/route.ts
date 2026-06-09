import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { writeSummaryEmail } from "@/lib/services/claude"
import { sendEmail } from "@/lib/services/gmail"

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

  const doneTasks = email.tasks.filter(t => t.completedAt !== null) as {
    title: string
    completionNote: string | null
    completedAt: Date
  }[]

  const summary = await writeSummaryEmail(email.subject, email.body, doneTasks)
  await sendEmail(email.from, summary.subject, summary.body)

  await prisma.email.update({
    where: { id: emailId },
    data: { status: "completed" },
  })

  return NextResponse.json({ ok: true })
}
