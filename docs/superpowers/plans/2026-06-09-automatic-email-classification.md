# 자동 이메일 분류 시스템 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gmail 수신 이메일을 Claude AI로 파싱해 담당자에게 자동 배정하고, 완료 시 바이어에게 자동 회신하는 Next.js 15 풀스택 앱을 구현한다.

**Architecture:** Next.js 15 App Router 단일 코드베이스. Cron이 5분마다 `/api/gmail/poll`을 호출해 새 이메일을 처리한다. 서비스 레이어(GmailService, ClaudeAIService, RoutingService, TaskService, NotifyService)가 비즈니스 로직을 담당하고, API Routes가 얇은 핸들러 역할을 한다.

**Tech Stack:** Next.js 15, TypeScript, Prisma + SQLite, NextAuth.js v5 (beta), Gmail API (googleapis), Claude AI API (@anthropic-ai/sdk), bcryptjs, Jest

---

## 파일 구조

```
prisma/
  schema.prisma
  seed.ts

src/
  app/
    layout.tsx
    page.tsx                          # /dashboard 또는 /login으로 리다이렉트
    login/page.tsx
    dashboard/page.tsx                # 담당자 업무 목록
    admin/
      page.tsx                        # 전체 현황
      rules/page.tsx                  # 배정 규칙
      users/page.tsx                  # 담당자 계정
    api/
      auth/[...nextauth]/route.ts
      gmail/poll/route.ts             # Cron 트리거 (5분)
      tasks/
        route.ts                      # GET 업무 목록
        complete/route.ts             # POST 완료 처리
        reassign/route.ts             # POST 재배정
      notify/deadline/route.ts        # 마감 경고 Cron (매일)
      admin/
        rules/route.ts                # GET/POST/DELETE 배정 규칙
        users/route.ts                # GET/POST 담당자 계정
  auth.ts                             # NextAuth 설정
  middleware.ts                       # 라우트 보호
  types/next-auth.d.ts                # NextAuth 타입 확장
  lib/
    prisma.ts
    services/
      gmail.ts
      claude.ts
      routing.ts
      tasks.ts
      notify.ts

__tests__/
  services/
    routing.test.ts
    claude.test.ts
    tasks.test.ts
```

---

## Task 1: 프로젝트 초기 세팅

**Files:**
- Create: `package.json`, `jest.config.ts`, `jest.setup.ts`, `.env.local`, `vercel.json`

- [ ] **Step 1: Next.js 앱 생성**

```bash
cd "C:/Users/Dell3571/Desktop/Automatic email classification"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git --yes
```

Expected: Next.js 15 앱 파일들이 현재 디렉토리에 생성됨

- [ ] **Step 2: 의존성 설치**

```bash
npm install @anthropic-ai/sdk googleapis next-auth@beta bcryptjs @prisma/client prisma
npm install -D @types/bcryptjs jest jest-environment-node ts-jest @types/jest
```

Expected: node_modules에 설치 완료

- [ ] **Step 3: Jest 설정**

`jest.config.ts` 생성:
```typescript
import type { Config } from "jest"
import nextJest from "next/jest.js"

const createJestConfig = nextJest({ dir: "./" })

const config: Config = {
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFilesAfterFramework: ["<rootDir>/jest.setup.ts"],
}

export default createJestConfig(config)
```

`jest.setup.ts` 생성:
```typescript
// 글로벌 테스트 설정 (필요시 추가)
```

`package.json`의 scripts에 추가:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 4: 환경변수 파일 생성**

`.env.local` 생성:
```
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="개발용-임시-시크릿-32자이상"
NEXTAUTH_URL="http://localhost:3000"

GMAIL_CLIENT_ID="Google Cloud Console에서 발급"
GMAIL_CLIENT_SECRET="Google Cloud Console에서 발급"
GMAIL_REFRESH_TOKEN="OAuth2 인증 후 발급"

ANTHROPIC_API_KEY="Anthropic Console에서 발급"

CRON_SECRET="cron-호출-인증용-임의-문자열"
```

`.gitignore`에 `.env.local` 포함 확인 (create-next-app이 자동 추가)

- [ ] **Step 5: Vercel Cron 설정**

`vercel.json` 생성:
```json
{
  "crons": [
    {
      "path": "/api/gmail/poll",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/notify/deadline",
      "schedule": "0 9 * * *"
    }
  ]
}
```

