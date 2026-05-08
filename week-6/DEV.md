# DEV.md - 개발 가이드

> 외식 프랜차이즈 영업대행업체용 시즌 캠페인 카드뉴스 자동 생성 웹앱
> Architecture: **Option 1 — Single-File Architecture (단일 파일 구조)**

---

## 1. 프로젝트 스펙

### Mission 요약
영업대행업체가 매월 1회 "이번 달 트렌드 가져오기" 클릭 → 시스템이 4개 외식 트렌드 소스에서 업종별 트렌드 자동 수집 → AI가 카피 재창조 + 음식 이미지 생성 → 슬라이드 **5장 카드뉴스 PNG**를 클라이언트별로 만들어 **zip 다운로드**.

**Definition of Done (6주차 마지막 날)**
> "5월 시즌 캠페인을 외식 프랜차이즈 5개 클라이언트 대상으로, 업종별 트렌드 자동 수집 → 카피 재창조 → 슬라이드 5장 생성 → PNG zip 다운로드까지 1사이클 30분 이내"

### Requirements
- [ ] 단일 파일 구조 (`index.html` + `single.js`)
- [ ] React 18 (CDN) + Tailwind (CDN) + Babel standalone
- [ ] Express 서버 (API 프록시 + 정적 서빙 + 슬라이드 합성)
- [ ] 클라이언트 CRUD UI (추가/수정/삭제, 업종 카테고리 포함)
- [ ] 4개 트렌드 소스 자동 스크래핑 (Playwright)
  - ahatrend.com / foodbank.co.kr / atfis.or.kr / Google
- [ ] OpenAI gpt-4o-mini로 **카피 재창조** (트렌드 원문 X, 가맹점 활용 가능 톤)
- [ ] fal.ai Z-Image Turbo로 클라이언트당 음식 이미지 1장 (텍스트 X)
- [ ] 슬라이드 5장 합성 (Playwright HTML→PNG)
  - Slide 1 = 음식 이미지 + 헤드라인 오버레이
  - Slide 2~5 = 텍스트 슬라이드
- [ ] 슬라이드 5장 carousel 미리보기 + 카피 인라인 수정
- [ ] 카피 수정 시 슬라이드 자동 재합성
- [ ] 클라이언트별 PNG 5장 zip 다운로드 (archiver)
- [ ] 출처 표시 (Slide 5)

### Non-goals
- 실제 메일 발송 (v1.5)
- 이미지 재생성 기능
- 클라이언트 30개 확장
- 슬라이드 디자인 템플릿 다양화
- 네이티브 모바일 앱
- ikfa.or.kr / k-franchise.or.kr 연동 (콘텐츠 부족)

### Style
- **톤**: 영업대행업체 실무 도구 (요란한 디자인 X)
- **메인 화면 레이아웃**: 좌측 클라이언트 5개 리스트 → 우측 선택된 클라이언트의 슬라이드 5장 carousel + 카피 편집 영역
- **컬러**: Tailwind 기본. 강조 emerald-600. 텍스트 slate-900/700/500.
- **슬라이드 디자인**: 1080×1080 정사각, 인스타 카드뉴스 표준
  - Slide 1: 풀 이미지 + 하단 그라데이션 오버레이 + 헤드라인 텍스트
  - Slide 2~5: 단순 배경(slate-50) + 큰 타이포 + 강조색 포인트

### Key Concepts
| 용어 | 설명 |
|------|------|
| 클라이언트 | 영업대행업체가 관리하는 외식 프랜차이즈 1곳 (이름/업종/메일/톤) |
| 캠페인 | 한 달치 트렌드 기반 콘텐츠 묶음 (5명 클라이언트 × 슬라이드 5장 = 25장) |
| 트렌드 수집 | 4개 소스에서 업종별 키워드로 자동 스크래핑 |
| 카피 재창조 | 트렌드 원문 그대로 X, 클라이언트 톤·업종에 맞춰 AI가 새 카피 생성 |
| 슬라이드 합성 | HTML 템플릿 → Playwright headless로 PNG 캡처 (한글 자동 + CSS 자유) |
| 1사이클 | 트렌드 가져오기 → 카피 재창조 → 슬라이드 합성 → 검수·수정 → zip 다운로드 |

