import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "admin") return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, taskTypes: true },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(users)
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { name, email, password, role } = await request.json()
  if (!password || password.length < 4) {
    return NextResponse.json({ error: "비밀번호는 4자 이상이어야 합니다" }, { status: 400 })
  }
  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name, email, password: hashed, role: role ?? "assignee" },
    select: { id: true, name: true, email: true, role: true },
  })
  return NextResponse.json(user)
}
