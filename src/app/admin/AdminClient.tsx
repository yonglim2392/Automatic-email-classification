"use client"
import { useEffect, useState } from "react"
import { signOut } from "next-auth/react"

type Task = {
  id: string
  title: string
  taskType: string
  status: string
  deadline: string | null
  email: { from: string; subject: string }
  assignee: { name: string }
}

type Assignee = { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  in_progress: "진행중",
  done: "완료",
}

export default function AdminClient({ assignees }: { assignees: Assignee[] }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [polling, setPolling] = useState(false)
  const [pollResult, setPollResult] = useState<string | null>(null)

  function loadTasks() {
    fetch("/api/tasks").then(r => r.json()).then(setTasks)
  }

  useEffect(() => {
    loadTasks()
  }, [])

  async function handleReassign(taskId: string, newAssigneeId: string) {
    await fetch("/api/tasks/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, newAssigneeId }),
    })
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? { ...t, assignee: { name: assignees.find(a => a.id === newAssigneeId)?.name ?? "" } }
          : t,
      ),
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

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">전체 업무 현황</h1>
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

      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={handlePoll}
          disabled={polling}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
        >
          {polling ? "가져오는 중..." : "📧 이메일 가져오기"}
        </button>
        {pollResult && <span className="text-sm text-gray-600">{pollResult}</span>}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-3 py-2 text-left">업무</th>
            <th className="border px-3 py-2 text-left">유형</th>
            <th className="border px-3 py-2 text-left">바이어</th>
            <th className="border px-3 py-2 text-left">마감</th>
            <th className="border px-3 py-2 text-left">상태</th>
            <th className="border px-3 py-2 text-left">담당자</th>
            <th className="border px-3 py-2 text-left">재배정</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr>
              <td colSpan={7} className="border px-3 py-8 text-center text-gray-400">
                업무가 없습니다. 위 버튼으로 이메일을 가져오세요.
              </td>
            </tr>
          )}
          {tasks.map(task => (
            <tr key={task.id} className="hover:bg-gray-50">
              <td className="border px-3 py-2">{task.title}</td>
              <td className="border px-3 py-2">{task.taskType}</td>
              <td className="border px-3 py-2 text-xs">{task.email.from}</td>
              <td className="border px-3 py-2">
                {task.deadline ? new Date(task.deadline).toLocaleDateString("ko-KR") : "-"}
              </td>
              <td className="border px-3 py-2">{STATUS_LABEL[task.status] ?? task.status}</td>
              <td className="border px-3 py-2">{task.assignee.name}</td>
              <td className="border px-3 py-2">
                <select
                  className="text-xs border rounded px-1 py-0.5"
                  onChange={e => handleReassign(task.id, e.target.value)}
                  defaultValue=""
                >
                  <option value="" disabled>변경</option>
                  {assignees.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
