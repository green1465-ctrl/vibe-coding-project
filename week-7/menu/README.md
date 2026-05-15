# 🍽️ Menu — 시즌 캠페인 카드뉴스 자동 생성기

> 외식 프랜차이즈를 관리하는 영업대행업체가 매월 1회, 클라이언트별 시즌 캠페인 카드뉴스 5장을 자동으로 만들어 zip으로 받는 도구.

---

## 핵심 흐름

```
1. 클라이언트 5개 등록 (이름·업종·메일·톤·메뉴)
2. "이번 달 트렌드 가져오기" 클릭 → 외식 트렌드 자동 수집
3. 클라이언트 선택 → "카피 생성" → AI가 카피 5섹션 재창조
4. "이미지 재생성" → fal.ai로 음식 비주얼 생성
5. "다시 합성" → Playwright가 슬라이드 5장 PNG 합성
6. 카피 인라인 수정 → 다시 합성
7. OK / 수정중 / 스킵 검수
8. "다운로드" → PNG 5장 zip 받기
```

**1사이클 30분 이내** 목표.

---

## 기술 스택

| 영역 | 도구 |
|------|------|
| 프론트엔드 | React 18 (CDN) + Tailwind (CDN) + Babel standalone — 단일 `index.html` |
| 백엔드 | Express 5 — 단일 `single.js` |
| LLM | OpenAI gpt-4o-mini (카피 재창조) |
| 이미지 | fal.ai Z-Image Turbo (음식 비주얼) |
| 스크래핑 + PNG 합성 | Playwright (chromium headless) |
| zip 번들링 | archiver (v7, CJS 호환) |
| 저장소 | JSON 파일 (`data/clients.json`, `data/campaigns.json`) |

---

## 빠른 시작

```bash
# 의존성 설치 (이미 완료된 경우 스킵)
npm install
npx playwright install chromium

# .env 작성 (.env.example 참고)
# OPENAI_API_KEY=sk-...
# FAL_KEY=...
# PORT=3000

# 서버 실행
node single.js

# 브라우저
http://localhost:3000
```

---

## 환경 변수

```env
OPENAI_API_KEY=sk-...    # platform.openai.com → API keys
FAL_KEY=...              # fal.ai/dashboard/keys
PORT=3000
```

⚠️ 키는 **절대 채팅창·커밋·공개 저장소에 노출 금지**. `.env`는 `.gitignore`에 포함됨.

---

## API 엔드포인트

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/health` | `{ ok, ts, openai, fal }` 키 활성 여부 노출 |
| GET | `/api/clients` | 클라이언트 배열 |
| POST | `/api/clients` | 추가 (id 자동) |
| PUT | `/api/clients/:id` | 부분 수정 |
| DELETE | `/api/clients/:id` | 삭제 |
| POST | `/api/collect-trends` | `{month, mode?}` — foodbank live + mock fallback |
| POST | `/api/generate-copy` | `{client_id, month}` — gpt-4o-mini 카피 5섹션 |
| POST | `/api/regenerate-image` | `{client_id, month}` — fal.ai 음식 이미지 |
| POST | `/api/render-slides` | `{client_id, month, copy?, image_url?}` — Playwright PNG 5장 |
| GET | `/api/download-zip/:client_id?month=` | archiver zip 스트림 |
| GET | `/slides/:filename` | 합성된 PNG 직접 서빙 |

---

## 데이터 모델

### `data/clients.json`
```json
{
  "id": "c1",
  "name": "정담한정식",
  "category": "한식",
  "email": "owner@example.com",
  "tone": "정중하고 따뜻한",
  "menu_keywords": ["한정식", "비빔밥", "된장찌개"]
}
```

### `data/campaigns.json`
```json
{
  "id": "2026-05",
  "month": "2026-05",
  "collected_at": "...",
  "trends": { "한식": [...], "분식": [...], "카페": [...] },
  "sources_used": ["foodbank (live)", "mock"],
  "items": [
    {
      "client_id": "c1",
      "copy": { "headline": "...", "slide2": "...", "slide3": "...", "slide4": "...", "cta": "...", "source": "..." },
      "image_url": "https://v3b.fal.media/...png",
      "slide_paths": ["slides/2026-05_c1_1.png", ...]
    }
  ]
}
```

---

## 비용 가늠

| 항목 | 단가 | 사이클당 |
|------|------|---------|
| OpenAI gpt-4o-mini | 매우 저렴 | 클라 5명 × ~1500 토큰 = 수백 원 |
| fal.ai Z-Image Turbo | 약 7원/장 | 5명 × 1장 = **35원** |
| Playwright 스크래핑·합성 | 무료 | 0원 |
| 메일 발송 | v1.5 예정 | - |
| **월간 운영** | | **약 1,000원 미만** |

---

## 6주차 진행 상황

| 주차 | 단계 | 상태 |
|------|------|------|
| Week 1 | 기반 셋업 + 클라이언트 CRUD + Mock 워킹 데모 | ✅ 완료 |
| Week 2 | OpenAI 카피 재창조 + Playwright PNG 합성 | ✅ 완료 |
| Week 3 | fal.ai 음식 이미지 + Slide 1 텍스트 오버레이 | ✅ 완료 |
| Week 4 | 트렌드 자동 스크래핑 (foodbank.co.kr PoC) | ✅ 완료 (PoC 1개) |
| Week 5 | PNG zip 다운로드 + 디자인 베이스 | ✅ 완료 |
| Week 6 | 발표 준비 + 디자인 다듬기 | 🟡 사용자 직접 |

---

## 알려진 한계 (v1)

- **스크래핑은 foodbank.co.kr만 PoC** 수준. ahatrend / atfis / Google는 mock 유지. 발표 후 v1.1에서 확장.
- **이미지 재생성 시드 고정 X** — 매번 다른 이미지. 사용자가 마음에 들 때까지 재호출 필요.
- **슬라이드 디자인 1개 템플릿만** — 디자인 다양화는 v2.
- **메일 발송은 UI만** — 실제 SMTP 연동은 v1.5 (Nodemailer + Gmail 앱 비밀번호).
- **클라이언트 5명 한도** — 30명 확장은 v2.
- **카드뉴스 슬라이드 5장 고정** — 가변 길이는 v2.

---

## v2 로드맵

- 메일 발송 자동화 (Nodemailer + Gmail SMTP, 일일 500통)
- 발송 자동 스케줄링 (매월 1일)
- 4개 사이트 풀 스크래핑 (ahatrend / atfis / Google)
- 클라이언트 30명 확장 + 인증
- 슬라이드 디자인 템플릿 다양화
- 이미지 재생성 시드 고정 / 후보 4장 비교 모드
- 카드뉴스 슬라이드 가변 길이 (3 / 5 / 10장)

---

## 폴더 구조

```
week-6/menu/
├── index.html              # React 컴포넌트 전체
├── single.js               # Express + 외부 API 프록시 + 합성
├── slide-template.html     # Playwright HTML→PNG 캡처용 템플릿
├── data/
│   ├── clients.json        # 클라이언트 메타데이터
│   └── campaigns.json      # 매월 트렌드/카피/슬라이드 히스토리
├── slides/                 # 생성된 PNG (gitignore)
├── package.json
├── .env                    # API 키 (gitignore)
├── .env.example
├── .gitignore
└── README.md
```

---

## 라이선스

MIT.

---

## 크레딧

- OpenAI gpt-4o-mini
- fal.ai Z-Image Turbo
- Playwright
- 식품외식경제 / 월간식당 (foodbank.co.kr) — 트렌드 소스
