"use client"
import { useEffect, useState } from "react"
import { signOut } from "next-auth/react"

type Task = {
  id: string
  title: string
  description: string
  taskType: string
  deadline: string | null
  status: string
  completedAt: string | null
  completionNote: string | null
  email: { id: string; from: string; subject: string; receivedAt: string }
  assignee: { name: string }
}

function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return ""
  const d = new Date(deadline)
  const dateStr = d.toLocaleDateString("ko-KR")
  const h = d.getHours(), m = d.getMinutes()
  if (h === 0 && m === 0) return dateStr
  return `${dateStr} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`
}

function extractSenderName(from: string) {
  const match = from.match(/^(.+?)\s*</)
  return match ? match[1].trim().replace(/^"|"$/g, "") : from
}

export default function DashboardClient({ userName }: { userName: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [completionNote, setCompletionNote] = useState<Record<string, string>>({})
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/tasks")
      .then(r => r.json())
      .then((data: Task[]) => {
        setTasks(data)
        setLoading(false)
        // 최근 2개 날짜만 펼치고 나머지 접기
        const done = data.filter(t => t.status === "done" && t.completedAt)
        const dateMap = new Map<string, number>()
        for (const t of done) {
          const key = new Date(t.completedAt!).toLocaleDateString("ko-KR")
          const ts = new Date(t.completedAt!).getTime()
          if (!dateMap.has(key) || dateMap.get(key)! < ts) dateMap.set(key, ts)
        }
        const sorted = [...dateMap.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
        if (sorted.length > 2) setCollapsedDates(new Set(sorted.slice(2)))
      })
  }, [])

  function toggleDate(date: string) {
    setCollapsedDates(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

  async function handleComplete(taskId: string) {
    if (completing.has(taskId)) return
    setCompleting(prev => new Set([...prev, taskId]))
    try {
      await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, completionNote: completionNote[taskId] ?? "" }),
      })
      setTasks(prev =>
        prev.map(t =>
          t.id === taskId
            ? { ...t, status: "done", completedAt: new Date().toISOString(), completionNote: completionNote[taskId] ?? "" }
            : t
        )
      )
    } finally {
      setCompleting(prev => { const s = new Set(prev); s.delete(taskId); return s })
    }
  }

  const pending = tasks
    .filter(t => t.status !== "done")
    .sort((a, b) => {
      const aHas = a.deadline !== null
      const bHas = b.deadline !== null
      if (aHas !== bHas) return aHas ? -1 : 1
      if (!aHas && !bHas) return new Date(a.email.receivedAt).getTime() - new Date(b.email.receivedAt).getTime()
      return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
    })
  const done = tasks.filter(t => t.status === "done")

  const doneByDate: Record<string, Task[]> = {}
  for (const t of done) {
    const dateKey = t.completedAt
      ? new Date(t.completedAt).toLocaleDateString("ko-KR")
      : "날짜 미상"
    if (!doneByDate[dateKey]) doneByDate[dateKey] = []
    doneByDate[dateKey].push(t)
  }
  const sortedDates = Object.keys(doneByDate).sort((a, b) => {
    if (a === "날짜 미상") return 1
    if (b === "날짜 미상") return -1
    return new Date(b).getTime() - new Date(a).getTime()
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">내 업무</h1>
            <p className="text-sm text-gray-500 mt-0.5">{userName}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-white transition-colors"
          >
            로그아웃
          </button>
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-400">불러오는 중...</p>
          </div>
        )}

        {!loading && (
          <>
            {/* 대기 업무 */}
            {pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-2xl">✓</div>
                <p className="font-semibold text-gray-700">모든 업무를 처리했습니다</p>
                <p className="text-sm text-gray-400">새로운 업무가 배정되면 여기에 표시됩니다.</p>
              </div>
            ) : (
              <div className="space-y-3 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  대기 중 {pending.length}건
                </p>
                {pending.map(task => {
                  const dl = daysLeft(task.deadline)
                  const isUrgent = dl !== null && dl <= 3
                  const isCompleting = completing.has(task.id)
                  return (
                    <div
                      key={task.id}
                      className={`rounded-xl border bg-white shadow-sm overflow-hidden ${isUrgent ? "border-red-300" : "border-gray-200"}`}
                    >
                      {isUrgent && (
                        <div className="bg-red-500 px-4 py-1.5 flex items-center gap-1.5">
                          <span className="text-white text-xs font-semibold">⚠ 마감 임박</span>
                          <span className="text-red-200 text-xs">{formatDeadline(task.deadline)} (D-{dl})</span>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">{task.taskType}</span>
                            </div>
                            <p className="font-semibold text-gray-900 leading-snug">{task.title}</p>
                            <p className="text-sm text-gray-500 mt-0.5 truncate">
                              {extractSenderName(task.email.from)} · {task.email.subject}
                            </p>
                            {task.deadline && !isUrgent && (
                              <p className="text-sm text-gray-400 mt-1">마감 {formatDeadline(task.deadline)}</p>
                            )}
                          </div>
                        </div>
                        {/* 완료 입력 영역 - 모바일에서 전체 너비 */}
                        <div className="flex gap-2 mt-3">
                          <input
                            type="text"
                            placeholder="완료 메모"
                            className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-300 disabled:bg-gray-50"
                            value={completionNote[task.id] ?? ""}
                            onChange={e => setCompletionNote(prev => ({ ...prev, [task.id]: e.target.value }))}
                            disabled={isCompleting}
                            onKeyDown={e => { if (e.key === "Enter") handleComplete(task.id) }}
                          />
                          <button
                            onClick={() => handleComplete(task.id)}
                            disabled={isCompleting}
                            className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isCompleting ? "처리 중..." : "완료"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 완료 업무 일자별 */}
            {sortedDates.length > 0 && (
              <div className="mt-10">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">완료된 업무</p>
                <div className="space-y-5">
                  {sortedDates.map(date => {
                    const isCollapsed = collapsedDates.has(date)
                    return (
                    <div key={date}>
                      <div
                        className="flex items-center gap-2 mb-2 cursor-pointer select-none group"
                        onClick={() => toggleDate(date)}
                      >
                        <p className="text-xs font-semibold text-gray-500">{date}</p>
                        <span className="text-xs text-gray-300">{doneByDate[date].length}건</span>
                        <span className="ml-auto text-gray-300 text-xs group-hover:text-gray-400">
                          {isCollapsed ? "▼" : "▲"}
                        </span>
                      </div>
                      {!isCollapsed && <div className="space-y-1.5">
                        {doneByDate[date].map(task => (
                          <div key={task.id} className="bg-white border border-gray-100 rounded-lg px-4 py-3">
                            <div className="flex items-start gap-3">
                              <span className="text-green-400 shrink-0 mt-0.5 text-sm">✓</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-400 line-through leading-snug">{task.title}</p>
                                <p className="text-xs text-gray-400 mt-0.5 truncate">
                                  {extractSenderName(task.email.from)} · {task.email.subject}
                                </p>
                                {task.completionNote && (
                                  <div className="mt-1.5 inline-block bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
                                    <p className="text-xs text-gray-500">{task.completionNote}</p>
                                  </div>
                                )}
                              </div>
                              <span className="text-xs text-gray-300 shrink-0">{task.taskType}</span>
                            </div>
                          </div>
                        ))}
                      </div>}
                    </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
