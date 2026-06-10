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

type EmailGroup = { emailId: string; from: string; subject: string; receivedAt: string; tasks: Task[] }
type BuyerGroup = { buyerKey: string; buyerName: string; emails: EmailGroup[] }

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

function extractEmail(from: string) {
  const match = from.match(/<(.+?)>/)
  return match ? match[1] : from
}

export default function DashboardClient({ userName }: { userName: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [completionNote, setCompletionNote] = useState<Record<string, string>>({})
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set())
  const [doneView, setDoneView] = useState<"date" | "buyer">("date")

  useEffect(() => {
    fetch("/api/tasks")
      .then(r => r.json())
      .then((data: Task[]) => {
        setTasks(data)
        setLoading(false)
        const done = data.filter(t => t.status === "done")
        const dateKeys = new Set(done.map(t => new Date(t.email.receivedAt).toLocaleDateString("ko-KR")))
        setCollapsedDates(dateKeys)
      })
  }, [])

  function toggleDate(date: string) {
    setCollapsedDates(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

  function toggleBuyer(key: string) {
    setExpandedBuyers(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
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

  // 이메일 단위로 완료 태스크 그룹화
  const emailGroupMap = new Map<string, EmailGroup>()
  for (const t of done) {
    if (!emailGroupMap.has(t.email.id)) {
      emailGroupMap.set(t.email.id, {
        emailId: t.email.id,
        from: t.email.from,
        subject: t.email.subject,
        receivedAt: t.email.receivedAt,
        tasks: [],
      })
    }
    emailGroupMap.get(t.email.id)!.tasks.push(t)
  }

  // 날짜별: receivedAt 기준 날짜 → 이메일 목록
  const dateMap = new Map<string, { ts: number; emails: EmailGroup[] }>()
  for (const eg of emailGroupMap.values()) {
    const ts = new Date(eg.receivedAt).getTime()
    const dateKey = new Date(eg.receivedAt).toLocaleDateString("ko-KR")
    if (!dateMap.has(dateKey)) dateMap.set(dateKey, { ts, emails: [] })
    const entry = dateMap.get(dateKey)!
    if (entry.ts < ts) entry.ts = ts
    entry.emails.push(eg)
  }
  const sortedDates = [...dateMap.entries()]
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([date, { emails }]) => ({
      date,
      emails: [...emails].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    }))

  // 바이어별: 발신자 이메일 주소 → 이메일 목록
  const buyerMap = new Map<string, BuyerGroup>()
  for (const eg of emailGroupMap.values()) {
    const key = extractEmail(eg.from).toLowerCase()
    if (!buyerMap.has(key)) {
      buyerMap.set(key, { buyerKey: key, buyerName: extractSenderName(eg.from), emails: [] })
    }
    buyerMap.get(key)!.emails.push(eg)
  }
  const buyers = [...buyerMap.values()]
    .sort((a, b) => {
      const aLatest = Math.max(...a.emails.map(e => new Date(e.receivedAt).getTime()))
      const bLatest = Math.max(...b.emails.map(e => new Date(e.receivedAt).getTime()))
      return bLatest - aLatest
    })
    .map(buyer => ({
      ...buyer,
      emails: [...buyer.emails].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    }))

  function renderEmailCard(eg: EmailGroup, showSender = true) {
    return (
      <div key={eg.emailId} className="bg-white border border-gray-100 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 flex items-center gap-2 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            {showSender && (
              <>
                <span className="text-xs font-medium text-gray-600">{extractSenderName(eg.from)}</span>
                <span className="text-gray-300 mx-1.5 text-xs">·</span>
              </>
            )}
            <span className="text-xs text-gray-500">{eg.subject}</span>
          </div>
          <span className="text-xs text-gray-300 shrink-0">{eg.tasks.length}건</span>
        </div>
        <div className="divide-y divide-gray-50">
          {eg.tasks.map(task => (
            <div key={task.id} className="px-4 py-2.5 flex items-start gap-2">
              <span className="text-green-400 text-xs shrink-0 mt-0.5">✓</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-400 line-through leading-snug">{task.title}</p>
                {task.completionNote && (
                  <div className="mt-1 inline-block bg-gray-50 border border-gray-200 rounded-md px-2 py-0.5">
                    <p className="text-xs text-gray-400">{task.completionNote}</p>
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-300 shrink-0">{task.taskType}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

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

            {/* 완료 업무 */}
            {done.length > 0 && (
              <div className="mt-10">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">완료된 업무</p>
                  <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                    <button
                      onClick={() => setDoneView("date")}
                      className={`px-3 py-1.5 rounded-md font-medium transition-colors ${doneView === "date" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      날짜별
                    </button>
                    <button
                      onClick={() => setDoneView("buyer")}
                      className={`px-3 py-1.5 rounded-md font-medium transition-colors ${doneView === "buyer" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      바이어별
                    </button>
                  </div>
                </div>

                {/* 날짜별 뷰 */}
                {doneView === "date" && (
                  <div className="space-y-5">
                    {sortedDates.map(({ date, emails }) => {
                      const isCollapsed = collapsedDates.has(date)
                      const totalTasks = emails.reduce((s, e) => s + e.tasks.length, 0)
                      return (
                        <div key={date}>
                          <div
                            className="flex items-center gap-2 mb-2 cursor-pointer select-none group"
                            onClick={() => toggleDate(date)}
                          >
                            <p className="text-xs font-semibold text-gray-500">{date}</p>
                            <span className="text-xs text-gray-300">이메일 {emails.length}개 · {totalTasks}건</span>
                            <span className="ml-auto text-gray-300 text-xs group-hover:text-gray-400">
                              {isCollapsed ? "▼" : "▲"}
                            </span>
                          </div>
                          {!isCollapsed && (
                            <div className="space-y-2">
                              {emails.map(eg => renderEmailCard(eg, true))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* 바이어별 뷰 */}
                {doneView === "buyer" && (
                  <div className="space-y-3">
                    {buyers.map(buyer => {
                      const isOpen = expandedBuyers.has(buyer.buyerKey)
                      const totalTasks = buyer.emails.reduce((s, e) => s + e.tasks.length, 0)
                      return (
                        <div key={buyer.buyerKey} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <div
                            onClick={() => toggleBuyer(buyer.buyerKey)}
                            className="px-4 py-3.5 flex items-center gap-3 cursor-pointer select-none hover:bg-gray-50 transition-colors"
                          >
                            <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                              <span className="text-indigo-600 text-sm font-semibold">
                                {buyer.buyerName.slice(0, 1)}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-800 text-sm truncate">{buyer.buyerName}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                이메일 {buyer.emails.length}개 · 태스크 {totalTasks}건
                              </p>
                            </div>
                            <span className="text-gray-300 text-xs shrink-0">{isOpen ? "▲" : "▼"}</span>
                          </div>
                          {isOpen && (
                            <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/50">
                              {buyer.emails.map(eg => renderEmailCard(eg, false))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