- [ ] **Step 6: 개발 서버 확인**

```bash
npm run dev
```

Expected: http://localhost:3000 에서 Next.js 기본 페이지 로드

- [ ] **Step 7: 커밋**

```bash
git init
git add .
git commit -m "chore: Next.js 15 프로젝트 초기 세팅"
```

---

## Task 2: Prisma 스키마 + 마이그레이션 + 시드

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`

- [ ] **Step 1: Prisma 초기화**

```bash
npx prisma init --datasource-provider sqlite
```

Expected: `prisma/schema.prisma`와 `.env` 생성됨 (`.env.local`의 DATABASE_URL을 우선 사용)

- [ ] **Step 2: 스키마 작성**

`prisma/schema.prisma`를 다음으로 교체:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id            String         @id @default(cuid())
  name          String
  email         String         @unique
  password      String
  role          String         @default("assignee")
  taskTypes     String         @default("[]")
  tasks         Task[]
  notifications Notification[]
  routingRules  RoutingRule[]
  createdAt     DateTime       @default(now())
}

model Email {
  id         String   @id @default(cuid())
  gmailId    String   @unique
  from       String
  subject    String
  body       String
  receivedAt DateTime
  status     String   @default("pending")
  tasks      Task[]
  createdAt  DateTime @default(now())
}

model Task {
  id             String         @id @default(cuid())
  emailId        String
  email          Email          @relation(fields: [emailId], references: [id])
  title          String
  description    String
  taskType       String
  assigneeId     String
  assignee       User           @relation(fields: [assigneeId], references: [id])
  deadline       DateTime?
  status         String         @default("pending")
  completedAt    DateTime?
  completionNote String?
  notifications  Notification[]
  createdAt      DateTime       @default(now())
}

model RoutingRule {
  id                String @id @default(cuid())
  taskType          String @unique
  defaultAssigneeId String
  defaultAssignee   User   @relation(fields: [defaultAssigneeId], references: [id])
}

model Notification {
  id     String   @id @default(cuid())
  taskId String
  task   Task     @relation(fields: [taskId], references: [id])
  userId String
  user   User     @relation(fields: [userId], references: [id])
  sentAt DateTime @default(now())
  type   String
}
```

- [ ] **Step 3: 마이그레이션 실행**

```bash
npx prisma migrate dev --name init
```

Expected: `prisma/migrations/` 폴더 생성, `dev.db` 생성

- [ ] **Step 4: Prisma 클라이언트 생성 확인**

```bash
npx prisma generate
```

Expected: `node_modules/@prisma/client` 업데이트 완료 메시지

- [ ] **Step 5: 시드 스크립트 작성**

`prisma/seed.ts` 생성:
```typescript
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

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

  const createdUsers: typeof admin[] = []
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
```

`package.json`에 추가:
```json
"prisma": {
  "seed": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' prisma/seed.ts"
}
```

- [ ] **Step 6: 시드 실행**

```bash
npx prisma db seed
```

Expected: "시드 완료" 출력

- [ ] **Step 7: 커밋**

```bash
git add prisma/ package.json
git commit -m "feat: Prisma 스키마 + SQLite DB 초기화"
```

---

## Task 3: 공통 기반 코드 (Prisma 싱글턴 + NextAuth 타입)

**Files:**
- Create: `src/lib/prisma.ts`, `src/types/next-auth.d.ts`

- [ ] **Step 1: Prisma 싱글턴 작성**

`src/lib/prisma.ts` 생성:
```typescript
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export default prisma
```

- [ ] **Step 2: NextAuth 타입 확장**

`src/types/next-auth.d.ts` 생성:
```typescript
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
    } & DefaultSession["user"]
  }

  interface User {
    role: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: string
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/prisma.ts src/types/
git commit -m "chore: Prisma 싱글턴 + NextAuth 타입 정의"
```

---

## Task 4: NextAuth 인증 + 로그인 페이지

**Files:**
- Create: `src/auth.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: NextAuth 설정 작성**

`src/auth.ts` 생성:
```typescript
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password as string, user.password)
        if (!valid) return null
        return { id: user.id, name: user.name, email: user.email, role: user.role }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = user.role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
  },
  pages: { signIn: "/login" },
})
```

- [ ] **Step 2: NextAuth API Route**

`src/app/api/auth/[...nextauth]/route.ts` 생성:
```typescript
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

