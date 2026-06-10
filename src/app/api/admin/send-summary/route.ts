import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { sendEmail, type EmailAttachment } from "@/lib/services/gmail"
import { readFile } from "fs/promises"
import { join } from "path"

const UPLOADS_DIR = join(process.cwd(), "uploads")

export async function POST(request: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { emailId, subject, body } = await request.json()

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: {
      tasks: { include: { attachments: true } },
    },
  })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (email.status === "completed") {
    return NextResponse.json({ error: "이미 발송된 이메일입니다." }, { status: 409 })
  }

  // 모든 태스크의 첨부파일 수집
  const attachments: EmailAttachment[] = []
  for (const task of email.tasks) {
    for (const att of task.attachments) {
      try {
        const content = await readFile(join(UPLOADS_DIR, att.storedPath))
        attachments.push({ filename: att.filename, content, mimeType: att.mimeType })
      } catch {
        // 파일이 없으면 skip
      }
    }
  }

  await sendEmail(email.from, subject, body, attachments)

  await prisma.email.update({
    where: { id: emailId },
    data: { status: "completed", summarySubject: subject, summaryBody: body },
  })

  return NextResponse.json({ ok: true })
}
