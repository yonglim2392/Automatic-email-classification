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
  email: { id: string; from: string; subject: string; receivedAt: string }
  assignee: { name: string }
}

type EmailGroup = {
  emailId: string
  from: string
  subject: string
  receivedAt: string
  tasks: Task[]
}

type Assignee = { id: string; name: string }

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  done: "bg-green-100 text-green-700",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  done: "완료",
}

function extractSenderName(from: string) {
  const match = from.match(/^(.+?)\s*</)
  return match ? match[1].trim().replace(/^"|"$/g, "") : from
}

function extractEmail(from: string) {
  const match = from.match(/<(.+?)>/)
  return match ? match[1] : from
}

export default function AdminClient({ assignees }: { assignees: Assignee[] }) {
  const [groups, setGroups] = useState<EmailGroup[]>([])
  const [polling, setPolling] = useState(false)
  const [pollResult, setPollResult] = useState<string | null>(null)

  function loadTasks() {
    fetch("/api/tasks")
      .then(r => r.json())
      .then((tasks: Task[]) => {
        const map = new Map<string, EmailGroup>()
        for (const task of tasks) {
          if (!map.has(task.email.id)) {
            map.set(task.email.id, {
              emailId: task.email.id,
              from: task.email.from,
              subject: task.email.subject,
              receivedAt: task.email.receivedAt,
              tasks: [],
            })
          }
          map.get(task.email.id)!.tasks.push(task)
        }
        setGroups(Array.from(map.values()))
      })
  }

  useEffect(() => { loadTasks() }, [])

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

  const total = groups.reduce((n, g) => n + g.tasks.length, 0)
  const doneCount = groups.reduce((n, g) => n + g.tasks.filter(t => t.status === "done").length, 0)

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">전체 업무 현황</h1>
          <p className="text-sm text-gray-500 mt-0.5">총 {total}개 · 완료 {doneCount}개 · 대기 {total - doneCount}개</p>
        </div>
        <div className="flex gap-2 items-center text-sm">
          <a href="/admin/rules" className="text-blue-600 underline">배정 규칙</a>
          <a href="/admin/users" className="text-blue-600 underline">담당자 관리</a>
          <a href="/dashboard" className="border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50">← 대시보드</a>
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

      {/* 메일별 그룹 카드 */}
      {groups.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm border-2 border-dashed rounded-xl">
          아직 처리된 이메일이 없습니다.<br />위 버튼으로 이메일을 가져오세요.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const allDone = group.tasks.every(t => t.status === "done")
            return (
              <div key={group.emailId} className={`border rounded-xl overflow-hidden ${allDone ? "border-green-200" : "border-gray-200"}`}>
                {/* 원본 메일 헤더 */}
                <div className={`px-4 py-3 ${allDone ? "bg-green-50" : "bg-gray-50"} border-b`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">📧 {group.subject}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        <span className="font-medium">{extractSenderName(group.from)}</span>
                        <span className="text-gray-400"> &lt;{extractEmail(group.from)}&gt;</span>
                        <span className="mx-2">·</span>
                        {new Date(group.receivedAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded font-medium shrink-0 ${allDone ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {allDone ? "전체 완료" : `${group.tasks.filter(t => t.status === "done").length}/${group.tasks.length} 완료`}
                    </span>
                  </div>
                </div>

                {/* 업무 목록 */}
                <div className="divide-y divide-gray-100">
                  {group.tasks.map(task => (
                    <div key={task.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_STYLE[task.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {STATUS_LABEL[task.status] ?? task.status}
                          </span>
                          <span className="text-xs text-gray-400">{task.taskType}</span>
                        </div>
                        <p className={`text-sm font-medium mt-1 ${task.status === "done" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                          {task.title}
                        </p>
                        {task.completionNote && (
                          <p className="text-xs text-gray-400 mt-0.5">메모: {task.completionNote}</p>
                        )}
                        {task.completedAt && (
                          <p className="text-xs text-gray-400">
                            완료일: {new Date(task.completedAt).toLocaleDateString("ko-KR")}
                          </p>
                        )}
                        {task.deadline && task.status !== "done" && (
                          <p className="text-xs text-orange-500 mt-0.5">
                            마감: {new Date(task.deadline).toLocaleDateString("ko-KR")}
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
