# Framer 최근 소식 & 디자인 방법 정리

> **수집일**: 2026-05-01
> **수집 도구**: `chrome-devtools` MCP (실제 Chrome 자동화로 navigate → snapshot/evaluate_script → screenshot)
> **탐색 사이트**: 4곳 (Framer Blog · Framer Updates · Framer Academy · Framer University)
> **상세 본문 정독**: 2개 (Rolldown 엔지니어링 글, Series D 투자 발표)
> **스크린샷**: 6장, `week-5/framer-screenshots/` 에 저장

---

## 0. 탐색 대상 사이트

| # | 사이트 | URL | 성격 |
|---|---|---|---|
| 1 | Framer Blog | https://www.framer.com/blog/ | 공식 블로그 (Inspiration / Tutorials / Engineering / News) |
| 2 | Framer Updates | https://www.framer.com/updates/ | 제품 changelog (월별·주별 릴리스 노트) |
| 3 | Framer Academy | https://www.framer.com/learn/ → /academy/ | 공식 무료 강좌·레슨 라이브러리 |
| 4 | Framer University | https://www.framer.university/ | Nandi(첫 공식 멘토)가 운영하는 커뮤니티 강좌·리소스 사이트 |

---

## 1. Framer 최신 헤드라인 (2026-05 기준)

### 회사·전략 단위 큰 뉴스

- **Series D, $100M 투자 유치 / 기업가치 $2B**
  - 리드: Meritech · Atomico (기존 투자자), 추가 참여 WiL · HV
  - 제품 외 핵심 메시지: "지난 1년간 break-even 흑자였고, 라운드는 외부에서 먼저 들어온 라운드"
  - 자금 사용처: ① 미국 시장 확장 ② AI 투자 심화 ③ Product/GTM 동시 스케일
  - 레퍼런스 고객: Perplexity, Cal.com, Miro, Scale AI, Mixpanel, Huel, Zapier
  - 또한 "최근 YC 배치의 거의 절반이 Framer로 런칭"이라고 주장
- **Framer Reloaded — First of Kind** (Koen & Jorn 공동 인터뷰; 블로그 메인 hero)
- **요금제 단순화** (`/blog/pricing-update/`)

### 최근 엔지니어링 인사이트

- **Bundling at Framer: Rolldown for faster sites** (Jacob Groß, 2025-11-20, 5분 분량)
  - 9월에 esbuild → **Rolldown** 으로 자바스크립트 번들러 교체
  - 측정 결과 (p75 LCP):
    - JS 번들 >2MB 대형 사이트: **LCP 평균 41% 개선**
    - 1–2MB 중형 사이트: 평균 4% 개선
    - 전체 Framer 사이트 p90 LCP: 11% 감소
  - JS 사이즈 자체가 **median 36% 감소** (압축 전·후 모두)
  - **청크 수**도 "스위트 스팟" 25개 근처로 수렴: p75 67→22, p90 80→30, p99 95→54
  - Rust 기반 `oxc-minify`, native MagicString(AST 변환) 사용 → CMS 페이지 로딩 추가 가속
  - VoidZero(Rolldown 개발사)와 직접 협업해 chunking 개선을 오픈소스에 기여
  - 발표: ViteConf 2025 토크
- **Traffic-aware Pre-Rendering** (`/blog/dynamic-optimization/`) — 트래픽 패턴에 따라 사전 렌더링 대상을 자동 조정

### 자주 보이는 콘텐츠 카테고리 (블로그 41개 글 기반)

| 카테고리 | 대표 글 |
|---|---|
| Engineering | Rolldown 번들링, Traffic-aware Pre-Rendering |
| News | Series D, Pricing update |
| Inspiration | "11 best marketing agency websites in 2026", "20 best restaurant website examples", "10 elegant color palettes", "best SaaS websites" 등 — 사례 큐레이션이 트래픽 엔진 |
| Tutorials | A/B 테스트 7단계, 반응형 breakpoints, 색상 스킴, web design process 9단계, UX 원칙 7가지, landing page best practices |

---

## 2. Framer Updates — 최근 changelog 16건 (직접 추출)

