-- W6 콘텐츠 잠금 해제 앱 스키마
-- 기존 W5_*, Q5_* 테이블과 충돌 방지를 위해 W6_unlock_* 프리픽스 사용

CREATE TABLE IF NOT EXISTS "W6_unlock_users" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "W6_unlock_contents" (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  category     TEXT,
  author       TEXT,
  price        INTEGER NOT NULL DEFAULT 0,
  is_premium   BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "W6_unlock_purchases" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES "W6_unlock_users"(id) ON DELETE CASCADE,
  content_id    TEXT NOT NULL REFERENCES "W6_unlock_contents"(id),
  order_id      TEXT UNIQUE NOT NULL,
  payment_key   TEXT UNIQUE NOT NULL,
  amount        INTEGER NOT NULL,
  method        TEXT,
  card_brand    TEXT,
  card_last4    CHAR(4),
  status        TEXT NOT NULL CHECK (status IN ('paid','canceled','failed')),
  raw_response  JSONB,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 유저가 같은 콘텐츠를 두 번 paid 로 가질 수 없게
CREATE UNIQUE INDEX IF NOT EXISTS uq_w6_unlock_purchases_user_content_paid
  ON "W6_unlock_purchases"(user_id, content_id) WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_w6_unlock_purchases_user
  ON "W6_unlock_purchases"(user_id, created_at DESC);
