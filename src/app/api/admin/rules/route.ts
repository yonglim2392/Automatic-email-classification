import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "admin") return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const rules = await prisma.routingRule.findMany({
    include: { defaultAssignee: { select: { id: true, name: true } } },
  })
  return NextResponse.json(rules)
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { taskType, defaultAssigneeId, description = "", coAssigneeIds = [] } = await request.json()
  const rule = await prisma.routingRule.upsert({
    where: { taskType },
    update: { defaultAssigneeId, description, coAssigneeIds: JSON.stringify(coAssigneeIds) },
    create: { taskType, defaultAssigneeId, description, coAssigneeIds: JSON.stringify(coAssigneeIds) },
  })
  return NextResponse.json(rule)
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { taskType } = await request.json()
  await prisma.routingRule.delete({ where: { taskType } })
  return NextResponse.json({ ok: true })
}
