"use client"
import { useEffect, useState } from "react"

type Rule = {
  id: string
  taskType: string
  description: string
  defaultAssigneeId: string
  coAssigneeIds: string
  defaultAssignee: { id: string; name: string }
}
type Assignee = { id: string; name: string }

const BADGE_COLORS = [
  "bg-blue-50 text-blue-700 border-blue-100",
  "bg-purple-50 text-purple-700 border-purple-100",
  "bg-yellow-50 text-yellow-700 border-yellow-100",
  "bg-red-50 text-red-700 border-red-100",
  "bg-green-50 text-green-700 border-green-100",
  "bg-slate-50 text-slate-600 border-slate-100",
  "bg-orange-50 text-orange-700 border-orange-100",
  "bg-pink-50 text-pink-700 border-pink-100",
]

function badgeColor(idx: number) {
  return BADGE_COLORS[idx % BADGE_COLORS.length]
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // 새 규칙 추가 폼
  const [newType, setNewType] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [newPrimary, setNewPrimary] = useState("")
  const [newCoIds, setNewCoIds] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // 편집 상태 (각 규칙 inline 편집)
  const [editState, setEditState] = useState<Record<string, { desc: string; primary: string; coIds: string[] }>>({})

  async function refresh() {
    const data = await fetch("/api/admin/rules").then(r => r.json())
    setRules(data)
    const initial: Record<string, { desc: string; primary: string; coIds: string[] }> = {}
    for (const r of data as Rule[]) {
      initial[r.taskType] = {
        desc: r.description ?? "",
        primary: r.defaultAssigneeId,
        coIds: JSON.parse(r.coAssigneeIds ?? "[]"),
      }
    }
    setEditState(initial)
  }

  useEffect(() => {
    refresh()
    fetch("/api/admin/users").then(r => r.json()).then(setAssignees)
  }, [])

  async function handleSave(taskType: string) {
    const state = editState[taskType]
    if (!state || !state.primary) return
    await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskType,
        defaultAssigneeId: state.primary,
        description: state.desc,
        coAssigneeIds: state.coIds,
      }),
    })
    await refresh()
    setSaved(taskType)
    setTimeout(() => setSaved(null), 1500)
  }

  async function handleDelete(taskType: string) {
    setDeleting(taskType)
    await fetch("/api/admin/rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskType }),
    })
    await refresh()
    setDeleting(null)
  }

  async function handleAdd() {
    if (!newType.trim() || !newPrimary) return
    setAdding(true)
    await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskType: newType.trim(),
        defaultAssigneeId: newPrimary,
        description: newDesc.trim(),
        coAssigneeIds: newCoIds,
      }),
    })
    setNewType("")
    setNewDesc("")
    setNewPrimary("")
    setNewCoIds([])
    setShowForm(false)
    setAdding(false)
    await refresh()
  }

  function toggleCoId(ids: string[], id: string): string[] {
    return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">배정 규칙</h1>
          <p className="text-sm text-slate-400 mt-0.5">업무 유형별 담당자를 설정합니다. 규칙을 추가하면 AI 분류에 바로 반영됩니다.</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="shrink-0 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + 규칙 추가
        </button>
      </div>

      {showForm && (
        <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-indigo-800">새 배정 규칙</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">업무 유형 이름 *</label>
              <input
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="예: 클레임, 결제, 통관..."
                value={newType}
                onChange={e => setNewType(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">주담당자 *</label>
              <select
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={newPrimary}
                onChange={e => setNewPrimary(e.target.value)}
              >
                <option value="">선택</option>
                {assignees.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">분류 설명 (AI 힌트)</label>
            <input
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="예: 가격 협상, 할인 요청, 인보이스 관련..."
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">공동 담당자 (복수 선택 가능)</label>
            <div className="flex flex-wrap gap-2">
              {assignees.map(a => (
                <button
                  key={a.id}
                  type="button"
                  disabled={a.id === newPrimary}
                  onClick={() => setNewCoIds(ids => toggleCoId(ids, a.id))}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    newCoIds.includes(a.id)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : a.id === newPrimary
                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                        : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={adding || !newType.trim() || !newPrimary}
              className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {adding ? "저장 중..." : "저장"}
            </button>
            <button
              onClick={() => { setShowForm(false); setNewType(""); setNewDesc(""); setNewPrimary(""); setNewCoIds([]) }}
              className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg border border-slate-200"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 && (
        <div className="text-center py-16 text-slate-400 text-sm">
          배정 규칙이 없습니다. 규칙을 추가해 주세요.
        </div>
      )}

      <div className="space-y-3">
        {rules.map((rule, idx) => {
          const state = editState[rule.taskType]
          if (!state) return null
          const isDirty =
            state.desc !== (rule.description ?? "") ||
            state.primary !== rule.defaultAssigneeId ||
            JSON.stringify(state.coIds.sort()) !== JSON.stringify((JSON.parse(rule.coAssigneeIds ?? "[]") as string[]).sort())
          const coNames = (JSON.parse(rule.coAssigneeIds ?? "[]") as string[])
            .map(id => assignees.find(a => a.id === id)?.name)
            .filter(Boolean)

          return (
            <div key={rule.taskType} className="bg-white border border-slate-100 rounded-xl px-5 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${badgeColor(idx)}`}>
                    {rule.taskType}
                  </span>
                  {coNames.length > 0 && (
                    <span className="text-xs text-slate-400">공동: {coNames.join(", ")}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {saved === rule.taskType && (
                    <span className="text-xs text-emerald-500 font-medium">저장됨</span>
                  )}
                  {isDirty && (
                    <button
                      onClick={() => handleSave(rule.taskType)}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      저장
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(rule.taskType)}
                    disabled={deleting === rule.taskType}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded-lg border border-red-100 hover:border-red-300 transition-colors disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">분류 설명 (AI 힌트)</label>
                  <input
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="AI가 이 유형으로 분류할 때 참고할 설명..."
                    value={state.desc}
                    onChange={e => setEditState(s => ({ ...s, [rule.taskType]: { ...s[rule.taskType], desc: e.target.value } }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1 block">주담당자</label>
                    <select
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      value={state.primary}
                      onChange={e => setEditState(s => ({ ...s, [rule.taskType]: { ...s[rule.taskType], primary: e.target.value } }))}
                    >
                      <option value="">선택</option>
                      {assignees.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1 block">공동 담당자</label>
                    <div className="flex flex-wrap gap-1.5">
                      {assignees.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          disabled={a.id === state.primary}
                          onClick={() => setEditState(s => ({
                            ...s,
                            [rule.taskType]: { ...s[rule.taskType], coIds: toggleCoId(s[rule.taskType].coIds, a.id) },
                          }))}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                            state.coIds.includes(a.id)
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : a.id === state.primary
                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                          }`}
                        >
                          {a.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
