"use client"
import { useEffect, useState } from "react"

const TASK_TYPES = ["가격", "배송", "서류", "품질", "생산", "기타"]

type Rule = { taskType: string; defaultAssigneeId: string; defaultAssignee: { id: string; name: string } }
type Assignee = { id: string; name: string }

const TYPE_COLOR: Record<string, string> = {
  가격: "bg-blue-50 text-blue-700 border-blue-100",
  배송: "bg-purple-50 text-purple-700 border-purple-100",
  서류: "bg-yellow-50 text-yellow-700 border-yellow-100",
  품질: "bg-red-50 text-red-700 border-red-100",
  생산: "bg-green-50 text-green-700 border-green-100",
  기타: "bg-slate-50 text-slate-600 border-slate-100",
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [saved, setSaved] = useState<string | null>(null)

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
    setSaved(taskType)
    setTimeout(() => setSaved(null), 1500)
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-800">배정 규칙</h1>
        <p className="text-sm text-slate-400 mt-0.5">업무 유형별 기본 담당자를 설정합니다</p>
      </div>

      <div className="space-y-2">
        {TASK_TYPES.map(type => {
          const rule = rules.find(r => r.taskType === type)
          const isSaved = saved === type
          return (
            <div
              key={type}
              className="bg-white border border-slate-100 rounded-xl px-5 py-4 flex items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${TYPE_COLOR[type] ?? "bg-slate-50 text-slate-600 border-slate-100"}`}>
                  {type}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {isSaved && (
                  <span className="text-xs text-emerald-500 font-medium">저장됨</span>
                )}
                <select
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[130px]"
                  value={rule?.defaultAssigneeId ?? ""}
                  onChange={e => handleSave(type, e.target.value)}
                >
                  <option value="">담당자 선택</option>
                  {assignees.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
