# 자동 이메일 분류 시스템 설계 문서

**날짜:** 2026-06-09  
**상태:** 승인됨

---

## 개요

하루 수백 통의 업무 이메일을 받아, AI가 업무를 자동으로 분류해 담당자에게 배정하고, 모든 업무가 완료되면 바이어에게 자동으로 완료 메일을 발송하는 시스템.

---

## 핵심 워크플로우

1. **바이어 이메일 수신** — Gmail로 업무 요청 수신 (한 이메일에 A~G 여러 업무 + 마감기한 포함)
2. **AI 파싱 & 분류** — Claude AI가 이메일 분석, 업무 목록 추출, 담당자 자동 배정, 마감기한 추출
3. **담당자 알림** — 이메일 알림 발송 + 웹 대시보드에서 업무 확인
4. **업무 처리 & 완료** — 담당자가 웹에서 완료 버튼 클릭, 마감 임박 시 경고 표시
5. **완료 메일 발송** — 모든 업무 완료 시 AI가 내용 취합해 바이어에게 자동 회신

---

## 기술 스택

| 항목 | 선택 | 비고 |
|------|------|------|
| 프레임워크 | Next.js 15 (App Router) | 풀스택 단일 코드베이스 |
| AI | Claude AI API (Anthropic) | 이메일 파싱 + 완료 메일 작성 |
| 이메일 | Gmail API (OAuth2) | 수신 읽기 + 회신 발송 |
| ORM | Prisma | SQLite(테스트) → PostgreSQL(실서비스) |
| 인증 | NextAuth.js | 관리자 / 담당자 역할 구분 |
| 언어 | TypeScript | |

---

## 아키텍처

```
[Cron 폴러 - 5분 주기]
        ↓
[Next.js 15 App]
  ├── API Routes
  │   ├── /api/gmail/poll       # 새 이메일 확인 & 파싱 트리거
  │   ├── /api/tasks            # 업무 조회
  │   ├── /api/tasks/complete   # 완료 처리
  │   ├── /api/tasks/reassign   # 담당자 재배정
  │   ├── /api/notify/email     # 알림 이메일 발송
  │   └── /api/auth/[...]       # 로그인/인증
  ├── 서비스 레이어
  │   ├── GmailService          # Gmail API 연동
  │   ├── ClaudeAIService       # AI 파싱 + 메일 작성
  │   ├── TaskService           # 업무 CRUD
  │   ├── RoutingService        # 배정 규칙 적용
  │   └── NotifyService         # 이메일 알림 발송
  └── 웹 페이지
      ├── /login
      ├── /dashboard            # 담당자용
      ├── /admin                # 관리자 전체 현황
      ├── /admin/rules          # 배정 규칙 설정
      └── /admin/users          # 담당자 계정 관리

[외부 서비스]
  ├── Gmail API    # 수신 읽기 + 회신 발송
  └── Claude API   # 업무 파싱 + 완료 메일 작성
```

---

## 데이터 모델

### User
| 필드 | 타입 | 설명 |
|------|------|------|
| id | String | PK |
| name | String | 이름 |
| email | String | 이메일 (로그인 ID) |
| role | Enum | `admin` / `assignee` |
| taskTypes | String[] | 담당 업무 유형 목록 |

### Email
| 필드 | 타입 | 설명 |
|------|------|------|
| id | String | PK |
| gmailId | String | Gmail 메시지 ID (중복 방지) |
| from | String | 바이어 이메일 주소 |
| subject | String | 제목 |
| body | String | 본문 |
| receivedAt | DateTime | 수신 시각 |
| status | Enum | `pending` / `processed` |

### Task
| 필드 | 타입 | 설명 |
|------|------|------|
| id | String | PK |
| emailId | String | FK → Email |
| title | String | 업무 제목 (AI 추출) |
| description | String | 상세 내용 (AI 추출) |
| taskType | String | 업무 유형 (가격/배송/서류/품질/생산/기타) |
| assigneeId | String | FK → User (담당자) |
| deadline | DateTime? | 마감기한 (AI 추출, 없으면 null) |
| status | Enum | `pending` / `in_progress` / `done` |
| completedAt | DateTime? | 완료 시각 |
| completionNote | String? | 완료 시 담당자 코멘트 (선택, 완료 메일에 포함) |

