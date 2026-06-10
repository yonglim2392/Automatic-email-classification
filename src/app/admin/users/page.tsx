"use client"
import { useEffect, useState } from "react"

type User = { id: string; name: string; email: string; role: string }

const ROLE_LABEL: Record<string, string> = { admin: "관리자", assignee: "담당자" }
const ROLE_COLOR: Record<string, string> = {
  admin: "bg-indigo-50 text-indigo-700 border-indigo-100",
  assignee: "bg-slate-50 text-slate-600 border-slate-100",
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "assignee" })
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 비밀번호 초기화 모달
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPw, setResetPw] = useState("")
  const [resetMsg, setResetMsg] = useState("")
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    fetch("/api/admin/users").then(r => r.json()).then(setUsers)
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const user = await res.json()
        setUsers(prev => [...prev, user])
        setForm({ name: "", email: "", password: "", role: "assignee" })
        setMsg({ type: "ok", text: "계정이 생성되었습니다." })
        setTimeout(() => setMsg(null), 2500)
      } else {
        const data = await res.json().catch(() => ({}))
        setMsg({ type: "err", text: data.error ?? "계정 생성에 실패했습니다." })
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword() {
    if (!resetTarget || resetPw.length < 4) { setResetMsg("비밀번호는 4자 이상이어야 합니다"); return }
    setResetting(true); setResetMsg("")
    try {
      const res = await fetch("/api/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: resetPw, targetUserId: resetTarget.id }),
      })
      const data = await res.json()
      if (!res.ok) { setResetMsg(data.error ?? "오류가 발생했습니다"); return }
      setResetTarget(null); setResetPw("")
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-800">담당자 관리</h1>
        <p className="text-sm text-slate-400 mt-0.5">계정을 추가하고 역할을 관리합니다</p>
      </div>

      {/* 새 계정 추가 폼 */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-5 py-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">새 계정 추가</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-slate-400"
              placeholder="이름"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
            />
            <input
              type="email"
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-slate-400"
              placeholder="이메일"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              required
            />
            <input
              type="password"
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-slate-400"
              placeholder="비밀번호"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              required
            />
            <select
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            >
              <option value="assignee">담당자</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {submitting ? "추가 중..." : "계정 추가"}
            </button>
            {msg && (
              <span className={`text-sm font-medium ${msg.type === "ok" ? "text-emerald-500" : "text-red-500"}`}>
                {msg.text}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* 계정 목록 */}
      <div className="space-y-2">
        {users.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">등록된 계정이 없습니다</div>
        ) : (
          users.map(u => (
            <div
              key={u.id}
              className="bg-white border border-slate-100 rounded-xl px-5 py-4 flex items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-slate-500 text-xs font-semibold">{u.name.slice(0, 1)}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{u.name}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${ROLE_COLOR[u.role] ?? ROLE_COLOR.assignee}`}>
                  {ROLE_LABEL[u.role] ?? u.role}
                </span>
                <button
                  onClick={() => { setResetTarget(u); setResetPw(""); setResetMsg("") }}
                  className="text-xs text-slate-400 hover:text-indigo-500 border border-slate-200 hover:border-indigo-300 px-2.5 py-1 rounded-lg transition-colors"
                >
                  비밀번호 초기화
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 비밀번호 초기화 모달 */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setResetTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-slate-800 mb-1">비밀번호 초기화</h2>
            <p className="text-sm text-slate-400 mb-4">{resetTarget.name} ({resetTarget.email})</p>
            <input
              type="password"
              placeholder="새 비밀번호 (4자 이상)"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-2"
              value={resetPw}
              onChange={e => setResetPw(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleResetPassword() }}
              autoFocus
            />
            {resetMsg && <p className="text-xs text-red-500 mb-2">{resetMsg}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleResetPassword}
                disabled={resetting}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {resetting ? "변경 중..." : "초기화"}
              </button>
              <button
                onClick={() => setResetTarget(null)}
                className="flex-1 border border-slate-200 text-slate-600 text-sm py-2.5 rounded-lg hover:bg-slate-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
