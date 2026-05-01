-- =====================================================
-- W5 Community App — DB Schema (Supabase PostgreSQL)
-- prefix: W5_community_  (다른 테이블과 충돌 방지)
-- =====================================================

-- 1) 게시글 테이블
DROP TABLE IF EXISTS "W5_community_comments" CASCADE;
DROP TABLE IF EXISTS "W5_community_posts" CASCADE;

CREATE TABLE "W5_community_posts" (
  id          BIGSERIAL PRIMARY KEY,
  nickname    TEXT        NOT NULL DEFAULT '익명',
  category    TEXT        NOT NULL DEFAULT 'free'
              CHECK (category IN ('free','study','food','vent')),
  content     TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  likes       INTEGER     NOT NULL DEFAULT 0 CHECK (likes >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_W5_community_posts_created_at
  ON "W5_community_posts" (created_at DESC);

CREATE INDEX idx_W5_community_posts_category
  ON "W5_community_posts" (category);

-- 2) 댓글 테이블 (선택 — 추후 확장용)
CREATE TABLE "W5_community_comments" (
  id          BIGSERIAL PRIMARY KEY,
  post_id     BIGINT      NOT NULL REFERENCES "W5_community_posts"(id) ON DELETE CASCADE,
  nickname    TEXT        NOT NULL DEFAULT '익명',
  content     TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_W5_community_comments_post_id
  ON "W5_community_comments" (post_id);
