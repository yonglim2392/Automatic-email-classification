"use client"
import { useEffect, useState } from "react"

type Attachment = {
  id: string
  filename: string
  mimeType: string
  size: number
  uploadedAt: string
}

type Task = {
  id: string
  title: string
  taskType: string
  status: string
  deadline: string | null
  completedAt: string | null
  completionNote: string | null
  completedByName: string | null
  adminFeedback: string | null
  adminFeedbackBy: string | null
  email: {
    id: string; from: string; subject: string; receivedAt: string; status: string
    summarySubject: string | null; summaryBody: string | null
  }
  assignee: { name: string }
  attachments: Attachment[]
}

type EmailGroup = {
  emailId: string
  emailStatus: string
  from: string
  subject: string
  receivedAt: string
  summarySubject: string | null
  summaryBody: string | null
  tasks: Task[]
}

type BuyerGroup = {
  buyerKey: string
  buyerName: string
  buyerEmail: string
  emails: EmailGroup[]
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
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
  failed: "처리 실패",
}

const EMAIL_STATUS_STYLE: Record<string, string> = {
  processed: "bg-blue-100 text-blue-700",
  ready: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-600",
}

export default function AdminClient({ assignees }: { assignees: Assignee[] }) {
  const [groups, setGroups] = useState<EmailGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set())
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [polling, setPolling] = useState(false)
  const [pollResult, setPollResult] = useState<string | null>(null)
  const [sending, setSending] = useState<Set<string>>(new Set())
  const [previewing, setPreviewing] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [view, setView] = useState<"buyer" | "date">("buyer")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  // 이메일 모달 (원문 + 발송 내용 탭)
  type EmailModalData = {
    emailId: string; from: string; subject: string; receivedAt: string
    originalBody: string | null
    summarySubject: string | null; summaryBody: string | null
  }
  const [emailModal, setEmailModal] = useState<EmailModalData | null>(null)
  const [emailModalTab, setEmailModalTab] = useState<"original" | "sent">("original")
  const [loadingEmailBody, setLoadingEmailBody] = useState(false)

  async function openEmailModal(
    emailId: string, from: string, subject: string, receivedAt: string,
    summarySubject: string | null, summaryBody: string | null,
    defaultTab: "original" | "sent" = "original",
  ) {
    setEmailModal({ emailId, from, subject, receivedAt, originalBody: null, summarySubject, summaryBody })
    setEmailModalTab(defaultTab)
    setLoadingEmailBody(true)
    try {
      const res = await fetch(`/api/tasks/email-body?emailId=${emailId}`)
      if (res.ok) {
        const data = await res.json()
        setEmailModal(prev => prev ? { ...prev, originalBody: data.body ?? null } : prev)
      }
    } catch {
      // 원문 로드 실패 — 모달은 열린 상태 유지
    } finally {
      setLoadingEmailBody(false)
    }
  }

  // 관리자 강제 완료
  const [adminCompleteMode, setAdminCompleteMode] = useState<Set<string>>(new Set())
  const [adminCompleteNote, setAdminCompleteNote] = useState<Record<string, string>>({})
  const [adminCompleting, setAdminCompleting] = useState<Set<string>>(new Set())

  // 태스크 인라인 편집
  type EditingTask = { title: string; description: string; taskType: string }
  const [editingTask, setEditingTask] = useState<string | null>(null)
  const [editTaskState, setEditTaskState] = useState<EditingTask>({ title: "", description: "", taskType: "" })
  const [savingTask, setSavingTask] = useState(false)

  // 수정 요청 모달
  type RevisionModal = { taskId: string; taskTitle: string }
  const [revisionModal, setRevisionModal] = useState<RevisionModal | null>(null)
  const [revisionNote, setRevisionNote] = useState("")
  const [requestingRevision, setRequestingRevision] = useState(false)

  function loadTasks() {
    fetch("/api/tasks")
      .then(r => { if (!r.ok) throw new Error("tasks fetch failed"); return r.json() })
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
              summarySubject: task.email.summarySubject,
              summaryBody: task.email.summaryBody,
              tasks: [],
            })
          }
          map.get(task.email.id)!.tasks.push(task)
        }
        const newGroups = Array.from(map.values())
        setGroups(newGroups)
        setLoading(false)

        // 발송 대기 이메일/바이어 자동 펼침
        setExpanded(new Set(newGroups.filter(g => g.emailStatus === "ready").map(g => g.emailId)))
        setExpandedBuyers(new Set(
          newGroups.filter(g => g.emailStatus === "ready").map(g => extractEmail(g.from).toLowerCase())
        ))

        // 날짜별 뷰: 모든 날짜 기본 접힘 (receivedAt 기준)
        const dateSet = new Set(newGroups.map(g => new Date(g.receivedAt).toLocaleDateString("ko-KR")))
        setCollapsedDates(dateSet)
      })
      .catch(() => { /* 서버 재시작 중이거나 네트워크 오류 — 다음 인터벌에 재시도 */ })
  }

  useEffect(() => {
    loadTasks()
    const timer = setInterval(loadTasks, 30_000)
    return () => clearInterval(timer)
  }, [])

  async function handleAdminComplete(taskId: string) {
    if (adminCompleting.has(taskId)) return
    setAdminCompleting(prev => new Set([...prev, taskId]))
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, completionNote: adminCompleteNote[taskId] ?? "" }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? "완료 처리에 실패했습니다.")
        return
      }
      loadTasks()
    } finally {
      setAdminCompleting(prev => { const s = new Set(prev); s.delete(taskId); return s })
      setAdminCompleteMode(prev => { const s = new Set(prev); s.delete(taskId); return s })
      setAdminCompleteNote(prev => { const n = { ...prev }; delete n[taskId]; return n })
    }
  }

  async function handleRequestRevision() {
    if (!revisionModal || requestingRevision) return
    setRequestingRevision(true)
    try {
      await fetch(`/api/tasks/${revisionModal.taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "requestRevision", adminFeedback: revisionNote }),
      })
      setGroups(prev => prev.map(g => ({
        ...g,
        tasks: g.tasks.map(t => t.id === revisionModal.taskId
          ? { ...t, status: "pending", completedAt: null, completionNote: null, completedByName: null, adminFeedback: revisionNote, adminFeedbackBy: "관리자" }
          : t
        ),
      })))
      setRevisionModal(null)
      setRevisionNote("")
    } finally {
      setRequestingRevision(false)
    }
  }

  async function handleSaveTask(taskId: string) {
    setSavingTask(true)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editTaskState),
      })
      setGroups(prev => prev.map(g => ({
        ...g,
        tasks: g.tasks.map(t => t.id === taskId ? { ...t, ...editTaskState } : t),
      })))
      setEditingTask(null)
    } finally {
      setSavingTask(false)
    }
  }

  function toggleExpand(emailId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(emailId) ? next.delete(emailId) : next.add(emailId)
      return next
    })
  }

  function toggleBuyer(buyerKey: string) {
    setExpandedBuyers(prev => {
      const next = new Set(prev)
      next.has(buyerKey) ? next.delete(buyerKey) : next.add(buyerKey)
      return next
    })
  }

  function toggleDate(date: string) {
    setCollapsedDates(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
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
      setPreview(null)
      loadTasks()
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
      const failMsg = data.failed > 0 ? ` · ${data.failed}개 실패` : ""
      setPollResult(`이메일 ${data.total}개 중 ${data.processed}개 처리 완료${failMsg}`)
      loadTasks()
    } catch {
      setPollResult("오류가 발생했습니다.")
    } finally {
      setPolling(false)
    }
  }

  const visibleGroups = groups.filter(g => g.emailStatus !== "skipped")
  const totalEmails = visibleGroups.length
  const inProgressEmails = visibleGroups.filter(g => g.emailStatus === "processed").length
  const readyEmails = visibleGroups.filter(g => g.emailStatus === "ready").length
  const completedEmails = visibleGroups.filter(g => g.emailStatus === "completed").length
  const failedEmails = visibleGroups.filter(g => g.emailStatus === "failed").length

  const FILTER_OPTIONS: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "전체", count: totalEmails },
    { value: "processed", label: "진행 중", count: inProgressEmails },
    { value: "ready", label: "발송 대기", count: readyEmails },
    { value: "completed", label: "발송 완료", count: completedEmails },
  ]

  // 바이어별 그룹
  const filteredGroups = statusFilter === "all" ? visibleGroups : visibleGroups.filter(g => g.emailStatus === statusFilter)
  const buyerMap = new Map<string, BuyerGroup>()
  for (const group of filteredGroups) {
    const key = extractEmail(group.from).toLowerCase()
    if (!buyerMap.has(key)) {
      buyerMap.set(key, { buyerKey: key, buyerName: extractSenderName(group.from), buyerEmail: extractEmail(group.from), emails: [] })
    }
    buyerMap.get(key)!.emails.push(group)
  }
  const buyers = [...buyerMap.values()].sort((a, b) => {
    const aReady = a.emails.some(e => e.emailStatus === "ready")
    const bReady = b.emails.some(e => e.emailStatus === "ready")
    if (aReady !== bReady) return aReady ? -1 : 1
    const aLatest = Math.max(...a.emails.map(e => new Date(e.receivedAt).getTime()))
    const bLatest = Math.max(...b.emails.map(e => new Date(e.receivedAt).getTime()))
    return bLatest - aLatest
  })

  // 날짜별 그룹 (receivedAt 기준): 날짜 → 이메일 → 태스크
  const dateGroupMap = new Map<string, { ts: number; emails: EmailGroup[] }>()
  for (const group of filteredGroups) {
    const ts = new Date(group.receivedAt).getTime()
    const dateKey = new Date(group.receivedAt).toLocaleDateString("ko-KR")
    if (!dateGroupMap.has(dateKey)) dateGroupMap.set(dateKey, { ts, emails: [] })
    const entry = dateGroupMap.get(dateKey)!
    if (entry.ts < ts) entry.ts = ts
    entry.emails.push(group)
  }
  const dateEntries = [...dateGroupMap.entries()]
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([date, { emails }]) => ({
      date,
      emails: [...emails].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    }))

  function renderTaskControls(task: Task) {
    if (task.status === "done") {
      if (task.email.status === "completed") return null
      return (
        <button
          onClick={() => { setRevisionModal({ taskId: task.id, taskTitle: task.title }); setRevisionNote("") }}
          className="mt-1 text-xs border border-amber-200 text-amber-600 px-2.5 py-1 rounded hover:bg-amber-50 transition-colors"
        >
          수정 요청
        </button>
      )
    }
    if (adminCompleteMode.has(task.id)) {
      return (
        <div className="mt-1 space-y-1 min-w-[120px]">
          <input
            type="text"
            placeholder="완료 메모"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-300"
            value={adminCompleteNote[task.id] ?? ""}
            onChange={e => setAdminCompleteNote(prev => ({ ...prev, [task.id]: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") handleAdminComplete(task.id) }}
            autoFocus
          />
          <div className="flex gap-1">
            <button
              onClick={() => handleAdminComplete(task.id)}
              disabled={adminCompleting.has(task.id)}
              className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded disabled:opacity-50 transition-colors"
            >
              {adminCompleting.has(task.id) ? "..." : "확인"}
            </button>
            <button
              onClick={() => setAdminCompleteMode(prev => { const s = new Set(prev); s.delete(task.id); return s })}
              className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1 rounded hover:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-1 mt-1 items-end">
        <select
          className="text-xs border border-gray-200 rounded-md px-1.5 py-1 text-gray-600 bg-white"
          onChange={e => handleReassign(task.id, e.target.value)}
          defaultValue=""
        >
          <option value="" disabled>재배정</option>
          {assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button
          onClick={() => setAdminCompleteMode(prev => new Set([...prev, task.id]))}
          className="text-xs border border-green-200 text-green-600 px-2.5 py-1 rounded hover:bg-green-50 transition-colors"
        >
          완료 처리
        </button>
      </div>
    )
  }

  function renderEmailAccordion(group: EmailGroup) {
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
                <span className="text-xs text-gray-400 hidden sm:inline">
                  · {new Date(group.receivedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="font-medium text-gray-800 truncate text-sm">{group.subject}</p>
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
              <button
                onClick={e => { e.stopPropagation(); openEmailModal(group.emailId, group.from, group.subject, group.receivedAt, group.summarySubject, group.summaryBody) }}
                className="text-xs text-gray-400 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-2 py-0.5 rounded-md transition-colors"
              >
                {group.summaryBody ? "원문/발송" : "원문"}
              </button>
              <span className="text-gray-300 text-xs">{isOpen ? "▲" : "▼"}</span>
            </div>
          </div>
        </div>
        {isOpen && (
          <div className="divide-y divide-gray-50 border-t border-gray-100">
            {group.tasks.map(task => (
              <div key={task.id} className="px-4 py-3">
                {editingTask === task.id ? (
                  <div className="space-y-2">
                    <input
                      className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      value={editTaskState.title}
                      onChange={e => setEditTaskState(s => ({ ...s, title: e.target.value }))}
                      placeholder="업무 제목"
                    />
                    <input
                      className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      value={editTaskState.description}
                      onChange={e => setEditTaskState(s => ({ ...s, description: e.target.value }))}
                      placeholder="상세 내용"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        className="text-sm border border-indigo-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={editTaskState.taskType}
                        onChange={e => setEditTaskState(s => ({ ...s, taskType: e.target.value }))}
                      >
                        {Array.from(new Set(groups.flatMap(g => g.tasks.map(t => t.taskType)))).map(tt => (
                          <option key={tt} value={tt}>{tt}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleSaveTask(task.id)}
                        disabled={savingTask}
                        className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        {savingTask ? "저장 중..." : "저장"}
                      </button>
                      <button
                        onClick={() => setEditingTask(null)}
                        className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${task.status === "done" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {task.status === "done" ? "완료" : "대기"}
                        </span>
                        <span className="text-xs text-gray-400">{task.taskType}</span>
                        {task.deadline && task.status !== "done" && (
                          <span className="text-xs text-orange-500">마감 {formatDeadline(task.deadline)}</span>
                        )}
                        {task.status !== "done" && (
                          <button
                            onClick={() => { setEditingTask(task.id); setEditTaskState({ title: task.title, description: "", taskType: task.taskType }) }}
                            className="text-xs text-gray-300 hover:text-indigo-400 transition-colors ml-1"
                          >
                            수정
                          </button>
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
                      {task.attachments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {task.attachments.map(att => (
                            <a
                              key={att.id}
                              href={`/api/attachments/${att.id}`}
                              download={att.filename}
                              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 group"
                            >
                              <span className="text-gray-400 group-hover:text-indigo-400">📎</span>
                              <span className="truncate max-w-[140px]">{att.filename}</span>
                              <span className="text-gray-400 shrink-0">{formatBytes(att.size)}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      {task.completedAt && (
                        <p className="text-xs text-gray-400 mt-1">
                          완료 {formatDateTime(task.completedAt)}
                          {task.completedByName && ` · ${task.completedByName}`}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-gray-700">{task.assignee.name}</p>
                      {renderTaskControls(task)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">업무 현황</h1>
          <p className="text-sm text-slate-400 mt-0.5">수신된 이메일의 업무 처리 현황을 확인합니다</p>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
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
          <div className={`bg-white rounded-xl border px-4 py-3 ${failedEmails > 0 ? "border-red-200" : "border-gray-100"}`}>
            <p className={`text-xs mb-1 ${failedEmails > 0 ? "text-red-400" : "text-gray-300"}`}>처리 실패</p>
            <p className={`text-2xl font-bold ${failedEmails > 0 ? "text-red-500" : "text-gray-200"}`}>{failedEmails}</p>
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
              onClick={() => setView("buyer")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${view === "buyer" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
            >
              바이어별
            </button>
            <button
              onClick={() => setView("date")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${view === "date" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
            >
              날짜별
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-400">불러오는 중...</p>
          </div>
        )}

        {/* 바이어별 뷰 */}
        {!loading && view === "buyer" && (
          <div>
            {visibleGroups.length > 0 && (
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

            {buyers.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm border-2 border-dashed rounded-xl">
                {visibleGroups.length === 0
                  ? <>아직 처리된 이메일이 없습니다.<br />위 버튼으로 이메일을 가져오세요.</>
                  : "해당 상태의 이메일이 없습니다."}
              </div>
            ) : (
              <div className="space-y-3">
                {buyers.map(buyer => {
                  const isOpen = expandedBuyers.has(buyer.buyerKey)
                  const allTasks = buyer.emails.flatMap(e => e.tasks)
                  const doneCnt = allTasks.filter(t => t.status === "done").length
                  const hasReady = buyer.emails.some(e => e.emailStatus === "ready")
                  const hasProcessed = buyer.emails.some(e => e.emailStatus === "processed")
                  return (
                    <div key={buyer.buyerKey} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <div
                        onClick={() => toggleBuyer(buyer.buyerKey)}
                        className="px-4 py-3.5 flex items-center gap-3 cursor-pointer select-none hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                          <span className="text-indigo-600 text-sm font-semibold">{buyer.buyerName.slice(0, 1)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-800 text-sm">{buyer.buyerName}</p>
                            <span className="text-xs text-gray-400 hidden sm:inline">{buyer.buyerEmail}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">이메일 {buyer.emails.length}개</span>
                            <span className="text-xs text-gray-300">·</span>
                            <span className="text-xs text-gray-400">태스크 {doneCnt}/{allTasks.length} 완료</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {hasReady && <span className="text-xs bg-orange-100 text-orange-600 font-medium px-2 py-0.5 rounded-full">발송 대기</span>}
                          {!hasReady && hasProcessed && <span className="text-xs bg-blue-50 text-blue-500 font-medium px-2 py-0.5 rounded-full">진행 중</span>}
                          {!hasReady && !hasProcessed && <span className="text-xs bg-green-50 text-green-600 font-medium px-2 py-0.5 rounded-full">완료</span>}
                          <span className="text-gray-300 text-xs">{isOpen ? "▲" : "▼"}</span>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/50">
                          {buyer.emails.map(group => renderEmailAccordion(group))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 날짜별 뷰 */}
        {!loading && view === "date" && (
          <div>
            {visibleGroups.length > 0 && (
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

            {dateEntries.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm border-2 border-dashed rounded-xl">
                {visibleGroups.length === 0
                  ? <>아직 처리된 이메일이 없습니다.<br />위 버튼으로 이메일을 가져오세요.</>
                  : "해당 상태의 이메일이 없습니다."}
              </div>
            ) : (
              <div className="space-y-3">
                {dateEntries.map(({ date, emails }) => {
                  const isCollapsed = collapsedDates.has(date)
                  const allDateTasks = emails.flatMap(e => e.tasks)
                  const doneCnt = allDateTasks.filter(t => t.status === "done").length
                  const hasReady = emails.some(e => e.emailStatus === "ready")
                  return (
                    <div key={date} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <button
                        onClick={() => toggleDate(date)}
                        className="w-full px-4 py-3.5 flex items-center gap-2 hover:bg-gray-50 transition-colors select-none text-left"
                      >
                        <p className="text-sm font-semibold text-gray-700">{date}</p>
                        <span className="text-xs text-gray-400">이메일 {emails.length}개</span>
                        <span className="text-gray-300 mx-1 text-xs">·</span>
                        <span className="text-xs text-gray-400">태스크 {doneCnt}/{allDateTasks.length} 완료</span>
                        {hasReady && <span className="text-xs bg-orange-100 text-orange-600 font-medium px-2 py-0.5 rounded-full ml-1">발송 대기</span>}
                        <span className="ml-auto text-gray-300 text-xs">{isCollapsed ? "▼" : "▲"}</span>
                      </button>
                      {!isCollapsed && (
                        <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/30">
                          {emails.map(group => renderEmailAccordion(group))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 이메일 모달 (원문 / 발송 내용 탭) */}
        {emailModal && (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setEmailModal(null)}
          >
            <div
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="px-5 pt-5 pb-0 border-b border-gray-100 shrink-0">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-400 mb-0.5">{extractSenderName(emailModal.from)}</p>
                    <p className="font-semibold text-gray-800 leading-snug">
                      {emailModalTab === "sent" && emailModal.summarySubject
                        ? emailModal.summarySubject
                        : emailModal.subject}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      수신 {new Date(emailModal.receivedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <button onClick={() => setEmailModal(null)} className="text-gray-300 hover:text-gray-500 transition-colors shrink-0 mt-0.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* 탭 - 발송 내용이 있을 때만 표시 */}
                {emailModal.summaryBody && (
                  <div className="flex gap-0 -mb-px">
                    <button
                      onClick={() => setEmailModalTab("original")}
                      className={`text-xs px-4 py-2 border-b-2 font-medium transition-colors ${
                        emailModalTab === "original"
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      원문
                    </button>
                    <button
                      onClick={() => setEmailModalTab("sent")}
                      className={`text-xs px-4 py-2 border-b-2 font-medium transition-colors ${
                        emailModalTab === "sent"
                          ? "border-green-500 text-green-600"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      발송 내용
                    </button>
                  </div>
                )}
              </div>
              {/* 본문 */}
              <div className="overflow-y-auto flex-1 px-5 py-4">
                {emailModalTab === "original" ? (
                  loadingEmailBody ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                  ) : emailModal.originalBody ? (
                    <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{emailModal.originalBody}</p>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-12">이메일을 불러올 수 없습니다.</p>
                  )
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{emailModal.summaryBody}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 수정 요청 모달 */}
        {revisionModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setRevisionModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">수정 요청</h2>
                <p className="text-sm text-gray-400 mt-0.5 truncate">{revisionModal.taskTitle}</p>
              </div>
              <div className="px-5 py-4">
                <label className="text-xs text-gray-400 block mb-2">담당자에게 전달할 피드백</label>
                <textarea
                  value={revisionNote}
                  onChange={e => setRevisionNote(e.target.value)}
                  placeholder="예) 선적 일자를 구체적으로 확인하고 B/L 사본도 첨부해주세요."
                  rows={4}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
                  autoFocus
                />
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                <button onClick={() => setRevisionModal(null)} className="px-4 py-2 text-sm border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50">
                  취소
                </button>
                <button
                  onClick={handleRequestRevision}
                  disabled={requestingRevision || !revisionNote.trim()}
                  className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  {requestingRevision ? "요청 중..." : "수정 요청 보내기"}
                </button>
              </div>
            </div>
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
                  <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
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
