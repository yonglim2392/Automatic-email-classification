"use client"
import { useEffect, useState } from "react"

type User = { id: string; name: string; email: string; role: string }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "assignee" })
  const [msg, setMsg] = useState("")

  useEffect(() => {
    fetch("/api/admin/users").then(r => r.json()).then(setUsers)
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const user = await res.json()
      setUsers(prev => [...prev, user])
      setForm({ name: "", email: "", password: "", role: "assignee" })
      setMsg("계정이 생성되었습니다.")
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">담당자 계정 관리</h1>
        <a href="/admin" className="text-sm text-blue-600 underline">← 관리자</a>
      </div>

      <form onSubmit={handleCreate} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3">
        <h2 className="font-semibold text-sm">새 계정 추가</h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            className="border rounded px-3 py-2 text-sm"
            placeholder="이름"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            required
          />
          <input
            type="email"
            className="border rounded px-3 py-2 text-sm"
            placeholder="이메일"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            required
          />
          <input
            type="password"
            className="border rounded px-3 py-2 text-sm"
            placeholder="비밀번호"
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            required
          />
          <select
            className="border rounded px-3 py-2 text-sm"
            value={form.role}
            onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
          >
            <option value="assignee">담당자</option>
            <option value="admin">관리자</option>
          </select>
        </div>
        <button type="submit" className="bg-blue-600 text-white text-sm px-4 py-2 rounded">추가</button>
        {msg && <p className="text-green-600 text-sm">{msg}</p>}
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-3 py-2 text-left">이름</th>
            <th className="border px-3 py-2 text-left">이메일</th>
            <th className="border px-3 py-2 text-left">역할</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td className="border px-3 py-2">{u.name}</td>
              <td className="border px-3 py-2">{u.email}</td>
              <td className="border px-3 py-2">{u.role === "admin" ? "관리자" : "담당자"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
