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
  email: { from: string; subject: string }
  assignee: { name: string }
}

function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function DashboardClient({ role, userName }: { role: string; userName: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [completionNote, setCompletionNote] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch("/api/tasks").then(r => r.json()).then(setTasks)
  }, [])

  async function handleComplete(taskId: string) {
    await fetch("/api/tasks/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, completionNote: completionNote[taskId] ?? "" }),
    })
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "done" } : t))
  }

  const pending = tasks.filter(t => t.status !== "done")
  const done = tasks.filter(t => t.status === "done")

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">내 업무 목록</h1>
          <p className="text-sm text-gray-500 mt-1">{userName} ({role === "admin" ? "관리자" : "담당자"})</p>
        </div>
        <div className="flex gap-2">
          {role === "admin" && (
            <a href="/admin" className="text-sm border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50">관리자 페이지</a>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
      </div>

      {pending.length === 0 && done.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-12">배정된 업무가 없습니다.</p>
      )}

      <div className="space-y-3">
        {pending.map(task => {
          const dl = daysLeft(task.deadline)
          const isUrgent = dl !== null && dl <= 3
          return (
            <div key={task.id} className={`border rounded-lg p-4 ${isUrgent ? "border-red-400 bg-red-50" : "border-gray-200"}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-sm text-gray-500">{task.email.from} · {task.taskType}</p>
                  {task.deadline && (
                    <p className={`text-sm mt-1 ${isUrgent ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                      마감: {new Date(task.deadline).toLocaleDateString("ko-KR")} {dl !== null && `(D-${dl})`}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <input
                    type="text"
                    placeholder="완료 코멘트 (선택)"
                    className="text-sm border rounded px-2 py-1"
                    value={completionNote[task.id] ?? ""}
                    onChange={e => setCompletionNote(prev => ({ ...prev, [task.id]: e.target.value }))}
                  />
                  <button
                    onClick={() => handleComplete(task.id)}
                    className="bg-green-600 text-white text-sm px-4 py-1 rounded"
                  >
                    완료
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {done.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-400 mb-3">완료된 업무</h2>
          <div className="space-y-2 opacity-60">
            {done.map(task => (
              <div key={task.id} className="border rounded-lg p-3 bg-gray-50">
                <p className="font-medium line-through text-gray-400">{task.title}</p>
                <p className="text-sm text-gray-400">{task.taskType}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
