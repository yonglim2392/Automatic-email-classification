import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { currentPassword, newPassword, targetUserId } = await request.json()

  // 관리자가 다른 사용자 비밀번호를 바꾸는 경우 currentPassword 불필요
  const isAdminReset = session.user.role === "admin" && targetUserId && targetUserId !== session.user.id
  const userId = isAdminReset ? targetUserId : session.user.id

  if (!newPassword || newPassword.length < 4) {
    return NextResponse.json({ error: "비밀번호는 4자 이상이어야 합니다" }, { status: 400 })
  }

  if (!isAdminReset) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 })

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) return NextResponse.json({ error: "현재 비밀번호가 틀립니다" }, { status: 400 })
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } })

  return NextResponse.json({ ok: true })
}
