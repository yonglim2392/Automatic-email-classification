"""
테스트 이메일 발송 스크립트
네이버 메일 → 회사 Gmail 계정으로 업무 메일을 보내 시스템을 테스트합니다.
"""

import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header

# ─────────────────────────────────────────────
# 설정 (본인 정보로 수정하세요)
# ─────────────────────────────────────────────
NAVER_EMAIL   = "your_naver_id@naver.com"   # 보내는 네이버 이메일
NAVER_PASSWORD = "네이버_앱_비밀번호"         # 네이버 SMTP 앱 비밀번호 (아래 안내 참고)
TARGET_GMAIL  = "your_gmail@gmail.com"       # 시스템이 모니터링하는 Gmail 주소
# ─────────────────────────────────────────────

# ※ 네이버 앱 비밀번호 발급 방법:
#   네이버 로그인 → 내 정보 → 보안설정 → 2단계 인증 활성화
#   → 애플리케이션 비밀번호 발급 → "메일" 선택 → 생성된 비밀번호 복사

TEMPLATES = {
    "1": {
        "label": "가격 협의 요청",
        "subject": "[가격 문의] ABC 제품 단가 조정 요청드립니다",
        "body": """안녕하세요,

저희 측에서 지난달 발주한 ABC 제품 관련하여 연락드립니다.

현재 시장 상황을 고려하여 단가 조정을 요청드리고자 합니다.
기존 단가 $12.50에서 $11.00으로 조정이 가능한지 검토 부탁드립니다.

가능하시다면 이번 주 금요일(6월 15일)까지 회신 주시면 감사하겠습니다.

Best regards,
John Smith
ABC Trading Co.
""",
    },
    "2": {
        "label": "배송 일정 확인 요청",
        "subject": "[배송 문의] PO#2024-089 선적 일정 확인 요청",
        "body": """안녕하세요,

PO#2024-089 건으로 연락드립니다.

당초 6월 20일 출고 예정이었으나 현재 선적 준비 상황이 어떻게 되시는지 확인 부탁드립니다.
저희 측 창고 입고 일정 때문에 6월 25일 이전 선적이 반드시 필요한 상황입니다.

B/L 사본과 패킹리스트도 함께 보내주시면 감사하겠습니다.

Regards,
Emily Chen
""",
    },
    "3": {
        "label": "서류 요청 (인보이스/COA)",
        "subject": "[서류 요청] Invoice 및 COA 발송 요청드립니다",
        "body": """안녕하세요,

지난주 수령한 제품(Lot No. K-2024-441) 관련하여 아래 서류 발송을 요청드립니다.

1. Commercial Invoice (원본)
2. Certificate of Analysis (COA)
3. MSDS

통관 일정이 촉박하여 내일(6월 11일)까지 이메일로 먼저 스캔본 보내주시면 감사하겠습니다.

감사합니다.
박준호
""",
    },
    "4": {
        "label": "품질 클레임",
        "subject": "[품질 클레임] 입고 제품 불량 건 처리 요청",
        "body": """안녕하세요,

이번에 입고된 제품(PO#2024-077, Lot B-339)에서 불량이 발견되어 연락드립니다.

전체 500개 중 약 47개(9.4%)에서 표면 스크래치 및 치수 불량이 확인되었습니다.
사진 자료는 별도 첨부 예정입니다.

처리 방안(교환 또는 환불)을 이번 주 내로 회신 주시기 바랍니다.
재발 방지 대책도 함께 요청드립니다.

Best,
Michael Park
""",
    },
    "5": {
        "label": "생산 일정 문의",
        "subject": "[생산 문의] 신규 샘플 제작 일정 확인",
        "body": """안녕하세요,

새로운 모델(Model XR-200) 샘플 제작 관련하여 문의드립니다.

지난번 미팅에서 논의한 스펙대로 샘플 5개 제작을 요청드리며,
가능한 납기일과 샘플 단가를 알려주시면 감사하겠습니다.

색상은 블랙/화이트 각 2개, 그레이 1개로 부탁드립니다.
늦어도 7월 5일까지는 샘플 수령이 필요합니다.

감사합니다.
""",
    },
    "6": {
        "label": "직접 입력",
        "subject": None,
        "body": None,
    },
}


def send_email(subject: str, body: str) -> None:
    msg = MIMEMultipart()
    msg["From"]    = NAVER_EMAIL
    msg["To"]      = TARGET_GMAIL
    msg["Subject"] = Header(subject, "utf-8").encode()
    msg.attach(MIMEText(body, "plain", "utf-8"))

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.naver.com", 465, context=context) as server:
        server.login(NAVER_EMAIL, NAVER_PASSWORD)
        server.sendmail(NAVER_EMAIL, TARGET_GMAIL, msg.as_string())


def main() -> None:
    print("=" * 50)
    print("  이메일 분류 시스템 테스트 발송기")
    print("=" * 50)
    print(f"  발신: {NAVER_EMAIL}")
    print(f"  수신: {TARGET_GMAIL}")
    print("=" * 50)
    print()

    for key, tmpl in TEMPLATES.items():
        print(f"  [{key}] {tmpl['label']}")

    print()
    choice = input("템플릿 선택 (1~6): ").strip()

    if choice not in TEMPLATES:
        print("잘못된 선택입니다.")
        return

    tmpl = TEMPLATES[choice]

    if choice == "6":
        subject = input("제목: ").strip()
        print("본문 입력 (입력 완료 후 빈 줄에서 Enter 두 번):")
        lines = []
        while True:
            line = input()
            if line == "" and lines and lines[-1] == "":
                break
            lines.append(line)
        body = "\n".join(lines[:-1])  # 마지막 빈 줄 제거
    else:
        subject = tmpl["subject"]
        body    = tmpl["body"]
        print()
        print(f"[제목] {subject}")
        print("[본문]")
        print(body)

    print()
    confirm = input("발송하시겠습니까? (y/N): ").strip().lower()
    if confirm != "y":
        print("취소했습니다.")
        return

    print("발송 중...", end=" ", flush=True)
    try:
        send_email(subject, body)
        print("완료!")
        print()
        print("✓ 발송 완료. 관리자 화면에서 '이메일 가져오기'를 눌러 처리 결과를 확인하세요.")
    except smtplib.SMTPAuthenticationError:
        print("\n[오류] 로그인 실패. 네이버 앱 비밀번호를 확인하세요.")
        print("  → 네이버 > 내 정보 > 보안설정 > 애플리케이션 비밀번호 발급")
    except Exception as e:
        print(f"\n[오류] {e}")


if __name__ == "__main__":
    main()
