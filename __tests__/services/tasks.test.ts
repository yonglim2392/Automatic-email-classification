import { completeTask, checkAllTasksDone, getTasksNearDeadline } from "@/lib/services/tasks"
import prisma from "@/lib/prisma"

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    task: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    email: {
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe("completeTask", () => {
  it("본인 업무를 완료 처리한다", async () => {
    ;(mockPrisma.task.findUnique as jest.Mock).mockResolvedValue({
      id: "task-1",
      assigneeId: "user-1",
    })
    ;(mockPrisma.task.update as jest.Mock).mockResolvedValue({})

    await completeTask("task-1", "user-1", "완료했습니다")

    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: expect.objectContaining({ status: "done", completionNote: "완료했습니다" }),
    })
  })

  it("다른 사람 업무는 에러를 던진다", async () => {
    ;(mockPrisma.task.findUnique as jest.Mock).mockResolvedValue({
      id: "task-1",
      assigneeId: "user-2",
    })

    await expect(completeTask("task-1", "user-1", null)).rejects.toThrow("권한 없음")
  })
})

describe("checkAllTasksDone", () => {
  it("모든 업무가 done이면 true를 반환한다", async () => {
    ;(mockPrisma.task.findMany as jest.Mock).mockResolvedValue([
      { status: "done" },
      { status: "done" },
    ])
    const result = await checkAllTasksDone("email-1")
    expect(result).toBe(true)
  })

  it("하나라도 done이 아니면 false를 반환한다", async () => {
    ;(mockPrisma.task.findMany as jest.Mock).mockResolvedValue([
      { status: "done" },
      { status: "pending" },
    ])
    const result = await checkAllTasksDone("email-1")
    expect(result).toBe(false)
  })

  it("업무가 없으면 false를 반환한다", async () => {
    ;(mockPrisma.task.findMany as jest.Mock).mockResolvedValue([])
    const result = await checkAllTasksDone("email-1")
    expect(result).toBe(false)
  })
})

describe("getTasksNearDeadline", () => {
  it("마감 3일 이내 미완료 업무를 반환한다", async () => {
    const nearTask = { id: "task-1", status: "pending", deadline: new Date() }
    ;(mockPrisma.task.findMany as jest.Mock).mockResolvedValue([nearTask])

    const result = await getTasksNearDeadline()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("task-1")
  })
})
