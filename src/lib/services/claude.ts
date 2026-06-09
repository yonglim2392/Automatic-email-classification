import Anthropic from "@anthropic-ai/sdk"

export type ParsedTask = {
  title: string
  description: string
  taskType: string
  deadline: string | null
}

const VALID_TASK_TYPES = ["가격", "배송", "서류", "품질", "생산", "기타"]

export async function parseEmail(subject: string, body: string): Promise<ParsedTask[]> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `다음 이메일에서 업무 목록을 추출하세요. JSON 배열만 반환하고 다른 텍스트는 포함하지 마세요.

제목: ${subject}
본문:
${body}

각 업무마다 다음 형식으로 반환하세요:
[
  {
    "title": "업무 제목 (한 줄 요약)",
    "description": "상세 내용",
    "taskType": "${VALID_TASK_TYPES.join(" | ")} 중 하나",
    "deadline": "YYYY-MM-DD 형식 또는 null"
  }
]`,
      },
    ],
  })

  const text = response.content[0].type === "text" ? response.content[0].text : "[]"
  const parsed: ParsedTask[] = JSON.parse(text)
  return parsed.map(t => ({
    ...t,
    taskType: VALID_TASK_TYPES.includes(t.taskType) ? t.taskType : "기타",
  }))
}

export async function writeSummaryEmail(
  originalSubject: string,
  originalBody: string,
  completedTasks: { title: string; completionNote: string | null; completedAt: Date }[],
): Promise<{ subject: string; body: string }> {
  const client = new Anthropic()
  const taskList = completedTasks
    .map(t => `- ${t.title}${t.completionNote ? `: ${t.completionNote}` : ""} (완료일: ${t.completedAt.toLocaleDateString("ko-KR")})`)
    .join("\n")

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `다음 원본 이메일에 대한 완료 회신 메일을 전문적으로 작성하세요. JSON만 반환하세요.

원본 제목: ${originalSubject}
원본 내용: ${originalBody}

완료된 업무:
${taskList}

형식: {"subject": "Re: 원본제목", "body": "완료 회신 내용"}`,
      },
    ],
  })

  const text = response.content[0].type === "text" ? response.content[0].text : "{}"
  return JSON.parse(text)
}
