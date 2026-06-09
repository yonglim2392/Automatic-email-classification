import prisma from "@/lib/prisma"
import type { ParsedTask } from "./claude"

export type AssignedTask = ParsedTask & { assigneeId: string }

export async function assignTasks(tasks: ParsedTask[]): Promise<AssignedTask[]> {
  const rules = await prisma.routingRule.findMany()
  const ruleMap = new Map(rules.map(r => [r.taskType, r.defaultAssigneeId]))

  const fallbackUser = await prisma.user.findFirst({ where: { role: "admin" } })
  if (!fallbackUser) throw new Error("관리자 계정이 없습니다")

  return tasks.map(task => ({
    ...task,
    assigneeId: ruleMap.get(task.taskType) ?? fallbackUser.id,
  }))
}
