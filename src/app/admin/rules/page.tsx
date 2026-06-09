"use client"
import { useEffect, useState } from "react"

const TASK_TYPES = ["가격", "배송", "서류", "품질", "생산", "기타"]

type Rule = { taskType: string; defaultAssigneeId: string; defaultAssignee: { id: string; name: string } }
type Assignee = { id: string; name: string }

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])

  useEffect(() => {
    fetch("/api/admin/rules").then(r => r.json()).then(setRules)
    fetch("/api/admin/users").then(r => r.json()).then(setAssignees)
  }, [])

  async function handleSave(taskType: string, defaultAssigneeId: string) {
    await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskType, defaultAssigneeId }),
    })
    fetch("/api/admin/rules").then(r => r.json()).then(setRules)
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">배정 규칙</h1>
        <a href="/admin" className="text-sm text-blue-600 underline">← 관리자</a>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-3 py-2 text-left">업무 유형</th>
            <th className="border px-3 py-2 text-left">기본 담당자</th>
          </tr>
        </thead>
        <tbody>
          {TASK_TYPES.map(type => {
            const rule = rules.find(r => r.taskType === type)
            return (
              <tr key={type}>
                <td className="border px-3 py-2 font-medium">{type}</td>
                <td className="border px-3 py-2">
                  <select
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={rule?.defaultAssigneeId ?? ""}
                    onChange={e => handleSave(type, e.target.value)}
                  >
                    <option value="">담당자 선택</option>
                    {assignees.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
