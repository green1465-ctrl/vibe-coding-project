-- =====================================================
-- W5 Community — Add title column to posts
-- 1) title 컬럼 추가 (nullable로 먼저)
-- 2) 기존 14개 legacy 글에 content 첫 부분으로 backfill
-- 3) NOT NULL 제약 추가
-- =====================================================

-- 1)
ALTER TABLE "W5_community_posts"
  ADD COLUMN IF NOT EXISTS title TEXT;

-- 2) legacy 글 backfill (이미 채워진 행은 건드리지 않음)
UPDATE "W5_community_posts"
SET title =
  CASE
    WHEN char_length(content) <= 40 THEN content
    ELSE substring(content from 1 for 40) || '...'
  END
WHERE title IS NULL;

-- 3) NOT NULL + 길이 제약 (1~80)
ALTER TABLE "W5_community_posts"
  ALTER COLUMN title SET NOT NULL;

-- 기존 CHECK 제약 있으면 무시하고 새로 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'W5_community_posts_title_len_chk'
  ) THEN
    ALTER TABLE "W5_community_posts"
      ADD CONSTRAINT "W5_community_posts_title_len_chk"
      CHECK (char_length(title) BETWEEN 1 AND 80);
  END IF;
END $$;
