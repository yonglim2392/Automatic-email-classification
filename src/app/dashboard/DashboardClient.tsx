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
  const timeStr = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
  return `${dateStr} ${timeStr}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
}

function extractSenderName(from: string) {
  const match = from.match(/^(.+?)\s*</)
  return match ? match[1].trim().replace(/^"|"$/g, "") : from
}

export default function DashboardClient({ userName }: { userName: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [completionNote, setCompletionNote] = useState<Record<string, string>>({})
  const [completing, setCompleting] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/tasks").then(r => r.json()).then(setTasks)
  }, [])

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

  const pending = tasks.filter(t => t.status !== "done")
  const done = tasks.filter(t => t.status === "done")

  // 완료 업무 일자별 그룹핑
  const doneByDate: Record<string, Task[]> = {}
  for (const t of done) {
    const dateKey = t.completedAt
      ? new Date(t.completedAt).toLocaleDateString("ko-KR")
      : "날짜 미상"
    if (!doneByDate[dateKey]) doneByDate[dateKey] = []
    doneByDate[dateKey].push(t)
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">내 업무</h1>
          <p className="text-sm text-gray-500 mt-0.5">{userName}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* 대기 업무 */}
      {pending.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-10">처리할 업무가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {pending.map(task => {
            const dl = daysLeft(task.deadline)
            const isUrgent = dl !== null && dl <= 3
            const isCompleting = completing.has(task.id)
            return (
              <div
                key={task.id}
                className={`border rounded-xl p-4 ${isUrgent ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"}`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{task.taskType}</span>
                      {isUrgent && <span className="text-xs font-semibold text-red-600">⚠ 마감 임박</span>}
                    </div>
                    <p className="font-semibold text-gray-900">{task.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5 truncate">
                      {extractSenderName(task.email.from)} · {task.email.subject}
                    </p>
                    {task.deadline && (
                      <p className={`text-sm mt-1 ${isUrgent ? "text-red-600 font-medium" : "text-gray-500"}`}>
                        마감 {formatDeadline(task.deadline)}
                        {dl !== null && ` (D-${dl})`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    <input
                      type="text"
                      placeholder="완료 메모 (선택)"
                      className="text-sm border rounded px-2 py-1 w-36"
                      value={completionNote[task.id] ?? ""}
                      onChange={e => setCompletionNote(prev => ({ ...prev, [task.id]: e.target.value }))}
                      disabled={isCompleting}
                    />
                    <button
                      onClick={() => handleComplete(task.id)}
                      disabled={isCompleting}
                      className="bg-green-600 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
      {Object.keys(doneByDate).length > 0 && (
        <div className="mt-10">
          <h2 className="text-base font-semibold text-gray-500 mb-4">완료된 업무</h2>
          <div className="space-y-6">
            {Object.entries(doneByDate).map(([date, dateTasks]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{date}</p>
                <div className="space-y-2">
                  {dateTasks.map(task => (
                    <div key={task.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50 flex items-start gap-3">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-500 line-through">{task.title}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {extractSenderName(task.email.from)} · {task.email.subject}
                          {task.completionNote && ` · "${task.completionNote}"`}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{task.taskType}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
