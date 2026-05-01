-- =====================================================
-- W5 Community — Auth Migration
-- users 테이블 추가 + posts.user_id FK 추가
-- 기존 익명 글은 user_id NULL로 남겨둠 (legacy anonymous)
-- =====================================================

-- 1) 사용자 테이블
CREATE TABLE IF NOT EXISTS "W5_community_users" (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  display_name  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_W5_community_users_email
  ON "W5_community_users" (email);

-- 2) posts에 user_id 컬럼 추가 (nullable: 기존 익명 글 보존)
ALTER TABLE "W5_community_posts"
  ADD COLUMN IF NOT EXISTS user_id BIGINT
  REFERENCES "W5_community_users"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_W5_community_posts_user_id
  ON "W5_community_posts" (user_id);
