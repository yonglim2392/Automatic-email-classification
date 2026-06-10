import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { randomUUID } from "crypto"

const UPLOADS_DIR = join(process.cwd(), "uploads")
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { taskId } = await params

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const coIds: string[] = JSON.parse(task.coAssigneeIds ?? "[]")
  const canAccess =
    session.user.role === "admin" ||
    task.assigneeId === session.user.id ||
    coIds.includes(session.user.id)
  if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 })

  await mkdir(UPLOADS_DIR, { recursive: true })

  const ext = file.name.split(".").pop() ?? "bin"
  const storedName = `${randomUUID()}.${ext}`
  const storedPath = join(UPLOADS_DIR, storedName)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(storedPath, buffer)

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      storedPath: storedName,
    },
  })

  return NextResponse.json({ ok: true, attachment })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { taskId } = await params

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const coIds: string[] = JSON.parse(task.coAssigneeIds ?? "[]")
  const canAccess =
    session.user.role === "admin" ||
    task.assigneeId === session.user.id ||
    coIds.includes(session.user.id)
  if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId },
    orderBy: { uploadedAt: "asc" },
  })

  return NextResponse.json(attachments)
}
