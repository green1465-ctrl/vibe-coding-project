-- =====================================================
-- 냉장고 재료 & 레시피 관리 앱 — Supabase Postgres 스키마
-- =====================================================

-- 안전한 재실행
DROP TABLE IF EXISTS recipes     CASCADE;
DROP TABLE IF EXISTS ingredients CASCADE;

-- =====================================================
-- ingredients — 냉장고 보관 재료
-- =====================================================
CREATE TABLE ingredients (
  id          BIGSERIAL   PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  category    TEXT        NOT NULL
                CHECK (category IN ('vegetable', 'meat', 'dairy', 'etc')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ingredients_category_idx   ON ingredients (category);
CREATE INDEX ingredients_created_at_idx ON ingredients (created_at DESC);

-- =====================================================
-- recipes — 레시피
-- =====================================================
CREATE TABLE recipes (
  id           BIGSERIAL   PRIMARY KEY,
  title        TEXT        NOT NULL UNIQUE,
  ingredients  TEXT[]      NOT NULL DEFAULT '{}',  -- 필요 재료명 배열
  steps        TEXT[]      NOT NULL DEFAULT '{}',  -- 조리 순서 배열
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX recipes_ingredients_gin_idx ON recipes USING GIN (ingredients);
CREATE INDEX recipes_created_at_idx      ON recipes (created_at DESC);

-- =====================================================
-- Supabase RLS — 데모 공개 정책
-- =====================================================
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes     ENABLE ROW LEVEL SECURITY;

CREATE POLICY ingredients_select_all ON ingredients FOR SELECT USING (true);
CREATE POLICY ingredients_write_all  ON ingredients FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY recipes_select_all     ON recipes     FOR SELECT USING (true);
CREATE POLICY recipes_write_all      ON recipes     FOR ALL    USING (true) WITH CHECK (true);