- [ ] **Step 3: 미들웨어 작성**

`src/middleware.ts` 생성:
```typescript
export { auth as middleware } from "@/auth"

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
}
```

- [ ] **Step 4: 루트 레이아웃 작성**

`src/app/layout.tsx` 교체:
```tsx
import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "이메일 분류 시스템",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={geist.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 5: 루트 페이지 리다이렉트**

`src/app/page.tsx` 교체:
```tsx
import { redirect } from "next/navigation"
import { auth } from "@/auth"

export default async function Home() {
  const session = await auth()
  redirect(session ? "/dashboard" : "/login")
}
```

- [ ] **Step 6: 로그인 페이지 작성**

`src/app/login/page.tsx` 생성:
```tsx
"use client"
import { signIn } from "next-auth/react"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    if (result?.error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.")
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow w-96 space-y-4">
        <h1 className="text-xl font-bold">로그인</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
          required
        />
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium">
          로그인
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 7: 로그인 수동 테스트**

```bash
npm run dev
```

브라우저에서 http://localhost:3000/dashboard 접속 → `/login`으로 리다이렉트 확인
`admin@company.com` / `admin1234`로 로그인 → `/dashboard`로 이동 확인

- [ ] **Step 8: 커밋**

```bash
git add src/auth.ts src/middleware.ts src/app/
git commit -m "feat: NextAuth 인증 + 로그인 페이지"
```

---

## Task 5: GmailService

**Files:**
- Create: `src/lib/services/gmail.ts`

> Gmail API 설정 선행 필요: Google Cloud Console → API 라이브러리 → Gmail API 활성화 → OAuth2 클라이언트 ID 생성 → GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET 발급. GMAIL_REFRESH_TOKEN은 OAuth2 Playground(https://developers.google.com/oauthplayground)에서 `https://mail.google.com/` 스코프로 발급.

- [ ] **Step 1: GmailService 구현**

`src/lib/services/gmail.ts` 생성:
```typescript
import { google } from "googleapis"

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

function extractBody(payload: any): string {
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
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/services/gmail.ts
git commit -m "feat: GmailService (읽기 + 발송)"
```

---

## Task 6: ClaudeAIService + 테스트

**Files:**
- Create: `src/lib/services/claude.ts`, `__tests__/services/claude.test.ts`

- [ ] **Step 1: 실패할 테스트 작성**

`__tests__/services/claude.test.ts` 생성:
```typescript
import { parseEmail, writeSummaryEmail } from "@/lib/services/claude"

jest.mock("@anthropic-ai/sdk", () => {
  return {
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
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

```bash
npx jest __tests__/services/claude.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/services/claude'"

- [ ] **Step 3: ClaudeAIService 구현**

`src/lib/services/claude.ts` 생성:
```typescript
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest __tests__/services/claude.test.ts
```

Expected: PASS (2개 테스트)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/services/claude.ts __tests__/services/claude.test.ts
git commit -m "feat: ClaudeAIService (이메일 파싱 + 완료 메일 작성)"
```

---

## Task 7: RoutingService + 테스트

**Files:**
- Create: `src/lib/services/routing.ts`, `__tests__/services/routing.test.ts`

- [ ] **Step 1: 실패할 테스트 작성**

`__tests__/services/routing.test.ts` 생성:
```typescript
import { assignTasks } from "@/lib/services/routing"
import prisma from "@/lib/prisma"

jest.mock("@/lib/prisma", () => ({
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest __tests__/services/routing.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/services/routing'"

- [ ] **Step 3: RoutingService 구현**

`src/lib/services/routing.ts` 생성:
```typescript
import prisma from "@/lib/prisma"
import type { ParsedTask } from "./claude"

export type AssignedTask = ParsedTask & { assigneeId: string }

export async function assignTasks(tasks: ParsedTask[]): Promise<AssignedTask[]> {
  const rules = await prisma.routingRule.findMany()
  const ruleMap = new Map(rules.map(r => [r.taskType, r.defaultAssigneeId]))

  const fallbackUser = await prisma.user.findFirst({ where: { role: "admin" } })
  if (!fallbackUser) throw new Error("관리자 계정이 없습니다")

  return tasks.map(task => ({
    ...task,
    assigneeId: ruleMap.get(task.taskType) ?? fallbackUser.id,
  }))
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest __tests__/services/routing.test.ts
```

Expected: PASS (3개 테스트)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/services/routing.ts __tests__/services/routing.test.ts
git commit -m "feat: RoutingService (배정 규칙 기반 담당자 배정)"
```

---

## Task 8: TaskService + 테스트

**Files:**
- Create: `src/lib/services/tasks.ts`, `__tests__/services/tasks.test.ts`

- [ ] **Step 1: 실패할 테스트 작성**

`__tests__/services/tasks.test.ts` 생성:
```typescript
import { completeTask, checkAllTasksDone, getTasksNearDeadline } from "@/lib/services/tasks"
import prisma from "@/lib/prisma"

jest.mock("@/lib/prisma", () => ({
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest __tests__/services/tasks.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/services/tasks'"

- [ ] **Step 3: TaskService 구현**

`src/lib/services/tasks.ts` 생성:
```typescript
import prisma from "@/lib/prisma"
import type { RawEmail } from "./gmail"
import type { AssignedTask } from "./routing"

export async function createTasksFromEmail(
  raw: RawEmail,
  assignedTasks: AssignedTask[],
): Promise<string> {
  const email = await prisma.email.create({
    data: {
      gmailId: raw.gmailId,
      from: raw.from,
      subject: raw.subject,
      body: raw.body,
      receivedAt: raw.receivedAt,
      status: "processed",
    },
  })

  for (const t of assignedTasks) {
    await prisma.task.create({
      data: {
        emailId: email.id,
        title: t.title,
        description: t.description,
        taskType: t.taskType,
        assigneeId: t.assigneeId,
        deadline: t.deadline ? new Date(t.deadline) : null,
        status: "pending",
      },
    })
  }

  return email.id
}

export async function completeTask(
  taskId: string,
  userId: string,
  completionNote: string | null,
): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.assigneeId !== userId) throw new Error("권한 없음")

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "done", completedAt: new Date(), completionNote },
  })
}

export async function reassignTask(taskId: string, newAssigneeId: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: { assigneeId: newAssigneeId, status: "pending" },
  })
}

export async function checkAllTasksDone(emailId: string): Promise<boolean> {
  const tasks = await prisma.task.findMany({ where: { emailId } })
  return tasks.length > 0 && tasks.every(t => t.status === "done")
}

export async function getTasksNearDeadline() {
  const threeDaysLater = new Date()
  threeDaysLater.setDate(threeDaysLater.getDate() + 3)

  return prisma.task.findMany({
    where: {
      status: { not: "done" },
      deadline: { lte: threeDaysLater, gte: new Date() },
    },
    include: { assignee: true, email: true },
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest __tests__/services/tasks.test.ts
```

Expected: PASS (6개 테스트)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/services/tasks.ts __tests__/services/tasks.test.ts
git commit -m "feat: TaskService (생성/완료/재배정/마감 조회)"
```

---

## Task 9: NotifyService + Gmail 폴링 API Route

**Files:**
- Create: `src/lib/services/notify.ts`, `src/app/api/gmail/poll/route.ts`

- [ ] **Step 1: NotifyService 구현**

`src/lib/services/notify.ts` 생성:
```typescript
import { sendEmail } from "./gmail"
import prisma from "@/lib/prisma"

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

export async function sendAssignmentNotification(
  taskId: string,
  assigneeEmail: string,
  assigneeId: string,
  taskTitle: string,
  deadline: Date | null,
): Promise<void> {
  const deadlineStr = deadline ? deadline.toLocaleDateString("ko-KR") : "마감기한 없음"

  await sendEmail(
    assigneeEmail,
    `[새 업무] ${taskTitle}`,
    `새 업무가 배정되었습니다.\n\n업무: ${taskTitle}\n마감기한: ${deadlineStr}\n\n대시보드: ${APP_URL}/dashboard`,
  )

  await prisma.notification.create({
    data: { taskId, userId: assigneeId, type: "assignment" },
  })
}

export async function sendDeadlineWarning(
  taskId: string,
  assigneeEmail: string,
  assigneeId: string,
  taskTitle: string,
  deadline: Date,
): Promise<void> {
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  await sendEmail(
    assigneeEmail,
    `[마감 임박 D-${daysLeft}] ${taskTitle}`,
    `마감이 ${daysLeft}일 남았습니다.\n\n업무: ${taskTitle}\n마감기한: ${deadline.toLocaleDateString("ko-KR")}\n\n대시보드: ${APP_URL}/dashboard`,
  )

  await prisma.notification.create({
    data: { taskId, userId: assigneeId, type: "deadline_warning" },
  })
}
```

- [ ] **Step 2: Gmail 폴링 API Route 구현**

`src/app/api/gmail/poll/route.ts` 생성:
```typescript
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { listNewEmails } from "@/lib/services/gmail"
import { parseEmail } from "@/lib/services/claude"
import { assignTasks } from "@/lib/services/routing"
import { createTasksFromEmail } from "@/lib/services/tasks"
import { sendAssignmentNotification } from "@/lib/services/notify"

export async function GET(request: Request) {
  // Vercel Cron 인증
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 이미 처리된 gmailId 목록
  const processedEmails = await prisma.email.findMany({ select: { gmailId: true } })
  const processedIds = processedEmails.map(e => e.gmailId)

  // 새 이메일 수신
  const newEmails = await listNewEmails(processedIds)
  let processed = 0

  for (const raw of newEmails) {
    // AI 파싱
    const parsedTasks = await parseEmail(raw.subject, raw.body)
    if (parsedTasks.length === 0) continue

    // 담당자 배정
    const assignedTasks = await assignTasks(parsedTasks)

    // DB 저장
    const emailId = await createTasksFromEmail(raw, assignedTasks)

    // 배정된 업무별 알림 발송
    const createdTasks = await prisma.task.findMany({
      where: { emailId },
      include: { assignee: true },
    })
    for (const task of createdTasks) {
      await sendAssignmentNotification(
        task.id,
        task.assignee.email,
        task.assignee.id,
        task.title,
        task.deadline,
      )
    }
    processed++
  }

  return NextResponse.json({ processed, total: newEmails.length })
}
```

- [ ] **Step 3: 로컬 테스트 (환경변수 설정 후)**

환경변수가 설정된 상태에서:
```bash
curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  http://localhost:3000/api/gmail/poll
```

Expected: `{"processed": N, "total": N}` 응답

- [ ] **Step 4: 커밋**

```bash
git add src/lib/services/notify.ts src/app/api/gmail/poll/
git commit -m "feat: NotifyService + Gmail 폴링 API Route (통합)"
```

---

## Task 10: 마감 경고 Cron Route

**Files:**
- Create: `src/app/api/notify/deadline/route.ts`

- [ ] **Step 1: 마감 경고 Route 구현**

`src/app/api/notify/deadline/route.ts` 생성:
```typescript
import { NextResponse } from "next/server"
import { getTasksNearDeadline } from "@/lib/services/tasks"
import { sendDeadlineWarning } from "@/lib/services/notify"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tasks = await getTasksNearDeadline()
  let sent = 0

  for (const task of tasks) {
    await sendDeadlineWarning(
      task.id,
      task.assignee.email,
      task.assignee.id,
      task.title,
      task.deadline!,
    )
    sent++
  }

  return NextResponse.json({ sent })
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/notify/
git commit -m "feat: 마감 경고 Cron API Route"
```

---

## Task 11: 담당자 대시보드 + 업무 API

**Files:**
- Create: `src/app/api/tasks/route.ts`, `src/app/api/tasks/complete/route.ts`, `src/app/dashboard/page.tsx`

- [ ] **Step 1: 업무 목록 API**

`src/app/api/tasks/route.ts` 생성:
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const where =
    session.user.role === "admin"
      ? {}
      : { assigneeId: session.user.id }

  const tasks = await prisma.task.findMany({
    where,
    include: { email: { select: { from: true, subject: true } }, assignee: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(tasks)
}
```

- [ ] **Step 2: 완료 처리 API**

`src/app/api/tasks/complete/route.ts` 생성:
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { completeTask, checkAllTasksDone } from "@/lib/services/tasks"
import { writeSummaryEmail } from "@/lib/services/claude"
import { sendEmail } from "@/lib/services/gmail"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { taskId, completionNote } = await request.json()

  await completeTask(taskId, session.user.id, completionNote ?? null)

  // 해당 이메일의 모든 업무가 완료됐는지 확인
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { email: true },
  })
  if (!task) return NextResponse.json({ ok: true })

  const allDone = await checkAllTasksDone(task.emailId)
  if (allDone) {
    const doneTasks = await prisma.task.findMany({
      where: { emailId: task.emailId },
      select: { title: true, completionNote: true, completedAt: true },
    })
    const summary = await writeSummaryEmail(task.email.subject, task.email.body, doneTasks as any)
    await sendEmail(task.email.from, summary.subject, summary.body)
  }

  return NextResponse.json({ ok: true, allDone })
}
```

- [ ] **Step 3: 담당자 대시보드 페이지**

`src/app/dashboard/page.tsx` 생성:
```tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import DashboardClient from "./DashboardClient"

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")
  return <DashboardClient role={session.user.role} />
}
```

`src/app/dashboard/DashboardClient.tsx` 생성:
```tsx
"use client"
import { useEffect, useState } from "react"

type Task = {
  id: string
  title: string
  description: string
  taskType: string
  deadline: string | null
  status: string
  email: { from: string; subject: string }
  assignee: { name: string }
}

function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function DashboardClient({ role }: { role: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [completionNote, setCompletionNote] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch("/api/tasks").then(r => r.json()).then(setTasks)
  }, [])

  async function handleComplete(taskId: string) {
    await fetch("/api/tasks/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, completionNote: completionNote[taskId] ?? "" }),
    })
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "done" } : t))
  }

  const pending = tasks.filter(t => t.status !== "done")
  const done = tasks.filter(t => t.status === "done")

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">내 업무 목록</h1>
        {role === "admin" && (
          <a href="/admin" className="text-sm text-blue-600 underline">관리자 페이지 →</a>
        )}
      </div>

      <div className="space-y-3">
        {pending.map(task => {
          const dl = daysLeft(task.deadline)
          const isUrgent = dl !== null && dl <= 3
          return (
            <div key={task.id} className={`border rounded-lg p-4 ${isUrgent ? "border-red-400 bg-red-50" : "border-gray-200"}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-sm text-gray-500">{task.email.from} · {task.taskType}</p>
                  {task.deadline && (
                    <p className={`text-sm mt-1 ${isUrgent ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                      마감: {new Date(task.deadline).toLocaleDateString("ko-KR")} {dl !== null && `(D-${dl})`}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <input
                    type="text"
                    placeholder="완료 코멘트 (선택)"
                    className="text-sm border rounded px-2 py-1"
                    value={completionNote[task.id] ?? ""}
                    onChange={e => setCompletionNote(prev => ({ ...prev, [task.id]: e.target.value }))}
                  />
                  <button
                    onClick={() => handleComplete(task.id)}
                    className="bg-green-600 text-white text-sm px-4 py-1 rounded"
                  >
                    완료
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {done.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-400 mb-3">완료된 업무</h2>
          <div className="space-y-2 opacity-60">
            {done.map(task => (
              <div key={task.id} className="border rounded-lg p-3 bg-gray-50">
                <p className="font-medium line-through text-gray-400">{task.title}</p>
                <p className="text-sm text-gray-400">{task.taskType}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 수동 테스트**

```bash
npm run dev
```

`admin@company.com`으로 로그인 → `/dashboard` 접속 → 업무 목록 표시 확인 (시드 데이터 없으면 빈 화면 정상)

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/tasks/ src/app/dashboard/
git commit -m "feat: 담당자 대시보드 + 완료 처리 API"
```

---

## Task 12: 관리자 현황 + 재배정 API

**Files:**
- Create: `src/app/admin/page.tsx`, `src/app/api/tasks/reassign/route.ts`

- [ ] **Step 1: 재배정 API**

`src/app/api/tasks/reassign/route.ts` 생성:
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { reassignTask } from "@/lib/services/tasks"

export async function POST(request: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { taskId, newAssigneeId } = await request.json()
  await reassignTask(taskId, newAssigneeId)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 관리자 현황 페이지**

`src/app/admin/page.tsx` 생성:
```tsx
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
```

`src/app/admin/AdminClient.tsx` 생성:
```tsx
"use client"
import { useEffect, useState } from "react"

type Task = {
  id: string
  title: string
  taskType: string
  status: string
  deadline: string | null
  email: { from: string; subject: string }
  assignee: { name: string }
}

type Assignee = { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  in_progress: "진행중",
  done: "완료",
}

export default function AdminClient({ assignees }: { assignees: Assignee[] }) {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    fetch("/api/tasks").then(r => r.json()).then(setTasks)
  }, [])

  async function handleReassign(taskId: string, newAssigneeId: string) {
    await fetch("/api/tasks/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, newAssigneeId }),
    })
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? { ...t, assignee: { name: assignees.find(a => a.id === newAssigneeId)?.name ?? "" } }
          : t,
      ),
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">전체 업무 현황</h1>
        <div className="flex gap-4 text-sm">
          <a href="/admin/rules" className="text-blue-600 underline">배정 규칙</a>
          <a href="/admin/users" className="text-blue-600 underline">담당자 관리</a>
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-3 py-2 text-left">업무</th>
            <th className="border px-3 py-2 text-left">유형</th>
            <th className="border px-3 py-2 text-left">바이어</th>
            <th className="border px-3 py-2 text-left">마감</th>
            <th className="border px-3 py-2 text-left">상태</th>
            <th className="border px-3 py-2 text-left">담당자</th>
            <th className="border px-3 py-2 text-left">재배정</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => (
            <tr key={task.id} className="hover:bg-gray-50">
              <td className="border px-3 py-2">{task.title}</td>
              <td className="border px-3 py-2">{task.taskType}</td>
              <td className="border px-3 py-2 text-xs">{task.email.from}</td>
              <td className="border px-3 py-2">
                {task.deadline ? new Date(task.deadline).toLocaleDateString("ko-KR") : "-"}
              </td>
              <td className="border px-3 py-2">{STATUS_LABEL[task.status]}</td>
              <td className="border px-3 py-2">{task.assignee.name}</td>
              <td className="border px-3 py-2">
                <select
                  className="text-xs border rounded px-1 py-0.5"
                  onChange={e => handleReassign(task.id, e.target.value)}
                  defaultValue=""
                >
                  <option value="" disabled>변경</option>
                  {assignees.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: 수동 테스트**

`admin@company.com`으로 로그인 → `/admin` 접속 → 테이블 표시, 재배정 드롭다운 작동 확인

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/ src/app/api/tasks/reassign/
git commit -m "feat: 관리자 전체 현황 + 재배정 API"
```

---

## Task 13: 배정 규칙 관리

**Files:**
- Create: `src/app/api/admin/rules/route.ts`, `src/app/admin/rules/page.tsx`

- [ ] **Step 1: 배정 규칙 API**

`src/app/api/admin/rules/route.ts` 생성:
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "admin") return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const rules = await prisma.routingRule.findMany({ include: { defaultAssignee: { select: { id: true, name: true } } } })
  return NextResponse.json(rules)
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { taskType, defaultAssigneeId } = await request.json()
  const rule = await prisma.routingRule.upsert({
    where: { taskType },
    update: { defaultAssigneeId },
    create: { taskType, defaultAssigneeId },
  })
  return NextResponse.json(rule)
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { taskType } = await request.json()
  await prisma.routingRule.delete({ where: { taskType } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 배정 규칙 페이지**

`src/app/admin/rules/page.tsx` 생성:
```tsx
"use client"
import { useEffect, useState } from "react"

const TASK_TYPES = ["가격", "배송", "서류", "품질", "생산", "기타"]

type Rule = { taskType: string; defaultAssigneeId: string; defaultAssignee: { id: string; name: string } }
type Assignee = { id: string; name: string }

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])

  useEffect(() => {
    fetch("/api/admin/rules").then(r => r.json()).then(setRules)
    fetch("/api/admin/users").then(r => r.json()).then(setAssignees)
  }, [])

  async function handleSave(taskType: string, defaultAssigneeId: string) {
    await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskType, defaultAssigneeId }),
    })
    fetch("/api/admin/rules").then(r => r.json()).then(setRules)
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">배정 규칙</h1>
        <a href="/admin" className="text-sm text-blue-600 underline">← 관리자</a>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-3 py-2 text-left">업무 유형</th>
            <th className="border px-3 py-2 text-left">기본 담당자</th>
          </tr>
        </thead>
        <tbody>
          {TASK_TYPES.map(type => {
            const rule = rules.find(r => r.taskType === type)
            return (
              <tr key={type}>
                <td className="border px-3 py-2 font-medium">{type}</td>
                <td className="border px-3 py-2">
                  <select
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={rule?.defaultAssigneeId ?? ""}
                    onChange={e => handleSave(type, e.target.value)}
                  >
                    <option value="">담당자 선택</option>
                    {assignees.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/admin/rules/ src/app/api/admin/rules/
git commit -m "feat: 배정 규칙 관리 페이지 + API"
```

---

## Task 14: 담당자 계정 관리

**Files:**
- Create: `src/app/api/admin/users/route.ts`, `src/app/admin/users/page.tsx`

- [ ] **Step 1: 담당자 계정 API**

`src/app/api/admin/users/route.ts` 생성:
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "admin") return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, taskTypes: true },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(users)
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { name, email, password, role } = await request.json()
  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name, email, password: hashed, role: role ?? "assignee" },
    select: { id: true, name: true, email: true, role: true },
  })
  return NextResponse.json(user)
}
```

- [ ] **Step 2: 담당자 계정 페이지**

`src/app/admin/users/page.tsx` 생성:
```tsx
"use client"
import { useEffect, useState } from "react"

type User = { id: string; name: string; email: string; role: string }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "assignee" })
  const [msg, setMsg] = useState("")

  useEffect(() => {
    fetch("/api/admin/users").then(r => r.json()).then(setUsers)
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const user = await res.json()
      setUsers(prev => [...prev, user])
      setForm({ name: "", email: "", password: "", role: "assignee" })
      setMsg("계정이 생성되었습니다.")
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">담당자 계정 관리</h1>
        <a href="/admin" className="text-sm text-blue-600 underline">← 관리자</a>
      </div>

      <form onSubmit={handleCreate} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3">
        <h2 className="font-semibold text-sm">새 계정 추가</h2>
        <div className="grid grid-cols-2 gap-3">
          <input className="border rounded px-3 py-2 text-sm" placeholder="이름" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
          <input type="email" className="border rounded px-3 py-2 text-sm" placeholder="이메일" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          <input type="password" className="border rounded px-3 py-2 text-sm" placeholder="비밀번호" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
          <select className="border rounded px-3 py-2 text-sm" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
            <option value="assignee">담당자</option>
            <option value="admin">관리자</option>
          </select>
        </div>
        <button type="submit" className="bg-blue-600 text-white text-sm px-4 py-2 rounded">추가</button>
        {msg && <p className="text-green-600 text-sm">{msg}</p>}
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-3 py-2 text-left">이름</th>
            <th className="border px-3 py-2 text-left">이메일</th>
            <th className="border px-3 py-2 text-left">역할</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td className="border px-3 py-2">{u.name}</td>
              <td className="border px-3 py-2">{u.email}</td>
              <td className="border px-3 py-2">{u.role === "admin" ? "관리자" : "담당자"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: 전체 테스트 실행**

```bash
npx jest
```

Expected: PASS (routing 3개 + claude 2개 + tasks 6개 = 11개 테스트)

- [ ] **Step 4: 최종 수동 테스트**

```bash
npm run dev
```

확인 항목:
- `/login` → 로그인 → `/dashboard` 리다이렉트
- `/dashboard` → 업무 목록, D-day, 완료 버튼
- `/admin` → 전체 현황, 재배정
- `/admin/rules` → 배정 규칙 드롭다운 변경
- `/admin/users` → 새 계정 추가

- [ ] **Step 5: 최종 커밋**

```bash
git add src/app/admin/users/ src/app/api/admin/users/
git commit -m "feat: 담당자 계정 관리 페이지 + API"
```

---

## Gmail OAuth2 설정 가이드

Gmail 환경변수 발급 절차 (Task 5 진행 전 필요):

1. [Google Cloud Console](https://console.cloud.google.com) → 새 프로젝트 생성
2. API 및 서비스 → 라이브러리 → "Gmail API" 검색 → 사용 설정
3. OAuth 동의 화면 → 외부 → 앱 이름 입력 → 저장
4. 사용자 인증 정보 → OAuth 2.0 클라이언트 ID → 웹 애플리케이션 → 생성
   - `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` 발급
5. [OAuth2 Playground](https://developers.google.com/oauthplayground) 접속
   - 설정 → "Use your own OAuth credentials" 체크 → 위 ID/Secret 입력
   - Step 1: `https://mail.google.com/` 스코프 선택 → Authorize
   - Step 2: Exchange authorization code for tokens → `GMAIL_REFRESH_TOKEN` 복사
