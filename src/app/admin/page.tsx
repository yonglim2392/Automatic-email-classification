import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AdminClient from "./AdminClient"
import prisma from "@/lib/prisma"

export default async function AdminPage() {
  const session = await auth()
  if (!session || session.user.role !== "admin") redirect("/dashboard")

  const users = await prisma.user.findMany({
    where: { role: "assignee" },
    select: { id: true, name: true },
  })
  return <AdminClient assignees={users} />
}
