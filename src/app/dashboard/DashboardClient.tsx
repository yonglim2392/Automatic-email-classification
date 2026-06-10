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
  completedByName: string | null
  email: { id: string; from: string; subject: string; receivedAt: string }
  assignee: { name: string }
}

type EmailGroup = { emailId: string; from: string; subject: string; receivedAt: string; tasks: Task[] }
type BuyerGroup = { buyerKey: string; buyerName: string; emails: EmailGroup[] }
type EmailDetail = { from: string; subject: string; receivedAt: string; body: string }

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

function shortDateTime(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function DashboardClient({ userName }: { userName: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [completionNote, setCompletionNote] = useState<Record<string, string>>({})
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set())
  const [doneView, setDoneView] = useState<"date" | "buyer">("buyer")

  // 이메일 원문 모달
  const [emailModal, setEmailModal] = useState<{ task: Task; detail: EmailDetail | null } | null>(null)
  const [loadingEmail, setLoadingEmail] = useState(false)

  // 비밀번호 변경 모달
  const [pwModal, setPwModal] = useState(false)
  const [pwCurrent, setPwCurrent] = useState("")
  const [pwNew, setPwNew] = useState("")
  const [pwConfirm, setPwConfirm] = useState("")
  const [pwError, setPwError] = useState("")
  const [pwSaving, setPwSaving] = useState(false)

  async function handleChangePassword() {
    if (pwNew !== pwConfirm) { setPwError("새 비밀번호가 일치하지 않습니다"); return }
    if (pwNew.length < 4) { setPwError("비밀번호는 4자 이상이어야 합니다"); return }
    setPwSaving(true); setPwError("")
    try {
      const res = await fetch("/api/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      })
      const data = await res.json()
      if (!res.ok) { setPwError(data.error ?? "오류가 발생했습니다"); return }
      setPwModal(false); setPwCurrent(""); setPwNew(""); setPwConfirm("")
    } finally {
      setPwSaving(false)
    }
  }

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

  async function openEmailModal(task: Task) {
    setEmailModal({ task, detail: null })
    setLoadingEmail(true)
    try {
      const res = await fetch(`/api/tasks/email-body?emailId=${task.email.id}`)
      const data = await res.json()
      setEmailModal({ task, detail: data })
    } finally {
      setLoadingEmail(false)
    }
  }

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

  // 이메일 단위 그룹화
  const emailGroupMap = new Map<string, EmailGroup>()
  for (const t of done) {
    if (!emailGroupMap.has(t.email.id)) {
      emailGroupMap.set(t.email.id, {
        emailId: t.email.id, from: t.email.from,
        subject: t.email.subject, receivedAt: t.email.receivedAt, tasks: [],
      })
    }
    emailGroupMap.get(t.email.id)!.tasks.push(t)
  }

  // 날짜별: receivedAt 기준
  const dateGroupMap = new Map<string, { ts: number; tasks: Task[] }>()
  for (const t of done) {
    const ts = new Date(t.email.receivedAt).getTime()
    const key = new Date(t.email.receivedAt).toLocaleDateString("ko-KR")
    if (!dateGroupMap.has(key)) dateGroupMap.set(key, { ts, tasks: [] })
    const entry = dateGroupMap.get(key)!
    if (entry.ts < ts) entry.ts = ts
    entry.tasks.push(t)
  }
  const sortedDates = [...dateGroupMap.entries()]
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([date, { tasks: dateTasks }]) => ({
      date,
      tasks: [...dateTasks].sort((a, b) =>
        new Date(b.completedAt ?? b.email.receivedAt).getTime() - new Date(a.completedAt ?? a.email.receivedAt).getTime()
      ),
    }))

  // 바이어별
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
    .map(buyer => {
      const allTasks = buyer.emails
        .flatMap(e => e.tasks)
        .sort((a, b) =>
          new Date(b.completedAt ?? b.email.receivedAt).getTime() - new Date(a.completedAt ?? a.email.receivedAt).getTime()
        )
      return { ...buyer, allTasks }
    })

  // 태스크 행 렌더링
  function renderTaskRow(task: Task, showBuyer = false) {
    return (
      <button
        key={task.id}
        onClick={() => openEmailModal(task)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-indigo-50/40 active:bg-indigo-50 transition-colors group"
      >
        <span className="text-green-400 text-xs shrink-0">✓</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 leading-snug">{task.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {showBuyer && (
              <span className="text-xs text-gray-400">{extractSenderName(task.email.from)}</span>
            )}
            {task.completedByName && task.completedByName !== userName && (
              <span className="text-xs text-indigo-400">처리: {task.completedByName}</span>
            )}
            {(showBuyer || (task.completedByName && task.completedByName !== userName)) && task.completionNote && (
              <span className="text-gray-200 text-xs">·</span>
            )}
            {task.completionNote && (
              <span className="text-xs text-gray-400 italic">{task.completionNote}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <div className="text-right">
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md block">{task.taskType}</span>
            <span className="text-xs text-gray-400 mt-0.5 block">{shortDateTime(task.completedAt)}</span>
          </div>
          <svg className="w-3.5 h-3.5 text-gray-200 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPwModal(true)}
              className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg transition-colors"
              title="비밀번호 변경"
            >
              🔑
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-white transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>

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
                      onClick={() => setDoneView("buyer")}
                      className={`px-3 py-1.5 rounded-md font-medium transition-colors ${doneView === "buyer" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      바이어별
                    </button>
                    <button
                      onClick={() => setDoneView("date")}
                      className={`px-3 py-1.5 rounded-md font-medium transition-colors ${doneView === "date" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      날짜별
                    </button>
                  </div>
                </div>

                {/* 날짜별 뷰 */}
                {doneView === "date" && (
                  <div className="space-y-3">
                    {sortedDates.map(({ date, tasks: dateTasks }) => {
                      const isCollapsed = collapsedDates.has(date)
                      return (
                        <div key={date} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <button
                            onClick={() => toggleDate(date)}
                            className="w-full px-4 py-3 flex items-center gap-2 hover:bg-gray-50 transition-colors select-none"
                          >
                            <p className="text-sm font-semibold text-gray-700">{date}</p>
                            <span className="text-xs text-gray-400">{dateTasks.length}건</span>
                            <span className="ml-auto text-gray-300 text-xs">{isCollapsed ? "▼" : "▲"}</span>
                          </button>
                          {!isCollapsed && (
                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                              {dateTasks.map(t => renderTaskRow(t, true))}
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
                      return (
                        <div key={buyer.buyerKey} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <button
                            onClick={() => toggleBuyer(buyer.buyerKey)}
                            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors select-none"
                          >
                            <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                              <span className="text-indigo-600 text-sm font-semibold">{buyer.buyerName.slice(0, 1)}</span>
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <p className="font-semibold text-gray-800 text-sm truncate">{buyer.buyerName}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{buyer.allTasks.length}건 완료</p>
                            </div>
                            <span className="text-gray-300 text-xs shrink-0">{isOpen ? "▲" : "▼"}</span>
                          </button>
                          {isOpen && (
                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                              {buyer.allTasks.map(t => renderTaskRow(t, false))}
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

      {/* 비밀번호 변경 모달 */}
      {pwModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPwModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-gray-800 mb-4">비밀번호 변경</h2>
            <div className="space-y-3">
              <input
                type="password"
                placeholder="현재 비밀번호"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={pwCurrent}
                onChange={e => setPwCurrent(e.target.value)}
              />
              <input
                type="password"
                placeholder="새 비밀번호 (4자 이상)"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={pwNew}
                onChange={e => setPwNew(e.target.value)}
              />
              <input
                type="password"
                placeholder="새 비밀번호 확인"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={pwConfirm}
                onChange={e => setPwConfirm(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleChangePassword() }}
              />
              {pwError && <p className="text-xs text-red-500">{pwError}</p>}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleChangePassword}
                disabled={pwSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {pwSaving ? "변경 중..." : "변경"}
              </button>
              <button
                onClick={() => { setPwModal(false); setPwError(""); setPwCurrent(""); setPwNew(""); setPwConfirm("") }}
                className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이메일 원문 모달 (하단 시트) */}
      {emailModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setEmailModal(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-400 mb-0.5">{extractSenderName(emailModal.task.email.from)}</p>
                  <p className="font-semibold text-gray-800 leading-snug">{emailModal.task.email.subject}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    수신 {new Date(emailModal.task.email.receivedAt).toLocaleString("ko-KR", {
                      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setEmailModal(null)}
                  className="text-gray-300 hover:text-gray-500 transition-colors shrink-0 mt-0.5"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* 처리한 업무 요약 */}
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                <span className="text-green-500 text-xs">✓</span>
                <span className="text-xs font-medium text-green-700">{emailModal.task.title}</span>
                {emailModal.task.completionNote && (
                  <>
                    <span className="text-green-300 text-xs">·</span>
                    <span className="text-xs text-green-600">{emailModal.task.completionNote}</span>
                  </>
                )}
              </div>
            </div>

            {/* 이메일 본문 */}
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {loadingEmail ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : emailModal.detail ? (
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                  {emailModal.detail.body}
                </p>
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">이메일을 불러올 수 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