### Open Questions
- Playwright vs chrome-devtools MCP — Week 4에 PoC로 결정 (Playwright 우세)
- Google 검색 스크래핑 — Custom Search API(무료 1일 100건) vs SERP 스크래핑 → 무료 한도 우선 시도
- 슬라이드 한글 폰트 — Pretendard/Noto Sans KR 웹폰트 임포트 (서버 합성 시 Playwright가 자동 로드)
- 카피 재합성 트리거 — 디바운스(2초) vs 명시적 "다시 합성" 버튼 → 명시적 버튼이 안전

### 기술 스택
- **프론트엔드**: React 18 (CDN) + Tailwind CSS (CDN) + Babel standalone
- **백엔드**: Express (단일 single.js)
- **LLM**: OpenAI gpt-4o-mini
- **이미지**: fal.ai Z-Image Turbo
- **스크래핑 + 슬라이드 합성**: **Playwright** (한 라이브러리로 둘 다)
- **PNG zip**: `archiver`
- **저장소**: JSON 파일 (`data/clients.json`, `data/campaigns.json`)

---

## 2. 선택된 개발 구조 — Option 1: Single-File

`index.html` 한 파일에 React 컴포넌트 전체를 담고, `single.js`는 Express로 정적 서빙 + 외부 API 프록시 + 트렌드 스크래핑 + 슬라이드 합성을 한다.

---

## 3. 개발 에이전트

| 에이전트 | 담당 |
|---------|------|
| `single-react-dev` | `index.html` 내 모든 React 컴포넌트 |
| `single-server-specialist` | `single.js` Express 서버 + 4개 외부 API/스크래핑/합성 |

**index.html 내부 구조:** Hooks → Design System → Common → Pages → App → Render

---

## 4. 프로젝트 구조

```
week-6/menu/
├── index.html         # React 컴포넌트 전체 — single-react-dev 담당
├── single.js          # Express 서버 + 스크래핑/합성 — single-server-specialist 담당
├── slide-template.html # 슬라이드 합성용 HTML 템플릿 (Playwright가 렌더링 후 PNG 캡처)
├── data/
│   ├── clients.json   # 클라이언트 5개 메타데이터
│   └── campaigns.json # 매월 트렌드/카피/슬라이드 히스토리
├── slides/            # 생성된 PNG 임시 (gitignore)
├── package.json
├── .env               # OPENAI_API_KEY, FAL_KEY, PORT
├── .env.example
├── .gitignore
└── README.md
```

`clients.json` 스키마:
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

`campaigns.json` 스키마:
```json
{
  "id": "2026-05",
  "month": "2026-05",
  "collected_at": "2026-05-01T...",
  "trends": {
    "한식": [{ "title": "...", "summary": "...", "source_url": "...", "source_name": "ahatrend" }],
    "분식": [...],
    "카페": [...]
  },
  "items": [
    {
      "client_id": "c1",
      "copy": {
        "headline": "...",
        "slide2": "...",
        "slide3": "...",
        "slide4": "...",
        "cta": "...",
        "source": "ahatrend.com"
      },
      "image_url": "...",
      "review_state": "ok|skip|pending"
    }
  ]
}
```

---

## 5. 6주차 단계별 TODO

### Week 1 — 기반 셋업 + 클라이언트 CRUD + Mock 워킹 데모

**목표**: 클라이언트 5개 등록 → mock 트렌드/카피로 슬라이드 5장 미리보기까지

