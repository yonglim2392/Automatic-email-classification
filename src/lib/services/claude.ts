import { GoogleGenerativeAI } from "@google/generative-ai"

export type ParsedTask = {
  title: string
  description: string
  taskType: string
  deadline: string | null
}

export type TaskTypeDefinition = {
  taskType: string
  description: string
}

const FALLBACK_TASK_TYPES: TaskTypeDefinition[] = [
  { taskType: "가격", description: "가격 협의, 견적, 할인 요청 관련" },
  { taskType: "배송", description: "배송, 물류, 선적, 납기 관련" },
  { taskType: "서류", description: "인보이스, 서류, 계약서 관련" },
  { taskType: "품질", description: "품질 클레임, 검수, 불량 관련" },
  { taskType: "생산", description: "생산 일정, 샘플, 제조 관련" },
  { taskType: "기타", description: "위 카테고리에 해당하지 않는 기타 업무" },
]

function getModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" })
}

export async function parseEmail(
  subject: string,
  body: string,
  taskTypes: TaskTypeDefinition[] = FALLBACK_TASK_TYPES,
): Promise<ParsedTask[]> {
  const model = getModel()
  const today = new Date().toISOString().split("T")[0]

  const validTypes = taskTypes.map(t => t.taskType)
  const typeGuide = taskTypes.map(t => `- ${t.taskType}: ${t.description}`).join("\n")

  const prompt = `오늘 날짜: ${today}
다음 이메일에서 업무 목록을 추출하세요. JSON 배열만 반환하고 다른 텍스트는 포함하지 마세요.
"내일", "명일", "다음주" 등 상대적 날짜 표현은 오늘 날짜 기준으로 계산하세요.

제목: ${subject}
본문:
${body}

업무 유형 (taskType) 분류 기준:
${typeGuide}

각 업무마다 다음 형식으로 반환하세요:
[
  {
    "title": "업무 제목 (한 줄 요약)",
    "description": "상세 내용",
    "taskType": "${validTypes.join(" | ")} 중 가장 적합한 것",
    "deadline": "YYYY-MM-DDTHH:mm+09:00 형식 (한국 시간 KST 기준). 시간 언급 있으면 해당 시간, 없으면 T00:00+09:00. 마감기한 없으면 null"
  }
]`

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  try {
    const parsed: ParsedTask[] = JSON.parse(jsonMatch ? jsonMatch[0] : "[]")
    return parsed.map(t => ({
      ...t,
      taskType: validTypes.includes(t.taskType) ? t.taskType : (validTypes.includes("기타") ? "기타" : validTypes[0]),
    }))
  } catch {
    return []
  }
}

export async function writeSummaryEmail(
  originalSubject: string,
  originalBody: string,
  completedTasks: { title: string; completionNote: string | null; completedAt: Date }[],
): Promise<{ subject: string; body: string }> {
  const model = getModel()
  const taskList = completedTasks
    .map(t => {
      const completedDate = t.completedAt.toISOString().split("T")[0]
      return `- ${t.title}${t.completionNote ? `: ${t.completionNote}` : ""} (처리일: ${completedDate})`
    })
    .join("\n")

  const prompt = `다음 원본 이메일에 대한 회신 메일을 작성하세요. JSON만 반환하세요.

규칙:
- 상대방의 문의/요청에 직접 답변하는 내용만 작성하세요.
- 내부 처리 날짜, 확인 날짜, 완료 날짜 등 내부 업무 정보는 절대 언급하지 마세요.
- 완료 메모에 "3일 뒤", "다음 주" 등 상대적 날짜 표현이 있으면, 처리일(YYYY-MM-DD) 기준으로 계산하여 구체적인 날짜로 변환하세요.
- 간결하고 자연스러운 비즈니스 어투로 작성하세요.

원본 제목: ${originalSubject}
원본 내용: ${originalBody}

답변할 내용 (완료 메모 기준):
${taskList}

형식: {"subject": "Re: 원본제목", "body": "회신 내용"}`

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : "{}")
  } catch {
    return { subject: `Re: ${originalSubject}`, body: "" }
  }
}