> 첫 화면에서 스크롤 자동화 후 `/updates/<slug>` 링크로 들어가는 글 16개를 수집. 날짜/요약은 페이지 본문에서 그대로 발췌.

| # | 릴리스 | 시기 | 핵심 |
|---|---|---|---|
| 1 | **CMS Plugins** | Yesterday | 플러그인이 CMS 사이드바에 전용 뷰로 복귀, Save 버튼/Esc 동작 수정 |
| 2 | **Logo Shaders** | Last week | SVG/PNG 업로드 후 Gradient·Glass 셰이더 적용 (Contour/Dispersion/Bevel 효과) |
| 3 | **CMS 3.0** | Last week | 테이블 인라인 편집, 다중셀 선택, 폴더, 컬럼 리사이즈/리오더, 키보드 내비 재설계 — CMS 전면 재디자인 |
| 4 | **Holo Shader** | 4 weeks ago | 홀로그래픽 그라디언트 셰이더 (수학 파라미터로 색·왜곡 제어) |
| 5 | **Auto Translate** | 4 weeks ago | Localization에 AI 자동 번역, Canvas/CMS 변경 시 즉시 동기화 — "Translate All" 액션 추가 |
| 6 | **March Update: Bento** | 4 weeks ago | Bento Grid 레이아웃, freeform Stack 정렬, Stack placeholder 안정화 |
| 7 | **Chromatic Aberration** | 2 months ago | Radial/Swirl/Horizontal/Vertical 모드의 색수차 셰이더 |
| 8 | **Shaders** | 2 months ago | Shader 라이브러리 자체 런칭 — 그라디언트·이미지 효과·파티클을 웹 최적화로 제공 |
| 9 | **Static Files** | 2 months ago | 도메인 임의 경로에 정적 파일 서빙 (verification flow, manifest 등) — Pro/Scale 전용 |
| 10 | **Custom Distribution** | 2 months ago | A/B 테스트 분배 비율 커스텀, CMS 페이지 A/B 지원, tracking ID 필터, 폴더 |
| 11 | **Framer Convert** | 2 months ago | Funnels + A/B + Triggers 묶음 add-on, dynamic Triggers (스크롤·날짜 기반 오버레이 등) |
| 12 | **February Update: Flow** | 3 months ago | Flow Effect를 Layout Templates까지 확장 (Accordion/FAQ 등) |
| 13 | **CMS: Dynamic Filters** | 3 months ago | Search/Tabs/Toggles/Dropdowns/Checkboxes 필터를 페이지 변수에 자동 바인딩 |
| 14 | **Server API** | 3 months ago | Plugin API와 동등한 capabilities를 외부 서버에서 호출 (WebSocket 기반, AI 에이전트·webhook·cron) — 베타 무료 |
| 15 | **CMS Components** | 3 months ago | 본문에 Canvas Component를 그대로 삽입 (variants/properties/responsive 유지) |
| 16 | **Empty States in CMS Lists** | 4 months ago | Collection이 비었거나 필터 결과가 0일 때 캔버스에서 직접 빈 상태 디자인 |

### 큰 흐름

1. **CMS 대대적 리뉴얼** — CMS 3.0 + Plugins 복귀 + Components 임베드 + Dynamic Filters + Empty States. "내용 관리"가 캔버스 옆 1급 시민으로 승격됨.
2. **Shaders 패밀리** — Shaders 자체 런칭 후 Holo / Chromatic Aberration / Logo Shaders 까지 빠르게 추가. "코드 셰이더 to 디자이너 친화 셰이더" 라인업 구축.
3. **Convert(전환 최적화)** — Funnels + A/B + Triggers + Custom Distribution. 디자인 툴에서 "런칭 후 운영"까지 잡으려는 의도.
4. **AI/자동화 인프라** — Auto Translate, Server API. Framer를 헤드리스/에이전트 통합 가능한 백엔드로 확장.
5. **Bento·Flow** — 레이아웃 시스템 자체의 점진적 진화.

---

## 3. Framer Academy (공식 러닝) — 커리큘럼

> `/learn/`은 `/academy/`로 리다이렉트. 코스/레슨/토픽 트리를 모두 추출.

### 메인 코스 4종

