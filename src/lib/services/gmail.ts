import { google } from "googleapis"
import type { gmail_v1 } from "googleapis"

function getGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return google.gmail({ version: "v1", auth })
}

export type RawEmail = {
  gmailId: string
  from: string
  subject: string
  body: string
  receivedAt: Date
}

export async function listNewEmails(processedGmailIds: string[]): Promise<RawEmail[]> {
  const gmail = getGmailClient()
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults: 50,
  })
  const messages = res.data.messages ?? []
  const newMessages = messages.filter(m => !processedGmailIds.includes(m.id!))

  const emails: RawEmail[] = []
  for (const msg of newMessages) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "full",
    })
    const headers = detail.data.payload?.headers ?? []
    const from = headers.find(h => h.name === "From")?.value ?? ""
    const subject = headers.find(h => h.name === "Subject")?.value ?? ""
    const dateStr = headers.find(h => h.name === "Date")?.value ?? ""
    const body = extractBody(detail.data.payload)
    emails.push({
      gmailId: msg.id!,
      from,
      subject,
      body,
      receivedAt: dateStr ? new Date(dateStr) : new Date(),
    })
  }
  return emails
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const gmail = getGmailClient()
  const message = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n")
  const encoded = Buffer.from(message).toString("base64url")
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  })
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined | null): string {
  if (!payload) return ""
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8")
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part)
      if (text) return text
    }
  }
  return ""
}
