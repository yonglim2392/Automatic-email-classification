import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

// Prisma 7.x requires a driver adapter for SQLite
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3")

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db"
const adapter = new PrismaBetterSqlite3({ url: dbUrl })

const prisma = new PrismaClient({ adapter })

async function main() {
  const adminPassword = await bcrypt.hash("admin1234", 10)
  const admin = await prisma.user.upsert({
    where: { email: "admin@company.com" },
    update: {},
    create: {
      name: "관리자",
      email: "admin@company.com",
      password: adminPassword,
      role: "admin",
      taskTypes: "[]",
    },
  })

  const users = [
    { name: "김팀장", email: "kim@company.com", taskTypes: '["가격","생산"]' },
    { name: "이대리", email: "lee@company.com", taskTypes: '["배송","서류"]' },
    { name: "박사원", email: "park@company.com", taskTypes: '["품질"]' },
  ]

  const createdUsers: (typeof admin)[] = []
  for (const u of users) {
    const pw = await bcrypt.hash("user1234", 10)
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, password: pw, role: "assignee" },
    })
    createdUsers.push(user)
  }

  const rules = [
    { taskType: "가격", userId: createdUsers[0].id },
    { taskType: "생산", userId: createdUsers[0].id },
    { taskType: "배송", userId: createdUsers[1].id },
    { taskType: "서류", userId: createdUsers[1].id },
    { taskType: "품질", userId: createdUsers[2].id },
    { taskType: "기타", userId: admin.id },
  ]

  for (const rule of rules) {
    await prisma.routingRule.upsert({
      where: { taskType: rule.taskType },
      update: { defaultAssigneeId: rule.userId },
      create: { taskType: rule.taskType, defaultAssigneeId: rule.userId },
    })
  }

  console.log("시드 완료")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
