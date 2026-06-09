"use client"
import { useEffect, useState } from "react"
import { signOut } from "next-auth/react"

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [polling, setPolling] = useState(false)
  const [pollResult, setPollResult] = useState<string | null>(null)
  const [sending, setSending] = useState<Set<string>>(new Set())

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
        // 발송 대기 상태는 자동 펼침
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

  async function handleSendSummary(emailId: string) {
    if (sending.has(emailId)) return
    setSending(prev => new Set([...prev, emailId]))
    try {
      await fetch("/api/admin/send-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      })
      setGroups(prev =>
        prev.map(g => g.emailId === emailId ? { ...g, emailStatus: "completed" } : g)
      )
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
  const completedEmails = groups.filter(g => g.emailStatus === "completed").length
  const pendingEmails = totalEmails - completedEmails

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">전체 업무 현황</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            메일 {totalEmails}개 · 완료 {completedEmails}개 · 대기 {pendingEmails}개
          </p>
        </div>
        <div className="flex gap-2 items-center text-sm">
          <a href="/admin/rules" className="text-blue-600 underline">배정 규칙</a>
          <a href="/admin/users" className="text-blue-600 underline">담당자 관리</a>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* 이메일 가져오기 */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={handlePoll}
          disabled={polling}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
        >
          {polling ? "가져오는 중..." : "📧 이메일 가져오기"}
        </button>
        {pollResult && <span className="text-sm text-gray-600">{pollResult}</span>}
      </div>

      {/* 메일별 accordion */}
      {groups.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm border-2 border-dashed rounded-xl">
          아직 처리된 이메일이 없습니다.<br />위 버튼으로 이메일을 가져오세요.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => {
            const isOpen = expanded.has(group.emailId)
            const doneCount = group.tasks.filter(t => t.status === "done").length
            const isSending = sending.has(group.emailId)

            return (
              <div key={group.emailId} className="border rounded-xl overflow-hidden border-gray-200">
                {/* 헤더 (클릭 시 펼침) */}
                <button
                  onClick={() => toggleExpand(group.emailId)}
                  className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${EMAIL_STATUS_STYLE[group.emailStatus] ?? "bg-gray-100 text-gray-600"}`}>
                          {EMAIL_STATUS_LABEL[group.emailStatus] ?? group.emailStatus}
                        </span>
                        <span className="text-xs text-gray-400">
                          {doneCount}/{group.tasks.length} 완료
                        </span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-400">
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
                          onClick={e => { e.stopPropagation(); handleSendSummary(group.emailId) }}
                          disabled={isSending}
                          className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded font-medium disabled:opacity-50"
                        >
                          {isSending ? "발송 중..." : "📤 요약 메일 발송"}
                        </button>
                      )}
                      {group.emailStatus === "completed" && (
                        <span className="text-xs text-green-600 font-medium">✅ 발송 완료</span>
                      )}
                      <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                </button>

                {/* 펼쳐진 내용 */}
                {isOpen && (
                  <div className="divide-y divide-gray-100">
                    {group.tasks.map(task => (
                      <div key={task.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${task.status === "done" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                              {task.status === "done" ? "완료" : "대기"}
                            </span>
                            <span className="text-xs text-gray-400">{task.taskType}</span>
                            {task.deadline && task.status !== "done" && (
                              <span className="text-xs text-orange-500">
                                마감 {new Date(task.deadline).toLocaleDateString("ko-KR")}
                              </span>
                            )}
                          </div>
                          <p className={`text-sm font-medium ${task.status === "done" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                            {task.title}
                          </p>
                          {task.completionNote && (
                            <p className="text-xs text-gray-400 mt-0.5">메모: {task.completionNote}</p>
                          )}
                          {task.completedAt && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              완료: {formatDateTime(task.completedAt)}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium text-gray-700">{task.assignee.name}</p>
                          {task.status !== "done" && (
                            <select
                              className="text-xs border rounded px-1 py-0.5 mt-1"
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
  )
}
