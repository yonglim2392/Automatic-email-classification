"use client"
import { useEffect, useState } from "react"

type Task = {
  id: string
  title: string
  taskType: string
  status: string
  deadline: string | null
  completedAt: string | null
  completionNote: string | null
  email: { id: string; from: string; subject: string; receivedAt: string; status: string }
  assignee: { name: string }
}

type EmailGroup = {
  emailId: string
  emailStatus: string
  from: string
  subject: string
  receivedAt: string
  tasks: Task[]
}

type Assignee = { id: string; name: string }

type PreviewData = { emailId: string; to: string; subject: string; body: string }

type StatusFilter = "all" | "processed" | "ready" | "completed"

function extractSenderName(from: string) {
  const match = from.match(/^(.+?)\s*</)
  return match ? match[1].trim().replace(/^"|"$/g, "") : from
}

function extractEmail(from: string) {
  const match = from.match(/<(.+?)>/)
  return match ? match[1] : from
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleString("ko-KR", {
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return ""
  const d = new Date(deadline)
  const dateStr = d.toLocaleDateString("ko-KR")
  const h = d.getHours(), m = d.getMinutes()
  if (h === 0 && m === 0) return dateStr
  return `${dateStr} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`
}

const EMAIL_STATUS_LABEL: Record<string, string> = {
  processed: "진행 중",
  ready: "발송 대기",
  completed: "발송 완료",
}

const EMAIL_STATUS_STYLE: Record<string, string> = {
  processed: "bg-blue-100 text-blue-700",
  ready: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
}

export default function AdminClient({ assignees }: { assignees: Assignee[] }) {
  const [groups, setGroups] = useState<EmailGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [polling, setPolling] = useState(false)
  const [pollResult, setPollResult] = useState<string | null>(null)
  const [sending, setSending] = useState<Set<string>>(new Set())
  const [previewing, setPreviewing] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [view, setView] = useState<"email" | "date">("email")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  function loadTasks() {
    fetch("/api/tasks")
      .then(r => r.json())
      .then((tasks: Task[]) => {
        const map = new Map<string, EmailGroup>()
        for (const task of tasks) {
          if (!map.has(task.email.id)) {
            map.set(task.email.id, {
              emailId: task.email.id,
              emailStatus: task.email.status,
              from: task.email.from,
              subject: task.email.subject,
              receivedAt: task.email.receivedAt,
              tasks: [],
            })
          }
          map.get(task.email.id)!.tasks.push(task)
        }
        const newGroups = Array.from(map.values())
        setGroups(newGroups)
        setLoading(false)
        setExpanded(prev => {
          const next = new Set(prev)
          newGroups.filter(g => g.emailStatus === "ready").forEach(g => next.add(g.emailId))
          return next
        })
      })
  }

  useEffect(() => { loadTasks() }, [])

  function toggleExpand(emailId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(emailId) ? next.delete(emailId) : next.add(emailId)
      return next
    })
  }

  async function handleReassign(taskId: string, newAssigneeId: string) {
    await fetch("/api/tasks/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, newAssigneeId }),
    })
    setGroups(prev =>
      prev.map(g => ({
        ...g,
        tasks: g.tasks.map(t =>
          t.id === taskId
            ? { ...t, assignee: { name: assignees.find(a => a.id === newAssigneeId)?.name ?? "" } }
            : t
        ),
      }))
    )
  }

  async function handlePreviewSummary(emailId: string, regenerate = false) {
    if (previewing.has(emailId)) return
    setPreviewing(prev => new Set([...prev, emailId]))
    try {
      const res = await fetch("/api/admin/preview-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, regenerate }),
      })
      const data = await res.json()
      setPreview({ emailId, to: data.to, subject: data.subject, body: data.body })
    } finally {
      setPreviewing(prev => { const s = new Set(prev); s.delete(emailId); return s })
    }
  }

  async function handleSendSummary() {
    if (!preview || sending.has(preview.emailId)) return
    const emailId = preview.emailId
    setSending(prev => new Set([...prev, emailId]))
    try {
      await fetch("/api/admin/send-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, subject: preview.subject, body: preview.body }),
      })
      setGroups(prev =>
        prev.map(g => g.emailId === emailId ? { ...g, emailStatus: "completed" } : g)
      )
      setPreview(null)
    } finally {
      setSending(prev => { const s = new Set(prev); s.delete(emailId); return s })
    }
  }

  async function handlePoll() {
    setPolling(true)
    setPollResult(null)
    try {
      const res = await fetch("/api/admin/poll", { method: "POST" })
      const data = await res.json()
      setPollResult(`이메일 ${data.total}개 중 ${data.processed}개 처리 완료`)
      loadTasks()
    } catch {
      setPollResult("오류가 발생했습니다.")
    } finally {
      setPolling(false)
    }
  }

  const totalEmails = groups.length
  const inProgressEmails = groups.filter(g => g.emailStatus === "processed").length
  const readyEmails = groups.filter(g => g.emailStatus === "ready").length
  const completedEmails = groups.filter(g => g.emailStatus === "completed").length

  // 이메일별 뷰 필터
  const filteredGroups = statusFilter === "all"
    ? groups
    : groups.filter(g => g.emailStatus === statusFilter)

  // 날짜별 뷰
  const allTasks = groups.flatMap(g => g.tasks.map(t => ({ ...t, emailFrom: g.from, emailSubject: g.subject })))
  const pendingTasks = allTasks.filter(t => t.status !== "done")
  const doneTasks = allTasks.filter(t => t.status === "done" && t.completedAt)
  const tasksByDate: Record<string, typeof doneTasks> = {}
  for (const t of doneTasks) {
    const dateKey = new Date(t.completedAt!).toLocaleDateString("ko-KR")
    if (!tasksByDate[dateKey]) tasksByDate[dateKey] = []
    tasksByDate[dateKey].push(t)
  }
  const sortedDates = Object.keys(tasksByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

  const FILTER_OPTIONS: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "전체", count: totalEmails },
    { value: "processed", label: "진행 중", count: inProgressEmails },
    { value: "ready", label: "발송 대기", count: readyEmails },
    { value: "completed", label: "발송 완료", count: completedEmails },
  ]

  return (
    <div className="h-full">
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">업무 현황</h1>
          <p className="text-sm text-slate-400 mt-0.5">수신된 이메일의 업무 처리 현황을 확인합니다</p>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">전체</p>
            <p className="text-2xl font-bold text-gray-800">{totalEmails}</p>
          </div>
          <div className="bg-white rounded-xl border border-blue-100 px-4 py-3">
            <p className="text-xs text-blue-400 mb-1">진행 중</p>
            <p className="text-2xl font-bold text-blue-600">{inProgressEmails}</p>
          </div>
          <div className="bg-white rounded-xl border border-orange-100 px-4 py-3">
            <p className="text-xs text-orange-400 mb-1">발송 대기</p>
            <p className="text-2xl font-bold text-orange-500">{readyEmails}</p>
          </div>
          <div className="bg-white rounded-xl border border-green-100 px-4 py-3">
            <p className="text-xs text-green-400 mb-1">발송 완료</p>
            <p className="text-2xl font-bold text-green-600">{completedEmails}</p>
          </div>
        </div>

        {/* 이메일 가져오기 + 탭 */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePoll}
              disabled={polling}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50 transition-colors font-medium"
            >
              {polling ? "가져오는 중..." : "📧 이메일 가져오기"}
            </button>
            {pollResult && <span className="text-sm text-gray-500">{pollResult}</span>}
          </div>
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-sm">
            <button
              onClick={() => setView("email")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${view === "email" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
            >
              이메일별
            </button>
            <button
              onClick={() => setView("date")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${view === "date" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
            >
              날짜별
            </button>
          </div>
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-400">불러오는 중...</p>
          </div>
        )}

        {/* 날짜별 처리 현황 */}
        {!loading && view === "date" && (
          <div>
            {/* 미완료 업무 */}
            {pendingTasks.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-semibold text-gray-600">미완료 업무</p>
                  <span className="text-xs text-white bg-orange-400 px-2 py-0.5 rounded-full">{pendingTasks.length}건</span>
                </div>
                <div className="space-y-1.5">
                  {pendingTasks.map(task => (
                    <div key={task.id} className="bg-white border border-orange-100 rounded-lg px-4 py-3 flex items-start gap-3">
                      <span className="text-orange-300 shrink-0 mt-0.5">○</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800">{task.title}</p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {extractSenderName(task.emailFrom)} · {task.emailSubject}
                        </p>
                        {task.deadline && (
                          <p className="text-xs text-orange-500 mt-0.5">마감 {formatDeadline(task.deadline)}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-medium text-gray-600">{task.assignee.name}</p>
                        <p className="text-xs text-gray-400">{task.taskType}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 날짜별 완료 */}
            {sortedDates.length === 0 && pendingTasks.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm border-2 border-dashed rounded-xl">
                처리된 업무가 없습니다.
              </div>
            ) : (
              <div className="space-y-6">
                {sortedDates.map(date => (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm font-semibold text-gray-600">{date}</p>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tasksByDate[date].length}건 처리</span>
                    </div>
                    <div className="space-y-1.5">
                      {tasksByDate[date].map(task => (
                        <div key={task.id} className="bg-white border border-gray-100 rounded-lg px-4 py-3 flex items-start gap-3">
                          <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-700">{task.title}</p>
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                              {extractSenderName(task.emailFrom)} · {task.emailSubject}
                            </p>
                            {task.completionNote && (
                              <div className="mt-1.5 inline-block bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
                                <p className="text-xs text-gray-500">{task.completionNote}</p>
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-medium text-gray-600">{task.assignee.name}</p>
                            <p className="text-xs text-gray-400">{task.taskType}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 이메일별 accordion */}
        {!loading && view === "email" && (
          <div>
            {/* 상태 필터 */}
            {groups.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {FILTER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border ${
                      statusFilter === opt.value
                        ? "bg-gray-800 text-white border-gray-800"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {opt.label}
                    {opt.count > 0 && (
                      <span className={`ml-1.5 ${statusFilter === opt.value ? "text-gray-300" : "text-gray-400"}`}>
                        {opt.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {groups.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm border-2 border-dashed rounded-xl">
                아직 처리된 이메일이 없습니다.<br />위 버튼으로 이메일을 가져오세요.
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm border-2 border-dashed rounded-xl">
                해당 상태의 이메일이 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredGroups.map(group => {
                  const isOpen = expanded.has(group.emailId)
                  const doneCount = group.tasks.filter(t => t.status === "done").length

                  return (
                    <div key={group.emailId} className="bg-white border rounded-xl overflow-hidden border-gray-200 shadow-sm">
                      <div
                        onClick={() => toggleExpand(group.emailId)}
                        className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer select-none"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${EMAIL_STATUS_STYLE[group.emailStatus] ?? "bg-gray-100 text-gray-600"}`}>
                                {EMAIL_STATUS_LABEL[group.emailStatus] ?? group.emailStatus}
                              </span>
                              <span className="text-xs text-gray-400">{doneCount}/{group.tasks.length} 완료</span>
                              <span className="text-xs text-gray-300 hidden sm:inline">·</span>
                              <span className="text-xs text-gray-400 hidden sm:inline">
                                {new Date(group.receivedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="font-medium text-gray-800 truncate">{group.subject}</p>
                            <p className="text-sm text-gray-500 truncate">
                              {extractSenderName(group.from)} &lt;{extractEmail(group.from)}&gt;
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {group.emailStatus === "ready" && (
                              <button
                                onClick={e => { e.stopPropagation(); handlePreviewSummary(group.emailId) }}
                                disabled={previewing.has(group.emailId)}
                                className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 transition-colors"
                              >
                                {previewing.has(group.emailId) ? "불러오는 중..." : "📤 메일 발송"}
                              </button>
                            )}
                            {group.emailStatus === "completed" && (
                              <span className="text-xs text-green-600 font-medium">✅ 완료</span>
                            )}
                            <span className="text-gray-300 text-xs">{isOpen ? "▲" : "▼"}</span>
                          </div>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="divide-y divide-gray-50 border-t border-gray-100">
                          {group.tasks.map(task => (
                            <div key={task.id} className="px-4 py-3 flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${task.status === "done" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                    {task.status === "done" ? "완료" : "대기"}
                                  </span>
                                  <span className="text-xs text-gray-400">{task.taskType}</span>
                                  {task.deadline && task.status !== "done" && (
                                    <span className="text-xs text-orange-500">마감 {formatDeadline(task.deadline)}</span>
                                  )}
                                </div>
                                <p className={`text-sm font-medium ${task.status === "done" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                                  {task.title}
                                </p>
                                {task.completionNote && (
                                  <div className="mt-1.5 inline-block bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
                                    <p className="text-xs text-gray-500">{task.completionNote}</p>
                                  </div>
                                )}
                                {task.completedAt && (
                                  <p className="text-xs text-gray-400 mt-1">완료 {formatDateTime(task.completedAt)}</p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-sm font-medium text-gray-700">{task.assignee.name}</p>
                                {task.status !== "done" && (
                                  <select
                                    className="text-xs border border-gray-200 rounded-md px-1.5 py-1 mt-1 text-gray-600 bg-white"
                                    onChange={e => handleReassign(task.id, e.target.value)}
                                    defaultValue=""
                                  >
                                    <option value="" disabled>재배정</option>
                                    {assignees.map(a => (
                                      <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 미리보기 모달 */}
        {preview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">발송 메일 미리보기</h2>
                <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-400 mb-1">받는 사람</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{preview.to}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">제목</p>
                  <input
                    type="text"
                    value={preview.subject}
                    onChange={e => setPreview(prev => prev ? { ...prev, subject: e.target.value } : prev)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">본문</p>
                  <textarea
                    value={preview.body}
                    onChange={e => setPreview(prev => prev ? { ...prev, body: e.target.value } : prev)}
                    rows={10}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 resize-y focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
              </div>
              <div className="px-5 py-4 border-t flex justify-between items-center">
                <button
                  onClick={() => handlePreviewSummary(preview.emailId, true)}
                  disabled={previewing.has(preview.emailId)}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  {previewing.has(preview.emailId) ? "생성 중..." : "↺ 다시 생성"}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPreview(null)}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSendSummary}
                    disabled={sending.has(preview.emailId)}
                    className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
                  >
                    {sending.has(preview.emailId) ? "발송 중..." : "📤 메일 발송"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