### RoutingRule
| 필드 | 타입 | 설명 |
|------|------|------|
| id | String | PK |
| taskType | String | 업무 유형 |
| defaultAssigneeId | String | FK → User (기본 담당자) |

### Notification
| 필드 | 타입 | 설명 |
|------|------|------|
| id | String | PK |
| taskId | String | FK → Task |
| userId | String | FK → User |
| sentAt | DateTime | 발송 시각 |
| type | Enum | `assignment` / `deadline_warning` |

---

## AI 파싱 로직

### 이메일 → 업무 추출

Claude AI에게 이메일 본문을 전달하고, 다음 JSON 형식으로 업무 목록을 반환받는다.

**프롬프트 요약:**
```
이 이메일에서 업무 목록을 추출하세요.
각 업무마다 다음을 JSON으로 반환하세요:
- title: 업무 제목 (한 줄 요약)
- description: 상세 내용
- taskType: 가격 / 배송 / 서류 / 품질 / 생산 / 기타 중 하나
- deadline: 마감기한 ISO 날짜 (없으면 null)
```

AI가 taskType을 판단할 수 없는 경우 `"기타"`로 폴백하며, 관리자가 대시보드에서 수동 재배정할 수 있다.

**반환 예시:**
```json
[
  { "title": "단가표 업데이트", "taskType": "가격", "deadline": "2026-06-15" },
  { "title": "선적 서류 준비", "taskType": "서류", "deadline": "2026-06-12" },
  { "title": "샘플 품질 확인", "taskType": "품질", "deadline": null }
]
```

### 완료 메일 작성

모든 Task가 `done` 상태가 되면:
1. 각 Task의 제목 + 완료 시각 + 담당자 코멘트(선택) 취합
2. Claude AI가 원본 이메일 맥락을 참고해 자연스러운 완료 회신 메일 작성
3. Gmail API로 바이어에게 발송

---

## 웹 대시보드

### 담당자 화면 (`/dashboard`)
- 내 업무 목록: 제목 / 바이어 / 마감기한 D-day / 현재 상태
- 마감 3일 이내 업무는 빨간색 강조 표시
- 각 업무마다 "완료" 버튼
- 로그인 후 본인 업무만 표시

### 관리자 화면 (`/admin`)
- 전체 이메일 & 업무 현황 한눈에 보기
- 업무 담당자 수동 재배정 기능
- 배정 규칙 관리 (`/admin/rules`): taskType ↔ 기본 담당자 매핑 설정
- 담당자 계정 관리 (`/admin/users`): 계정 생성 / 역할 설정

---

## 이메일 알림

- **배정 알림**: 새 업무 배정 시 담당자에게 이메일 발송 (업무 제목 + 마감기한 + 대시보드 링크)
- **마감 경고**: 마감 3일 전 자동 경고 이메일 발송 (Cron으로 매일 체크)

---

## Gmail 연동

- **수신 감지**: 5분 주기 Cron으로 `/api/gmail/poll` 호출 → 새 이메일 확인
- **중복 방지**: `gmailId`로 이미 처리된 이메일 스킵
- **발신**: Gmail API SMTP로 담당자 알림 + 바이어 완료 메일 발송

---

## 인증

- NextAuth.js 사용
- 역할: `admin` (전체 관리) / `assignee` (본인 업무만)
- 로그인 방식: 이메일 + 비밀번호 (Credentials Provider)

---

## 개발 순서 (권장)

1. Next.js 프로젝트 초기 세팅 + Prisma 스키마 정의
2. NextAuth 로그인 구현
3. Gmail API 연동 (OAuth2 설정 + 폴링)
4. Claude AI 파싱 서비스 구현
5. 담당자 대시보드 UI
6. 관리자 페이지 UI
7. 이메일 알림 발송
8. 마감 경고 Cron + 완료 메일 자동 발송
