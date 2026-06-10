import { google } from "googleapis"
import type { gmail_v1 } from "googleapis"

function decodeRfc2047(str: string): string {
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === "B") {
        return Buffer.from(text, "base64").toString("utf-8")
      }
      const cleaned = text.replace(/_/g, " ").replace(/=([A-F0-9]{2})/gi, (_: string, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      )
      return Buffer.from(cleaned, "binary").toString("utf-8")
    } catch {
      return str
    }
  })
}

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
    const from = decodeRfc2047(headers.find(h => h.name === "From")?.value ?? "")
    const subject = decodeRfc2047(headers.find(h => h.name === "Subject")?.value ?? "")
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

function encodeAddressHeader(address: string): string {
  const decoded = decodeRfc2047(address)
  const match = decoded.match(/^(.+?)\s*<(.+?)>$/)
  if (!match) return decoded
  const [, name, email] = match
  const clean = name.trim().replace(/^"|"$/g, "")
  if (!/[^\x00-\x7F]/.test(clean)) return decoded
  return `=?UTF-8?B?${Buffer.from(clean).toString("base64")}?= <${email}>`
}

export type EmailAttachment = {
  filename: string
  content: Buffer
  mimeType: string
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  attachments: EmailAttachment[] = [],
): Promise<void> {
  const gmail = getGmailClient()
  let raw: string

  if (attachments.length === 0) {
    const message = [
      `To: ${encodeAddressHeader(to)}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      body,
    ].join("\r\n")
    raw = Buffer.from(message).toString("base64url")
  } else {
    const boundary = `boundary_${Date.now()}`
    const lines: string[] = [
      `To: ${encodeAddressHeader(to)}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(body).toString("base64"),
    ]
    for (const att of attachments) {
      const encodedName = `=?UTF-8?B?${Buffer.from(att.filename).toString("base64")}?=`
      lines.push(
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${encodedName}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
        "",
        att.content.toString("base64"),
      )
    }
    lines.push(`--${boundary}--`)
    raw = Buffer.from(lines.join("\r\n")).toString("base64url")
  }

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  })
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined | null): string {
  if (!payload) return ""

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8")
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(Buffer.from(payload.body.data, "base64").toString("utf-8"))
  }

  if (payload.parts) {
    // text/plain 우선
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain") {
        const text = extractBody(part)
        if (text) return text
      }
    }
    // multipart 재귀
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith("multipart/")) {
        const text = extractBody(part)
        if (text) return text
      }
    }
    // html fallback
    for (const part of payload.parts) {
      const text = extractBody(part)
      if (text) return text
    }
  }
  return ""
}

export async function markAsRead(gmailId: string): Promise<void> {
  const gmail = getGmailClient()
  await gmail.users.messages.modify({
    userId: "me",
    id: gmailId,
    requestBody: { removeLabelIds: ["UNREAD"] },
  })
}
