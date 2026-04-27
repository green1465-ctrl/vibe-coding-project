# 냉장고 재료 & 레시피 DB 스키마

`index.html` UI와 1:1로 매핑되는 Supabase Postgres 스키마입니다.

## 파일

- `schema.sql` — 테이블/인덱스/트리거/RLS/뷰 정의
- `seed.sql` — UI 기본값과 동일한 시드 데이터

## 테이블 구조

### `ingredients` (냉장고 재료)

| 컬럼 | 타입 | 설명 | UI 매핑 |
|---|---|---|---|
| `id` | BIGSERIAL PK | 자동 증가 ID | `ingredient.id` |
| `name` | TEXT UNIQUE | 재료명(한글) | `ingredient.name` |
| `category` | TEXT CHECK | vegetable / meat / dairy / etc | `ingredient.category` |
| `shelf_life_days` | INTEGER | 유통기한(일) | `ingredient.expiry` |
| `created_at` | TIMESTAMPTZ | 추가 시각 | (정렬용) |
| `updated_at` | TIMESTAMPTZ | 수정 시각 | (자동 갱신) |

### `recipes` (레시피)

| 컬럼 | 타입 | 설명 | UI 매핑 |
|---|---|---|---|
| `id` | BIGSERIAL PK | 자동 증가 ID | `recipe.id` |
| `title` | TEXT UNIQUE | 요리명 | `recipe.name` |
| `ingredients` | TEXT[] | 필요 재료 배열 | `recipe.requires` |
| `steps` | TEXT[] | 조리 순서 | (신규 — 상세보기용) |
| `emoji` | TEXT | 카드 아이콘 | `recipe.emoji` |
| `minutes` | INTEGER | 조리 시간(분) | `recipe.minutes` |
| `description` | TEXT | 한 줄 설명 | `recipe.desc` |
| `created_at` | TIMESTAMPTZ | 등록 시각 | — |
| `updated_at` | TIMESTAMPTZ | 수정 시각 | (자동 갱신) |

## 적용 방법

### Supabase SQL Editor
1. Supabase 대시보드 → SQL Editor
2. `schema.sql` 내용 붙여넣고 실행
3. `seed.sql` 내용 붙여넣고 실행

### psql CLI
```bash
psql "postgresql://postgres.rcbgndycezegxmbavmks:****@aws-1-us-east-1.pooler.supabase.com:6543/postgres" \
  -f schema.sql -f seed.sql
```

## UI 연동 시 권장 쿼리

### 모든 재료 조회 (UI 초기 로드)
```sql
SELECT id, name, category, shelf_life_days AS expiry
FROM ingredients
ORDER BY created_at DESC;
```

### 재료 추가 (UI: + 추가 버튼)
```sql
INSERT INTO ingredients (name, category, shelf_life_days)
VALUES ($1, $2, $3)
RETURNING id, name, category, shelf_life_days AS expiry;
```

### 재료 삭제 (UI: 태그 X 버튼)
```sql
DELETE FROM ingredients WHERE id = $1;
```

### 보유 재료로 만들 수 있는 레시피 (UI 추천 로직)
```sql
SELECT id, title, ingredients, emoji, minutes, description
FROM recipes
WHERE ingredients <@ ARRAY(SELECT name FROM ingredients)
ORDER BY array_length(ingredients, 1) DESC
LIMIT 3;
```
> `<@` 는 "왼쪽 배열이 오른쪽 배열에 모두 포함되는가" 연산자입니다.

### 곧 만료되는 재료 뷰 활용
```sql
SELECT * FROM expiring_soon_ingredients;
```

## 보안 주의

- 제공된 connection string에는 비밀번호가 포함되어 있습니다. **공개 저장소에 커밋하지 마세요.**
- 데모용 RLS 정책은 익명 쓰기를 허용합니다. 운영 시 `auth.uid()` 기반으로 교체하세요.
