"use client"
import { useEffect, useRef, useState } from "react"
import { signOut } from "next-auth/react"
import { useToast } from "@/hooks/useToast"
import { ToastContainer } from "@/components/ToastContainer"

type Attachment = { id: string; filename: string; mimeType: string; size: number; uploadedAt: string }

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
  adminFeedback: string | null
  adminFeedbackBy: string | null
  email: { id: string; from: string; subject: string; receivedAt: string }
  assignee: { name: string }
  attachments: Attachment[]
}

type EmailGroup = { emailId: string; from: string; subject: string; receivedAt: string; tasks: Task[] }
type BuyerGroup = { buyerKey: string; buyerName: string; emails: EmailGroup[] }
type EmailDetail = { from: string; subject: string; receivedAt: string; body: string }

function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return ""
  const d = new Date(deadline)
  const dateStr = d.toLocaleDateString("ko-KR")
  const h = d.getHours(), m = d.getMinutes()
  if (h === 0 && m === 0) return dateStr
  return `${dateStr} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
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

function DeadlinePill({ deadline }: { deadline: string | null }) {
  const dl = daysLeft(deadline)
  if (dl === null) return null
  if (dl < 0) return <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">D+{Math.abs(dl)} 초과</span>
  if (dl === 0) return <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-semibold animate-pulse">오늘 마감</span>
  if (dl <= 3) return <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">D-{dl}</span>
  if (dl <= 7) return <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">D-{dl}</span>
  return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">D-{dl}</span>
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden animate-pulse">
      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <div className="h-5 bg-gray-100 rounded-md w-16" />
          <div className="h-5 bg-gray-100 rounded-md w-10" />
        </div>
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-2/3" />
        <div className="flex gap-2 mt-2">
          <div className="h-9 bg-gray-100 rounded-lg flex-1" />
          <div className="h-9 bg-green-100 rounded-lg w-16" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardClient({ userName }: { userName: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [completionNote, setCompletionNote] = useState<Record<string, string>>({})
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set())
  const [doneView, setDoneView] = useState<"date" | "buyer">("buyer")

  const { toasts, toast, dismiss } = useToast()
  const prevPendingCount = useRef<number | null>(null)

  // 드래그&드롭
  const [dragOver, setDragOver] = useState<string | null>(null)
  // 파일 삭제 2단계 확인
  const [confirmDeleteAtt, setConfirmDeleteAtt] = useState<string | null>(null)
  const confirmDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 이메일 원문 모달
  const [emailModal, setEmailModal] = useState<{ task: Task; detail: EmailDetail | null } | null>(null)
  const [loadingEmail, setLoadingEmail] = useState(false)

  // 완료 취소 / 메모 수정
  const [editNoteId, setEditNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [reopening, setReopening] = useState<Set<string>>(new Set())

  // 파일 업로드
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  // 비밀번호 변경
  const [pwModal, setPwModal] = useState(false)
  const [pwCurrent, setPwCurrent] = useState("")
  const [pwNew, setPwNew] = useState("")
  const [pwConfirm, setPwConfirm] = useState("")
  const [pwError, setPwError] = useState("")
  const [pwSaving, setPwSaving] = useState(false)

  function loadTasks() {
    fetch("/api/tasks")
      .then(r => { if (!r.ok) throw new Error("fetch failed"); return r.json() })
      .then((data: Task[]) => {
        const pendingCount = data.filter(t => t.status !== "done").length
        if (prevPendingCount.current !== null && pendingCount > prevPendingCount.current) {
          const diff = pendingCount - prevPendingCount.current
          toast(`새 업무 ${diff}건이 배정됐습니다`, "info")
        }
        prevPendingCount.current = pendingCount
        setTasks(data)
        setLoading(false)
        setCollapsedDates(prev => {
          if (prev.size > 0) return prev
          const done = data.filter(t => t.status === "done")
          return new Set(done.map(t => new Date(t.email.receivedAt).toLocaleDateString("ko-KR")))
        })
      })
      .catch(() => { /* 서버 재시작 중이거나 네트워크 오류 */ })
  }

  useEffect(() => {
    loadTasks()
    const timer = setInterval(loadTasks, 30_000)
    return () => clearInterval(timer)
  }, [])

  const pending = tasks.filter(t => t.status !== "done")
  useEffect(() => {
    document.title = pending.length > 0 ? `(${pending.length}) 내 업무` : "내 업무"
  }, [pending.length])

  async function openEmailModal(task: Task) {
    setEmailModal({ task, detail: null })
    setLoadingEmail(true)
    try {
      const res = await fetch(`/api/tasks/email-body?emailId=${task.email.id}`)
      if (res.ok) {
        const data = await res.json()
        setEmailModal({ task, detail: data })
      }
    } catch { /* 무시 */ } finally {
      setLoadingEmail(false)
    }
  }

  async function handleComplete(taskId: string) {
    if (completing.has(taskId)) return
    setCompleting(prev => new Set([...prev, taskId]))
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, completionNote: completionNote[taskId] ?? "" }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast(data.error ?? "완료 처리에 실패했습니다", "error")
        return
      }
      setCompletionNote(prev => { const n = { ...prev }; delete n[taskId]; return n })
      toast("업무를 완료했습니다", "success")
      loadTasks()
    } finally {
      setCompleting(prev => { const s = new Set(prev); s.delete(taskId); return s })
    }
  }

  async function handleReopen(taskId: string) {
    setReopening(prev => new Set([...prev, taskId]))
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      })
      if (!res.ok) { toast("취소에 실패했습니다", "error"); return }
      toast("완료가 취소됐습니다", "info")
      loadTasks()
    } finally {
      setReopening(prev => { const s = new Set(prev); s.delete(taskId); return s })
    }
  }

  async function handleSaveNote(taskId: string) {
    setSavingNote(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completionNote: editNoteText }),
      })
      if (!res.ok) { toast("저장에 실패했습니다", "error"); return }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completionNote: editNoteText } : t))
      setEditNoteId(null)
      toast("메모가 저장됐습니다", "success")
    } finally {
      setSavingNote(false)
    }
  }

  async function handleUploadFile(taskId: string, file: File) {
    if (file.size > 10 * 1024 * 1024) { toast("파일 크기는 10MB 이하여야 합니다", "error"); return }
    setUploading(prev => ({ ...prev, [taskId]: true }))
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast(data.error ?? "파일 업로드에 실패했습니다", "error")
        return
      }
      toast(`${file.name} 첨부 완료`, "success")
      loadTasks()
    } finally {
      setUploading(prev => ({ ...prev, [taskId]: false }))
    }
  }

  function handleDeleteAttachmentClick(attId: string) {
    if (confirmDeleteAtt === attId) {
      // 2번째 클릭 → 실제 삭제
      if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current)
      setConfirmDeleteAtt(null)
      doDeleteAttachment(attId)
    } else {
      // 1번째 클릭 → 확인 대기
      if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current)
      setConfirmDeleteAtt(attId)
      confirmDeleteTimer.current = setTimeout(() => setConfirmDeleteAtt(null), 3000)
    }
  }

  async function doDeleteAttachment(attId: string) {
    const res = await fetch(`/api/attachments/${attId}`, { method: "DELETE" })
    if (!res.ok) { toast("삭제에 실패했습니다", "error"); return }
    toast("파일을 삭제했습니다", "info")
    loadTasks()
  }

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
      toast("비밀번호가 변경됐습니다", "success")
    } finally {
      setPwSaving(false)
    }
  }

  function toggleDate(date: string) {
    setCollapsedDates(prev => { const n = new Set(prev); n.has(date) ? n.delete(date) : n.add(date); return n })
  }

  function toggleBuyer(key: string) {
    setExpandedBuyers(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const done = tasks.filter(t => t.status === "done")
  const sortedPending = [...pending].sort((a, b) => {
    const aHas = a.deadline !== null, bHas = b.deadline !== null
    if (aHas !== bHas) return aHas ? -1 : 1
    if (!aHas && !bHas) return new Date(a.email.receivedAt).getTime() - new Date(b.email.receivedAt).getTime()
    return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
  })

  // 완료 업무 그룹
  const emailGroupMap = new Map<string, EmailGroup>()
  for (const t of done) {
    if (!emailGroupMap.has(t.email.id)) {
      emailGroupMap.set(t.email.id, { emailId: t.email.id, from: t.email.from, subject: t.email.subject, receivedAt: t.email.receivedAt, tasks: [] })
    }
    emailGroupMap.get(t.email.id)!.tasks.push(t)
  }

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
    .map(([date, { tasks: dt }]) => ({
      date,
      tasks: [...dt].sort((a, b) => new Date(b.completedAt ?? b.email.receivedAt).getTime() - new Date(a.completedAt ?? a.email.receivedAt).getTime()),
    }))

  const buyerMap = new Map<string, BuyerGroup>()
  for (const eg of emailGroupMap.values()) {
    const key = extractEmail(eg.from).toLowerCase()
    if (!buyerMap.has(key)) buyerMap.set(key, { buyerKey: key, buyerName: extractSenderName(eg.from), emails: [] })
    buyerMap.get(key)!.emails.push(eg)
  }
  const buyers = [...buyerMap.values()]
    .sort((a, b) => Math.max(...b.emails.map(e => new Date(e.receivedAt).getTime())) - Math.max(...a.emails.map(e => new Date(e.receivedAt).getTime())))
    .map(buyer => ({
      ...buyer,
      allTasks: buyer.emails.flatMap(e => e.tasks).sort((a, b) =>
        new Date(b.completedAt ?? b.email.receivedAt).getTime() - new Date(a.completedAt ?? a.email.receivedAt).getTime()
      ),
    }))

  function renderTaskRow(task: Task, showBuyer = false) {
    const isEditingNote = editNoteId === task.id
    return (
      <div key={task.id} className="px-4 py-3">
        {isEditingNote ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">{task.title}</p>
            <div className="flex gap-2">
              <input
                autoFocus
                className="flex-1 text-sm border border-indigo-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={editNoteText}
                onChange={e => setEditNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveNote(task.id); if (e.key === "Escape") setEditNoteId(null) }}
                placeholder="완료 메모"
              />
              <button onClick={() => handleSaveNote(task.id)} disabled={savingNote}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                저장
              </button>
              <button onClick={() => setEditNoteId(null)}
                className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                취소
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-green-400 text-xs shrink-0">✓</span>
            <button onClick={() => openEmailModal(task)} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-700 leading-snug">{task.title}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {showBuyer && <span className="text-xs text-gray-400">{extractSenderName(task.email.from)}</span>}
                {task.completedByName && task.completedByName !== userName && (
                  <span className="text-xs text-indigo-400">처리: {task.completedByName}</span>
                )}
                {task.completionNote && <span className="text-xs text-gray-400 italic">{task.completionNote}</span>}
              </div>
            </button>
            <div className="shrink-0 flex items-center gap-2">
              <div className="text-right">
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md block">{task.taskType}</span>
                <span className="text-xs text-gray-400 mt-0.5 block">{shortDateTime(task.completedAt)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => { setEditNoteId(task.id); setEditNoteText(task.completionNote ?? "") }}
                  className="text-xs text-gray-400 hover:text-indigo-600 px-2 py-0.5 rounded border border-gray-200 hover:border-indigo-300 transition-colors bg-white">
                  메모
                </button>
                <button onClick={() => handleReopen(task.id)} disabled={reopening.has(task.id)}
                  className="text-xs text-gray-400 hover:text-orange-600 px-2 py-0.5 rounded border border-gray-200 hover:border-orange-300 transition-colors bg-white disabled:opacity-40">
                  {reopening.has(task.id) ? "..." : "취소"}
                </button>
              </div>
            </div>
          </div>
        )}
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
          <div className="flex items-center gap-2">
            <button onClick={() => setPwModal(true)}
              className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg transition-colors" title="비밀번호 변경">
              🔑
            </button>
            <button onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-white transition-colors">
              로그아웃
            </button>
          </div>
        </div>

        {/* 스켈레톤 로딩 */}
        {loading && (
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-24 animate-pulse mb-4" />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!loading && (
          <>
            {/* 대기 업무 */}
            {sortedPending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-2xl">✓</div>
                <p className="font-semibold text-gray-700">모든 업무를 처리했습니다</p>
                <p className="text-sm text-gray-400">새로운 업무가 배정되면 여기에 표시됩니다.</p>
              </div>
            ) : (
              <div className="space-y-3 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">대기 중 {sortedPending.length}건</p>
                {sortedPending.map(task => {
                  const dl = daysLeft(task.deadline)
                  const isUrgent = dl !== null && dl <= 3
                  const isWarning = dl !== null && dl > 3 && dl <= 7
                  const isCompleting = completing.has(task.id)
                  const isDragTarget = dragOver === task.id

                  return (
                    <div
                      key={task.id}
                      className={`rounded-xl border bg-white shadow-sm overflow-hidden transition-all duration-300 ${isCompleting ? "opacity-50 scale-[0.98]" : "opacity-100 scale-100"} ${isDragTarget ? "border-indigo-400 ring-2 ring-indigo-200 shadow-md" : isUrgent ? "border-red-300" : isWarning ? "border-orange-200" : "border-gray-200"}`}
                      onDragOver={e => { e.preventDefault(); setDragOver(task.id) }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null) }}
                      onDrop={e => {
                        e.preventDefault(); setDragOver(null)
                        const file = e.dataTransfer.files[0]
                        if (file) handleUploadFile(task.id, file)
                      }}
                    >
                      {isUrgent && (
                        <div className="bg-red-500 px-4 py-1.5 flex items-center gap-1.5">
                          <span className="text-white text-xs font-semibold">⚠ 마감 임박</span>
                          <span className="text-red-200 text-xs">{formatDeadline(task.deadline)} · D-{dl}</span>
                        </div>
                      )}
                      {isWarning && (
                        <div className="bg-orange-400 px-4 py-1.5 flex items-center gap-1.5">
                          <span className="text-white text-xs font-semibold">마감 {dl}일 전</span>
                          <span className="text-orange-100 text-xs">{formatDeadline(task.deadline)}</span>
                        </div>
                      )}
                      {task.adminFeedback && (
                        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start gap-2">
                          <span className="text-amber-500 text-sm shrink-0 mt-0.5">!</span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-amber-700">{task.adminFeedbackBy ?? "관리자"} 수정 요청</p>
                            <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">{task.adminFeedback}</p>
                          </div>
                        </div>
                      )}
                      {/* 드래그 안내 오버레이 */}
                      {isDragTarget && (
                        <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-3 flex items-center justify-center gap-2">
                          <span className="text-indigo-500 text-sm">📎</span>
                          <span className="text-sm font-medium text-indigo-600">파일을 놓으면 첨부됩니다</span>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">{task.taskType}</span>
                          {!isUrgent && !isWarning && <DeadlinePill deadline={task.deadline} />}
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-gray-900 leading-snug">{task.title}</p>
                          <button onClick={() => openEmailModal(task)}
                            className="shrink-0 text-xs text-gray-400 hover:text-indigo-500 border border-gray-200 hover:border-indigo-300 px-2 py-0.5 rounded-md transition-colors mt-0.5">
                            원문
                          </button>
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-600 mt-1.5 leading-relaxed bg-gray-50 rounded-lg px-3 py-2">{task.description}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1.5">{extractSenderName(task.email.from)} · {task.email.subject}</p>
                        {task.deadline && !isUrgent && !isWarning && (
                          <p className="text-xs text-gray-400 mt-0.5">마감 {formatDeadline(task.deadline)}</p>
                        )}

                        {/* 첨부파일 목록 */}
                        {task.attachments.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {task.attachments.map(att => (
                              <div key={att.id} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                                <span className="text-gray-400 text-xs shrink-0">📎</span>
                                <a href={`/api/attachments/${att.id}`} download={att.filename}
                                  className="flex-1 min-w-0 text-xs text-indigo-600 hover:text-indigo-800 truncate">
                                  {att.filename}
                                </a>
                                <span className="text-xs text-gray-400 shrink-0">{formatBytes(att.size)}</span>
                                <button
                                  onClick={() => handleDeleteAttachmentClick(att.id)}
                                  className={`shrink-0 text-xs px-1.5 py-0.5 rounded transition-all ${confirmDeleteAtt === att.id ? "bg-red-500 text-white font-medium" : "text-gray-300 hover:text-red-400"}`}
                                  title={confirmDeleteAtt === att.id ? "한 번 더 클릭하면 삭제됩니다" : "삭제"}
                                >
                                  {confirmDeleteAtt === att.id ? "삭제?" : "✕"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

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
                          <label
                            className={`shrink-0 cursor-pointer border text-sm px-3 py-2 rounded-lg transition-colors flex items-center gap-1 bg-white ${uploading[task.id] ? "border-indigo-200 text-indigo-400" : "border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-300"}`}
                            title="파일 첨부 (또는 드래그&드롭)"
                          >
                            {uploading[task.id] ? (
                              <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                            )}
                            <input type="file" className="hidden" disabled={uploading[task.id]}
                              onChange={e => { const f = e.target.files?.[0]; if (f) { handleUploadFile(task.id, f); e.target.value = "" } }}
                            />
                          </label>
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
                    <button onClick={() => setDoneView("buyer")}
                      className={`px-3 py-1.5 rounded-md font-medium transition-colors ${doneView === "buyer" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
                      바이어별
                    </button>
                    <button onClick={() => setDoneView("date")}
                      className={`px-3 py-1.5 rounded-md font-medium transition-colors ${doneView === "date" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
                      날짜별
                    </button>
                  </div>
                </div>

                {doneView === "date" && (
                  <div className="space-y-3">
                    {sortedDates.map(({ date, tasks: dt }) => {
                      const isCollapsed = collapsedDates.has(date)
                      return (
                        <div key={date} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <button onClick={() => toggleDate(date)}
                            className="w-full px-4 py-3 flex items-center gap-2 hover:bg-gray-50 transition-colors select-none">
                            <p className="text-sm font-semibold text-gray-700">{date}</p>
                            <span className="text-xs text-gray-400">{dt.length}건</span>
                            <span className="ml-auto text-gray-300 text-xs">{isCollapsed ? "▼" : "▲"}</span>
                          </button>
                          {!isCollapsed && (
                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                              {dt.map(t => renderTaskRow(t, true))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {doneView === "buyer" && (
                  <div className="space-y-3">
                    {buyers.map(buyer => {
                      const isOpen = expandedBuyers.has(buyer.buyerKey)
                      return (
                        <div key={buyer.buyerKey} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <button onClick={() => toggleBuyer(buyer.buyerKey)}
                            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors select-none">
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
              <input type="password" placeholder="현재 비밀번호"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} />
              <input type="password" placeholder="새 비밀번호 (4자 이상)"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={pwNew} onChange={e => setPwNew(e.target.value)} />
              <input type="password" placeholder="새 비밀번호 확인"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleChangePassword() }} />
              {pwError && <p className="text-xs text-red-500">{pwError}</p>}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleChangePassword} disabled={pwSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors">
                {pwSaving ? "변경 중..." : "변경"}
              </button>
              <button onClick={() => { setPwModal(false); setPwError(""); setPwCurrent(""); setPwNew(""); setPwConfirm("") }}
                className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-50">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이메일 원문 모달 */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setEmailModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-400 mb-0.5">{extractSenderName(emailModal.task.email.from)}</p>
                  <p className="font-semibold text-gray-800 leading-snug">{emailModal.task.email.subject}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    수신 {new Date(emailModal.task.email.receivedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <button onClick={() => setEmailModal(null)} className="text-gray-300 hover:text-gray-500 transition-colors shrink-0 mt-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                <span className="text-green-500 text-xs">✓</span>
                <span className="text-xs font-medium text-green-700">{emailModal.task.title}</span>
                {emailModal.task.completionNote && (
                  <><span className="text-green-300 text-xs">·</span><span className="text-xs text-green-600">{emailModal.task.completionNote}</span></>
                )}
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {loadingEmail ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : emailModal.detail ? (
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{emailModal.detail.body}</p>
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">이메일을 불러올 수 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
