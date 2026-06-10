import prisma from "@/lib/prisma"
import type { ParsedTask } from "./claude"

export type AssignedTask = ParsedTask & { assigneeId: string; coAssigneeIds: string[] }

export async function assignTasks(tasks: ParsedTask[]): Promise<AssignedTask[]> {
  const rules = await prisma.routingRule.findMany()
  const ruleMap = new Map(rules.map(r => [r.taskType, r]))

  const fallbackUser = await prisma.user.findFirst({ where: { role: "admin" } })
  if (!fallbackUser) throw new Error("관리자 계정이 없습니다")

  return tasks.map(task => {
    const rule = ruleMap.get(task.taskType)
    const coAssigneeIds: string[] = rule ? JSON.parse(rule.coAssigneeIds ?? "[]") : []
    return {
      ...task,
      assigneeId: rule?.defaultAssigneeId ?? fallbackUser.id,
      coAssigneeIds,
    }
  })
}

export async function getTaskTypeDefinitions() {
  const rules = await prisma.routingRule.findMany({
    select: { taskType: true, description: true },
    orderBy: { taskType: "asc" },
  })
  return rules.map(r => ({ taskType: r.taskType, description: r.description }))
}
