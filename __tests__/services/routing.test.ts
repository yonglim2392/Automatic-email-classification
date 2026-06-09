import { assignTasks } from "@/lib/services/routing"
import prisma from "@/lib/prisma"

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    routingRule: { findMany: jest.fn() },
    user: { findFirst: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe("assignTasks", () => {
  const adminUser = { id: "admin-id", role: "admin" }

  beforeEach(() => {
    ;(mockPrisma.routingRule.findMany as jest.Mock).mockResolvedValue([
      { taskType: "가격", defaultAssigneeId: "user-kim" },
      { taskType: "배송", defaultAssigneeId: "user-lee" },
    ])
    ;(mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(adminUser)
  })

  it("taskType에 맞는 담당자를 배정한다", async () => {
    const tasks = [
      { title: "단가표", description: "", taskType: "가격", deadline: null },
      { title: "선적", description: "", taskType: "배송", deadline: null },
    ]
    const result = await assignTasks(tasks)
    expect(result[0].assigneeId).toBe("user-kim")
    expect(result[1].assigneeId).toBe("user-lee")
  })

  it("매핑 없는 taskType은 관리자에게 배정한다", async () => {
    const tasks = [{ title: "기타업무", description: "", taskType: "기타", deadline: null }]
    const result = await assignTasks(tasks)
    expect(result[0].assigneeId).toBe("admin-id")
  })

  it("관리자 계정이 없으면 에러를 던진다", async () => {
    ;(mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(null)
    const tasks = [{ title: "기타", description: "", taskType: "기타", deadline: null }]
    await expect(assignTasks(tasks)).rejects.toThrow("관리자 계정이 없습니다")
  })
})