- [ ] 🟢 (기존) Express + dotenv 셋업 — `single.js` 갈아엎기
- [ ] 🟢 클라이언트 CRUD API (`GET/POST/PUT/DELETE /api/clients`)
- [ ] 🟡 클라이언트 CRUD UI (추가/수정/삭제 모달, 업종 셀렉트)
- [ ] 🟡 mock 트렌드 응답 (`POST /api/collect-trends` — 하드코딩 mock)
- [ ] 🟡 mock 카피 5섹션 응답 (`POST /api/generate-copy`)
- [ ] 🟢 슬라이드 carousel UI (5장 좌우 화살표, 인디케이터)
- [ ] 🟢 슬라이드 HTML 템플릿 시안 (`slide-template.html` — Slide 1~5 디자인)

📌 체크포인트: **클라이언트 등록 → "트렌드 가져오기" mock → 슬라이드 5장 carousel 미리보기**

### Week 2 — OpenAI 카피 재창조 + 슬라이드 PNG 합성

- [ ] 🟡 OpenAI gpt-4o-mini 호출 (`generateCopyReal(client, trends)`)
- [ ] 🟡 카피 재창조 프롬프트 튜닝 (트렌드 원문 X, 가맹점 톤)
- [ ] 🔴 Playwright 셋업 (`npm install playwright` + chrome 설치) ⚠️ Windows 셋업 막히면 puppeteer fallback
- [ ] 🔴 HTML→PNG 합성 함수 (`renderSlide(html) → Buffer`)
- [ ] 🟡 슬라이드 5장을 클라이언트당 합성 → `slides/{client_id}_{slide_n}.png` 저장
- [ ] 🟢 화면에서 PNG 직접 표시 (carousel)

📌 체크포인트: **실제 OpenAI 카피 + 실제 PNG 5장이 화면에 떠야 함**

### Week 3 — fal.ai 음식 이미지 + Slide 1 텍스트 오버레이

- [ ] 🟡 fal.ai 호출 함수 (`generateFoodImage(client, copy.headline)`)
- [ ] 🟡 업종 + 메뉴 키워드 → 이미지 프롬프트 자동 변환
- [ ] 🔴 Slide 1 합성: HTML 템플릿에 fal.ai 이미지 URL 임베드 + 헤드라인 오버레이 → PNG 캡처 ⚠️ 그라데이션·줄바꿈 디테일 시간 잡아먹을 수 있음
- [ ] 🟢 카피 인라인 수정 UI (textarea 5개 + "다시 합성" 버튼)
- [ ] 🟢 수정 시 영향받는 슬라이드만 재합성

📌 체크포인트: **카피 + Slide 1 음식 이미지 + 텍스트 오버레이까지 풀 합성 동작**

### Week 4 — 트렌드 자동 스크래핑

- [ ] 🔴 Playwright로 4개 사이트 스크래핑 함수 작성 ⚠️ 사이트별 DOM 구조 분석 필요
  - ahatrend.com (Ranking & Trends 페이지)
  - foodbank.co.kr (월간식당 시즌 마케팅 섹션)
  - atfis.or.kr (식품외식전망)
  - Google 검색 (업종 키워드)
- [ ] 🔴 업종별 키워드 매칭 (한식/분식/카페 → 각각 다른 검색어)
- [ ] 🟡 출처 메타데이터 저장 (URL + 사이트명 + 수집 일시)
- [ ] 🟡 스크래핑 실패 시 fallback (직전 달 트렌드 재사용 또는 mock)
- [ ] 🟡 Slide 5에 출처 표시

📌 체크포인트: **실제 4개 사이트에서 업종별 트렌드 가져와서 카피에 반영**

### Week 5 — PNG zip 다운로드 + 디자인 다듬기

- [ ] 🟡 archiver로 클라이언트당 5장 zip 묶기
- [ ] 🟢 "다운로드" 버튼 → `client_id_2026-05.zip` 받기
- [ ] 🟢 슬라이드 디자인 다듬기 (디자이너 강점 활용)
- [ ] 🟡 한글 폰트 임포트 (Pretendard 또는 Noto Sans KR)
- [ ] 🟢 campaigns.json에 매월 히스토리 저장
- [ ] 🟡 직전 달 캠페인 다시 보기 (히스토리 뷰)

