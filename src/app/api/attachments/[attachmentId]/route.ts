import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { readFile, unlink } from "fs/promises"
import { join } from "path"

const UPLOADS_DIR = join(process.cwd(), "uploads")

async function resolveAttachment(attachmentId: string, userId: string, role: string) {
  const attachment = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId },
    include: { task: true },
  })
  if (!attachment) return { attachment: null, allowed: false }

  const coIds: string[] = JSON.parse(attachment.task.coAssigneeIds ?? "[]")
  const allowed =
    role === "admin" ||
    attachment.task.assigneeId === userId ||
    coIds.includes(userId)

  return { attachment, allowed }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { attachmentId } = await params
  const { attachment, allowed } = await resolveAttachment(attachmentId, session.user.id, session.user.role)

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const filePath = join(UPLOADS_DIR, attachment.storedPath)
  let buffer: Buffer
  try {
    buffer = await readFile(filePath)
  } catch {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 })
  }

  const encodedName = encodeURIComponent(attachment.filename)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(buffer.length),
    },
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { attachmentId } = await params
  const { attachment, allowed } = await resolveAttachment(attachmentId, session.user.id, session.user.role)

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await prisma.taskAttachment.delete({ where: { id: attachmentId } })

  const filePath = join(UPLOADS_DIR, attachment.storedPath)
  try { await unlink(filePath) } catch { /* 파일 없어도 계속 */ }

  return NextResponse.json({ ok: true })
}
