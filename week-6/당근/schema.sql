-- ============================================================
-- 당근마켓 클론 DB 스키마 (week-6)
-- 모든 테이블은 W6_karrot_ 프리픽스 → 다른 주차/프로젝트 테이블과 충돌 없음
-- 실행 위치: Supabase SQL Editor
-- ============================================================

-- 0. UUID 확장 (Supabase는 기본 활성화되어 있지만 안전하게)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 1. 사용자 (이메일/비밀번호 + JWT)
-- ============================================================
CREATE TABLE IF NOT EXISTS "W6_karrot_users" (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT         UNIQUE NOT NULL,
  password_hash   TEXT         NOT NULL,            -- bcrypt 해시 (절대 평문 금지)
  nickname        TEXT         NOT NULL,
  region          TEXT         NOT NULL,            -- 동네 (예: '역삼동')
  manner_temp     NUMERIC(4,1) NOT NULL DEFAULT 36.5,
  profile_image_url TEXT,                           -- ImageKit URL (선택)
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_w6_users_email ON "W6_karrot_users"(email);


-- ============================================================
-- 2. 상품
-- ============================================================
CREATE TABLE IF NOT EXISTS "W6_karrot_products" (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    UUID        NOT NULL REFERENCES "W6_karrot_users"(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  price        INTEGER     NOT NULL DEFAULT 0,      -- 0 = 나눔
  category     TEXT        NOT NULL,
  description  TEXT        NOT NULL,
  region       TEXT        NOT NULL,                -- 거래 동네 (등록 당시 판매자 동네 스냅샷)
  status       TEXT        NOT NULL DEFAULT 'selling'
                CHECK (status IN ('selling','reserved','sold')),
  view_count   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_w6_products_seller    ON "W6_karrot_products"(seller_id);
CREATE INDEX IF NOT EXISTS idx_w6_products_region    ON "W6_karrot_products"(region);
CREATE INDEX IF NOT EXISTS idx_w6_products_created   ON "W6_karrot_products"(created_at DESC);
-- 키워드 검색용 (제목+설명 trigram)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_w6_products_title_trgm
  ON "W6_karrot_products" USING gin (title gin_trgm_ops);


-- ============================================================
-- 3. 상품 이미지 (1:N, 최대 3장은 앱에서 검증)
-- ImageKit 업로드 후 URL/fileId를 저장
-- ============================================================
CREATE TABLE IF NOT EXISTS "W6_karrot_product_images" (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID        NOT NULL REFERENCES "W6_karrot_products"(id) ON DELETE CASCADE,
  image_url          TEXT        NOT NULL,         -- ImageKit CDN URL
  imagekit_file_id   TEXT,                         -- 삭제 시 ImageKit API 호출용
  sort_order         SMALLINT    NOT NULL DEFAULT 0, -- 0,1,2 (슬라이더 순서)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_w6_images_product
  ON "W6_karrot_product_images"(product_id, sort_order);


-- ============================================================
-- 4. 관심(♥) — 한 사람이 같은 상품 두 번 못 찜하게 UNIQUE
-- ============================================================
CREATE TABLE IF NOT EXISTS "W6_karrot_likes" (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES "W6_karrot_users"(id) ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES "W6_karrot_products"(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_w6_likes_user    ON "W6_karrot_likes"(user_id);
CREATE INDEX IF NOT EXISTS idx_w6_likes_product ON "W6_karrot_likes"(product_id);


-- ============================================================
-- 5. 채팅방 (1:1 — 같은 상품에 대한 buyer↔seller 조합 1개)
-- ============================================================
CREATE TABLE IF NOT EXISTS "W6_karrot_chat_rooms" (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES "W6_karrot_products"(id) ON DELETE CASCADE,
  buyer_id        UUID        NOT NULL REFERENCES "W6_karrot_users"(id) ON DELETE CASCADE,
  seller_id       UUID        NOT NULL REFERENCES "W6_karrot_users"(id) ON DELETE CASCADE,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, buyer_id),                   -- 같은 상품·같은 구매자 = 방 하나
  CHECK (buyer_id <> seller_id)                    -- 본인이 본인한테 채팅 금지
);

CREATE INDEX IF NOT EXISTS idx_w6_rooms_buyer  ON "W6_karrot_chat_rooms"(buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_w6_rooms_seller ON "W6_karrot_chat_rooms"(seller_id, last_message_at DESC);


-- ============================================================
-- 6. 메시지
-- ============================================================
CREATE TABLE IF NOT EXISTS "W6_karrot_messages" (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID        NOT NULL REFERENCES "W6_karrot_chat_rooms"(id) ON DELETE CASCADE,
  sender_id   UUID        NOT NULL REFERENCES "W6_karrot_users"(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_w6_messages_room
  ON "W6_karrot_messages"(room_id, created_at);


-- ============================================================
-- 7. updated_at 자동 갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION w6_karrot_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_w6_users_updated    ON "W6_karrot_users";
CREATE TRIGGER trg_w6_users_updated    BEFORE UPDATE ON "W6_karrot_users"
  FOR EACH ROW EXECUTE FUNCTION w6_karrot_set_updated_at();

DROP TRIGGER IF EXISTS trg_w6_products_updated ON "W6_karrot_products";
CREATE TRIGGER trg_w6_products_updated BEFORE UPDATE ON "W6_karrot_products"
  FOR EACH ROW EXECUTE FUNCTION w6_karrot_set_updated_at();