| 코스 | 분량 | 학습 목표 |
|---|---|---|
| **Framer Fundamentals** | 4h 6m | 레이아웃·스타일·콘텐츠·컴포넌트·런칭 — 노코드로 반응형 사이트 디자인·퍼블리시 (입문 표준) |
| **Animations and Interactions in Framer** | 2h 35m | hover 같은 미세 효과부터 풀 시퀀스 트랜지션까지, "의도 있는 모션" |
| **Framer CMS Basics** | 26m | CMS 컬렉션·아이템·필드·Collection List |
| **Vectors in Framer** | (분량 미표기) | 클린 패스, 재사용 가능한 Vector Set, 변수, Stroke Effect |

### 토픽별 레슨 카운트

| 토픽 | 레슨 수 |
|---|---|
| Layout & Design | 63 |
| Animations | 35 |
| Publishing & Settings | 25 |
| CMS | 13 |
| SEO | 11 |
| Navigation | 9 |
| Forms / Insert / Scroll | 6 ea |
| Localization | 5 |
| Templates | 4 |
| AI / Plugins / Quick Tips | 2–3 ea |

### Fundamentals 코스 대표 레슨 (캡처된 5분 안팎 비디오)

- "Getting familiar with the Framer interface" (5:16)
- "Thinking in frames" (3:53)
- "Stacks vs grids" (7:45)
- "Stacks and relative positioning" (8:05)
- "Sizing to fill and fit content" (7:37)
- "Absolute positioning" (7:39)

### CMS 코스 대표 레슨

- "What is the Framer CMS?" (2:45)
- "CMS collections, items & fields" (5:51)
- "CMS pages & dynamic content" (8:31)
- "Utilizing collection lists" (9:17)

### 최신 단발 레슨 (몇 주~몇 달 내)

- "8 Framer shortcuts you're probably sleeping on" (3 weeks ago, 4:19)
- "Adding a Locale in Framer" (3 weeks ago, 5:18)
- "Exporting Assets in Framer" (4 weeks ago, 3:09)
- "Animating Vectors in Framer" (2 months ago, 4:25)
- "Sharing Vector Sets across Projects" / "Connecting Vector Sets to the Framer CMS" (2 months ago)

> **편집자 주**: Academy의 학습 동선은 명확히 *Frames → Stacks/Grids → Components → CMS → Animations → Publishing/SEO* 순으로 짜여 있음. "Thinking in frames"가 입문 첫 강의라는 점이 Framer의 멘탈 모델 핵심.

---

## 4. Framer University (커뮤니티) — Nandi 운영

| 카테고리 | 분량 / 설명 |
|---|---|
| **Lessons** (`/lessons/featured`) | "100+ no-bullshit, practical video lessons" — Nandi가 직접 강의 |
| **Resources** (`/resources/featured`) | "416+ copy-and-paste-able animations, components, code overrides, website rebuilds" |
| **Blog** (`/blog`) | 예: "This is The Best Free Alternative for Framer Forms", "How to Create a Lightbox Effect in Framer" |
| **Live Support** | 30/60분 1:1 Framer 컨설팅 (현재는 closed) |
| **Course** | "How to Make $10K+ with Framer in 60 days" — 외부 도메인 `go.frameruniversity.com` 에서 판매, 2026년 정식 플랫폼 런칭 예정 |
| **Milestones** | 운영 히스토리 페이지 |

### 포지셔닝 메시지

- "Lessons → Resources → Blog → Live Support" 의 4단 구조로 Framer 공식 Academy를 보완
- 평가: Framer 공동창업자 **Koen Bok ("The goat")**, Easlo, Traf 같은 디자인 인플루언서의 추천이 사이트 hero에 깔려 있음
- 비즈니스 모델: 무료 콘텐츠 + 유료 코스 + 1:1 + 파트너 코드(`partner25proyearly` 25% 할인 = 연결제 3개월 무료)
- **Framer 직원이 아닌 독립 프로젝트** (FAQ에서 명시). 단, "Framer 팀과 긴밀히 협업"

---

## 5. 상세 정독 ① — "Bundling at Framer: Rolldown for faster sites"

> 핵심 한 줄: **esbuild → Rolldown 교체로 큰 사이트의 LCP가 평균 41% 줄었다**

