import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { sendEmail } from "@/lib/services/gmail"

export async function POST(request: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { emailId, subject, body } = await request.json()

  const email = await prisma.email.findUnique({ where: { id: emailId } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (email.status === "completed") {
    return NextResponse.json({ error: "이미 발송된 이메일입니다." }, { status: 409 })
  }

  await sendEmail(email.from, subject, body)

  await prisma.email.update({
    where: { id: emailId },
    data: { status: "completed", summarySubject: subject, summaryBody: body },
  })

  return NextResponse.json({ ok: true })
}
