import { parseEmail, writeSummaryEmail } from "@/lib/services/claude"

jest.mock("@anthropic-ai/sdk", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  }
})

import Anthropic from "@anthropic-ai/sdk"

describe("parseEmail", () => {
  it("이메일에서 업무 목록을 추출한다", async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { title: "단가표 업데이트", description: "Q3 단가표 수정", taskType: "가격", deadline: "2026-06-15" },
            { title: "선적 서류 준비", description: "B/L 및 인보이스 준비", taskType: "서류", deadline: null },
          ]),
        },
      ],
    })
    ;(Anthropic as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }))

    const result = await parseEmail("6월 업무 요청", "단가표 업데이트 부탁드립니다. 서류도 준비해주세요.")
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe("단가표 업데이트")
    expect(result[0].taskType).toBe("가격")
    expect(result[0].deadline).toBe("2026-06-15")
    expect(result[1].deadline).toBeNull()
  })

  it("알 수 없는 taskType은 '기타'로 폴백한다", async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { title: "알수없는업무", description: "내용", taskType: "알수없음", deadline: null },
          ]),
        },
      ],
    })
    ;(Anthropic as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }))

    const result = await parseEmail("제목", "본문")
    expect(result[0].taskType).toBe("기타")
  })
})

describe("writeSummaryEmail", () => {
  it("완료 업무 목록으로 회신 메일을 작성한다", async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            subject: "Re: 6월 업무 요청",
            body: "모든 업무가 완료되었습니다.",
          }),
        },
      ],
    })
    ;(Anthropic as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }))

    const result = await writeSummaryEmail("6월 업무 요청", "원본 내용", [
      { title: "단가표 업데이트", completionNote: "완료", completedAt: new Date("2026-06-14") },
    ])
    expect(result.subject).toBe("Re: 6월 업무 요청")
    expect(result.body).toBeTruthy()
  })
})