### 왜 바꿨나
- esbuild로는 **chunking 전략 미세조정이 불가능**했음
- Rolldown은 같은 속도(또는 더 빠름)에 chunking·minify·AST 변환까지 제공

### 측정 결과
- LCP p75: 대형(>2MB) -41%, 중형(1–2MB) -4%, 전체 p90 -11%
- JS 사이즈 median **-36%**
- 청크 수: 거대 사이트도 약 100개 → ~25개의 "스위트 스팟"에 근접

### 기술 포인트
- `oxc-minify` (Rust) — esbuild minifier보다 일관되게 빠르고 결과물 작음
- "native MagicString" — Rust로 AST 변환을 즉석에서, 특히 CMS 페이지 로딩 가속
- React / Motion / Framer 내부 라이브러리를 **각각 다른 청크**로 분리 → 한쪽만 업데이트돼도 다른 캐시는 유효
- 브라우저 측 IPC(Blink ↔ V8) 오버헤드도 chunk 수가 적을수록 감소
- HTTP/3 사용해도 큰 파일이 압축에 유리하다는 입장 (Harry Roberts 인용)

### 함의
- "디자인 툴"이 동시에 "사이트 빌더"가 되려면 결국 *전송된 페이로드*가 경쟁력. Framer는 디자이너 표면(Canvas/CMS)뿐 아니라 백엔드 컴파일러 레이어까지 직접 통제하는 방향으로 가고 있음.
- 오픈소스(Rolldown/Vite)에 직접 기여 → 인하우스 최적화가 곧 생태계 기여.

---

## 6. 상세 정독 ② — "Why the best companies are moving to Framer (Series D)"

> 핵심 한 줄: **$100M / 1년간 흑자 / 목표는 'Framer가 회사의 .com 전체를 운영하게 하는 것'**

### 시장 포지셔닝 (글에서 직접 인용한 내러티브)
- "Wix·Squarespace는 *개인 사이트* 시대를 풀었지만, 전문·고트래픽·브랜드 .com은 여전히 *개발자 의존* 워크플로에 갇혀 있다 — 그 갭을 닫는다"
- 무기 묶음: **Canvas(디자인)** + **CMS** + **Advanced Analytics** + **A/B + Funnel Tracking** + **Live Collaboration** + **Enterprise Security**
- 트래픽 증거: 50만+ 월간 액티브, 수십만 사이트, "최근 YC 배치 절반"

### 자금 사용처
1. 미국 확장 (현재 거점: Amsterdam · SF · NY · Barcelona)
2. AI 투자 심화 (Auto Translate, Server API와 같은 줄기)
3. 제품·GTM 동시 스케일

### 가까운 시일 발표 예고
- 최근 출시된 **on-page editing** (CMS·Canvas 안 들어가도 카피·이미지·페이지 수정)
- "이번 가을 이벤트에서 메이저 발표"

---

## 7. 한 줄 정리: Framer가 지금 풀고 있는 문제

| 축 | 2026 봄 시점 Framer의 답 |
|---|---|
| 디자인 표면 | Canvas + Bento Grid + Shaders + Stacks/Grids 멘탈 모델 |
| 콘텐츠 | CMS 3.0 (테이블 직접편집) + Components in CMS + Dynamic Filters + Empty States |
| 다국어 | Auto Translate (AI 모델 선택, Canvas/CMS 동기) |
| 전환 | Convert (A/B + Funnels + Triggers + Custom Distribution) |
| 자동화 | Server API (외부 서버·AI 에이전트·webhook에서 Plugin API 동등 호출) |
| 성능 | Rolldown 번들러 교체 → LCP 41%↓, JS 36%↓ + Traffic-aware Pre-Rendering |
| 학습 | Framer Academy (Fundamentals 4시간 코스 + 토픽별 100+ 비디오) + Framer University 커뮤니티 |

---

## 8. 수집 방법론 (chrome-devtools MCP 호출 순서)

> 본 문서의 데이터는 모두 **실제 브라우저(Chromium) 자동화**로 수집했음. WebFetch는 사용하지 않음.

