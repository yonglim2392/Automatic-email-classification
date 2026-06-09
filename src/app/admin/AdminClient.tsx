"use client"
import { useEffect, useState } from "react"

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

  useEffect(() => {
    fetch("/api/tasks").then(r => r.json()).then(setTasks)
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

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">전체 업무 현황</h1>
        <div className="flex gap-4 text-sm">
          <a href="/admin/rules" className="text-blue-600 underline">배정 규칙</a>
          <a href="/admin/users" className="text-blue-600 underline">담당자 관리</a>
        </div>
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
