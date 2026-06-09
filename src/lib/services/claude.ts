import { GoogleGenerativeAI } from "@google/generative-ai"

export type ParsedTask = {
  title: string
  description: string
  taskType: string
  deadline: string | null
}

const VALID_TASK_TYPES = ["가격", "배송", "서류", "품질", "생산", "기타"]

function getModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" })
}

export async function parseEmail(subject: string, body: string): Promise<ParsedTask[]> {
  const model = getModel()
  const today = new Date().toISOString().split("T")[0]
  const prompt = `오늘 날짜: ${today}
다음 이메일에서 업무 목록을 추출하세요. JSON 배열만 반환하고 다른 텍스트는 포함하지 마세요.
"내일", "명일", "다음주" 등 상대적 날짜 표현은 오늘 날짜 기준으로 계산하세요.

제목: ${subject}
본문:
${body}

각 업무마다 다음 형식으로 반환하세요:
[
  {
    "title": "업무 제목 (한 줄 요약)",
    "description": "상세 내용",
    "taskType": "${VALID_TASK_TYPES.join(" | ")} 중 하나",
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
      taskType: VALID_TASK_TYPES.includes(t.taskType) ? t.taskType : "기타",
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
      return `- ${t.title}${t.completionNote ? `: ${t.completionNote}` : ""} (완료일: ${completedDate})`
    })
    .join("\n")

  const prompt = `다음 원본 이메일에 대한 완료 회신 메일을 전문적으로 작성하세요. JSON만 반환하세요.

중요: 완료 메모에 "3일 뒤", "다음 주" 등 상대적 날짜 표현이 있으면, 반드시 해당 업무의 완료일(YYYY-MM-DD) 기준으로 날짜를 계산하여 구체적인 날짜로 변환하세요. 오늘 날짜를 기준으로 계산하지 마세요.

원본 제목: ${originalSubject}
원본 내용: ${originalBody}

완료된 업무:
${taskList}

형식: {"subject": "Re: 원본제목", "body": "완료 회신 내용"}`

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : "{}")
  } catch {
    return { subject: `Re: ${originalSubject}`, body: "" }
  }
}
