import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AdminSidebar from "@/components/AdminSidebar"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || session.user.role !== "admin") redirect("/login")

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <AdminSidebar userName={session.user.name ?? "관리자"} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