📌 체크포인트: **1사이클 30분 안에 zip 5개 다운로드 완료**

### Week 6 — 발표 준비 + 버그 픽스

- [ ] 🟢 풀 사이클 데모 시나리오 리허설
- [ ] 🟡 README.md (스크린샷 + 사용법)
- [ ] 🟡 배포 결정 (Vercel / Render — Playwright 있어서 Render 유력)
- [ ] 🟢 발표 자료 (시연 영상 + 비용 분석 + v2 로드맵)

📌 체크포인트: **배포된 URL에서 실시간 데모 가능**

---

## 6. 외부 설정 필요 항목

### 1주차 시작 전 (필수)
| 항목 | 발급처 | 비용 | .env 변수명 |
|------|--------|------|------------|
| OpenAI API Key | platform.openai.com → API keys | gpt-4o-mini 매우 저렴 | `OPENAI_API_KEY` |

### Week 3에 추가
| 항목 | 발급처 | 비용 | .env 변수명 |
|------|--------|------|------------|
| fal.ai API Key | fal.ai/dashboard/keys | 장당 ~7원 (사이클당 35원) | `FAL_KEY` |

### Week 6 (배포)
| 항목 | 발급처 | 비용 |
|------|--------|------|
| Render 계정 (Playwright 동작) | render.com | 무료 (sleep 있음) |

### .env.example 템플릿
```env
OPENAI_API_KEY=sk-...
FAL_KEY=fal-...
PORT=3000
```

> ⚠️ API 키는 절대 채팅창/커밋/공개 저장소에 노출 금지. `.env`는 반드시 `.gitignore`에.

---

## 7. 시작하기 — 1주차 첫날 명령어

```bash
cd week-6/menu
# 추가 패키지 설치 (기존: express dotenv openai)
npm install playwright archiver

# Playwright 브라우저 다운로드 (~300MB, 1회만)
npx playwright install chromium
```

### 첫날 작업 순서
1. **single-server-specialist 에이전트로 `single.js` 갈아엎기**
   - 기존 `/api/health`, `/api/clients` (GET) 유지
   - 추가: `POST/PUT/DELETE /api/clients`, `POST /api/collect-trends` (mock), `POST /api/generate-copy` (5섹션 mock), `POST /api/render-slide` (mock — Week 2에 실제 합성)
2. **single-react-dev 에이전트로 `index.html` 갈아엎기**
   - 클라이언트 CRUD UI + 슬라이드 5장 carousel + 카피 편집 영역
3. **mock 데이터로 1사이클 워킹 데모**

---

## 8. 위험 신호 체크포인트

| 시점 | 위험 신호 | 대응 |
|------|----------|------|
| Week 2 | Playwright Windows 셋업 막힘 | puppeteer로 전환 (동일 API 거의 호환) |
| Week 3 | Slide 1 텍스트 오버레이 디테일에 시간 빠짐 | 단순 디자인 1개로 고정, "디자인 다양화"는 v2 |
| Week 4 | 4개 사이트 중 일부 스크래핑 차단 | 차단된 소스 빼고 나머지 + Google fallback로 v1 마무리 |
| Week 5 | zip 다운로드 막힘 | 개별 PNG 다운로드 5번으로 우회 |

> **원칙**: 매주 git commit 시점에 자가 진단. 미달성이면 다음 주 시작 전 스코프 조정.

---

## 9. 비용 가늠

- **5개 클라이언트 × 음식 이미지 1장 = 35원/사이클** (fal.ai)
- LLM 카피 재창조: 클라이언트당 약 1,500 토큰 → 사이클당 수백 원
- 트렌드 스크래핑: 무료 (셀프 호스팅 Playwright)
- **월간 운영 비용: 1,000원 미만**
- **6주 개발 중 호출 비용 총합: 1만 원 이내 예상**