### MCP 서버
- `mcp__chrome-devtools__*` 계열 도구 (chrome-devtools MCP)

### 호출 순서

| # | 도구 | 인자 | 결과 |
|---|---|---|---|
| 1 | `list_pages` | — | 현재 열린 탭 확인 (`about:blank`) |
| 2 | `navigate_page` | `type=url`, `url=https://www.framer.com/blog/` | Blog 메인 진입 |
| 3 | `evaluate_script` | `document.querySelectorAll('a[href*="/blog/"]')` 으로 41개 글 수집 | 카테고리/제목/URL 추출 |
| 4 | `take_screenshot` | `filePath=week-5/framer-screenshots/01-blog-list.png` | 1번째 캡처 |
| 5 | `navigate_page` | `url=https://www.framer.com/updates/` | Changelog 진입 |
| 6 | `evaluate_script` | `window.scrollTo(0, document.body.scrollHeight)` × 8회 + 셀렉터로 update 링크/본문 텍스트 수집 (lazy-load 강제) | 16개 changelog 항목 + 본문 16,000자 추출 |
| 7 | `take_screenshot` | `02-updates-changelog.png` | 2번째 캡처 |
| 8 | `navigate_page` | `url=https://www.framer.com/learn/` (자동으로 `/academy/`로 리다이렉트) | Academy 진입 |
| 9 | `evaluate_script` | scroll + `document.querySelectorAll('a')` 전체에서 코스 4개·토픽 14개·레슨 다수 추출 | 커리큘럼 트리 |
| 10 | `take_screenshot` | `03-academy.png` | 3번째 캡처 |
| 11 | `navigate_page` | `url=https://www.framer.university/` | 커뮤니티 사이트 진입 |
| 12 | `evaluate_script` | scroll + 본문 텍스트 7,500자, 외부 링크 24개 (X 트윗, 강좌, FAQ 등) 추출 | 섹션 구조·테스티모니얼·FAQ 본문 |
| 13 | `take_screenshot` | `04-framer-university.png` | 4번째 캡처 |
| 14 | `navigate_page` | `url=https://www.framer.com/blog/framer-rolldown/` | 상세 정독 ① |
| 15 | `evaluate_script` | `document.querySelector('article').innerText` 6,000자 | 본문 발췌 |
| 16 | `take_screenshot` | `05-blog-rolldown-detail.png` | 5번째 캡처 |
| 17 | `navigate_page` | `url=https://www.framer.com/blog/series-d/` | 상세 정독 ② |
| 18 | `evaluate_script` | (지연 로드 대기 후) `document.querySelector('main').innerText` 6,000자 | Series D 본문 |
| 19 | `take_screenshot` | `06-blog-series-d-detail.png` | 6번째 캡처 |

### 주의사항 / 학습 노트

- `take_snapshot`은 a11y 트리만 주기 때문에, **카드 리스트가 div 그라디언트로 그려진** Framer 페이지에서는 빈 결과가 많음 → `evaluate_script`로 직접 DOM 파싱한 게 훨씬 신뢰도 높았음.
- Framer는 **클라이언트 렌더링 + lazy mount** 가 일반적이라 `await new Promise(r => setTimeout(r, 1500))` 또는 반복 `scrollTo(0, body.scrollHeight)` 가 필요. 첫 호출에 빈 결과가 와도 두 번째 시도에서 들어옴 (실제로 Series D 글은 1차 호출에서 article body가 비었고, 1.5초 대기 후 다시 호출하니 6,000자 수신).
- 셀렉터 전략: 각 페이지마다 *콘텐츠 컨테이너가 다름* → `article`, `main`, `body` 순으로 폴백.
- 링크 dedupe는 `Set` 으로 직접 처리 (Framer 페이지는 동일 카드를 그리드/모바일 중복 렌더링하는 경우가 있음).
- WebFetch 대비 장점: **JS로 렌더되는 카드 리스트**(블로그·아카데미)와 **무한 스크롤 changelog**를 그대로 수집 가능.

### 산출물

- 본 문서: `week-5/framer-news-and-design.md`
- 스크린샷 6장: `week-5/framer-screenshots/01-blog-list.png` ~ `06-blog-series-d-detail.png`
