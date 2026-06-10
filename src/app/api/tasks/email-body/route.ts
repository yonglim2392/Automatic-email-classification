import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"

export async function GET(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const emailId = searchParams.get("emailId")
  if (!emailId) return NextResponse.json({ error: "emailId required" }, { status: 400 })

  const where = session.user.role === "admin"
    ? { emailId }
    : { emailId, assigneeId: session.user.id }

  const task = await prisma.task.findFirst({ where })
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    select: { from: true, subject: true, receivedAt: true, body: true },
  })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(email)
}
