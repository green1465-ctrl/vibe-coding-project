# 냉장고 재료 & 레시피 관리 앱

Express + Supabase Postgres 기반 REST API 서버.

## 파일 구성

```
냉장고 재료 & 레시피 관리앱/
├── server.js          Express 서버 (모든 API 로직)
├── package.json       의존성 (express, pg, dotenv, cors)
├── .env               DATABASE_URL, PORT (커밋 금지)
├── .env.example       .env 템플릿
├── .gitignore         node_modules, .env 제외
├── index.html         CDN React + Tailwind UI (서버에서 정적 서빙)
└── db/
    ├── schema.sql     테이블 DDL
    ├── seed.sql       시드 데이터 (재료 5 / 레시피 8)
    └── README.md
```

## 실행 순서

### 1. (최초 1회) Supabase에 스키마/시드 적용

Supabase 대시보드 SQL Editor에서 `db/schema.sql` → `db/seed.sql` 순서로 실행하세요. 또는 psql:

```bash
psql "postgresql://postgres.rcbgndycezegxmbavmks:****@aws-1-us-east-1.pooler.supabase.com:6543/postgres" \
  -f db/schema.sql -f db/seed.sql
```

### 2. 의존성 설치

```bash
cd "week-4/냉장고 재료 & 레시피 관리앱"
npm install
```

### 3. 서버 실행

```bash
npm start          # 일반 실행
npm run dev        # 파일 변경 시 자동 재시작 (Node 18+)
```

기본 포트: `http://localhost:3000`

## 동작 확인

```bash
# 헬스체크
curl http://localhost:3000/api/health
# => {"ok":true,"dbConnected":true}

# 재료 전체 조회 (시드 5개)
curl http://localhost:3000/api/ingredients

# 레시피 전체 조회 (시드 8개)
curl http://localhost:3000/api/recipes

# 보유 재료로 만들 수 있는 레시피 추천 (상위 3개)
curl http://localhost:3000/api/recipes/recommended

# 재료 추가
curl -X POST http://localhost:3000/api/ingredients \
  -H "Content-Type: application/json" \
  -d '{"name":"버터","category":"dairy","expiry":30}'

# 재료 삭제
curl -X DELETE http://localhost:3000/api/ingredients/1

# 재료 수정 (PATCH)
curl -X PATCH http://localhost:3000/api/ingredients/2 \
  -H "Content-Type: application/json" \
  -d '{"expiry":3}'

# 레시피 추가
curl -X POST http://localhost:3000/api/recipes \
  -H "Content-Type: application/json" \
  -d '{"title":"감자전","ingredients":["감자"],"steps":["감자를 갈아 부친다"],"emoji":"🥔","minutes":15,"description":"바삭한 감자전"}'
```

브라우저에서 `http://localhost:3000/` 접속 시 `index.html` UI가 로드됩니다.
(현재 UI는 localStorage 기반 — API 연동은 다음 단계 작업)

## API 요약

| Method | Path | 설명 |
|---|---|---|
| GET    | `/api/health`               | 서버 + DB 연결 상태 |
| GET    | `/api/ingredients`          | 재료 전체 조회 (created_at DESC) |
| POST   | `/api/ingredients`          | 재료 추가 `{name, category, expiry}` |
| PATCH  | `/api/ingredients/:id`      | 재료 부분 수정 |
| DELETE | `/api/ingredients/:id`      | 재료 삭제 |
| GET    | `/api/recipes`              | 레시피 전체 조회 |
| GET    | `/api/recipes/recommended`  | 보유 재료로 만들 수 있는 레시피 (상위 3) |
| POST   | `/api/recipes`              | 레시피 추가 |
| DELETE | `/api/recipes/:id`          | 레시피 삭제 |

### 응답 형식 (UI 호환)

ingredients: DB의 `shelf_life_days`는 응답에서 `expiry`로 alias 처리.

```json
{
  "id": 1,
  "name": "계란",
  "category": "meat",
  "expiry": 30,
  "created_at": "2026-04-26T..."
}
```

recipes:

```json
{
  "id": 1,
  "title": "치즈 오믈렛",
  "ingredients": ["계란", "치즈"],
  "steps": ["...", "..."],
  "emoji": "🍳",
  "minutes": 10,
  "description": "...",
  "created_at": "2026-04-26T..."
}
```

## 검증 규칙

- `category` ∈ `vegetable | meat | dairy | etc`
- `expiry` ∈ `0..365`
- 같은 `name` 재료 / 같은 `title` 레시피 중복 시 `409 Conflict`

## 보안 메모

- `.env`는 `.gitignore`에 등록되어 있습니다. 절대 커밋하지 마세요.
- Supabase pooler 연결은 SSL 필수 (`ssl: { rejectUnauthorized: false }`).
