-- ============================================
-- W5_products: 상품목록 테이블
-- 컬럼: 상품명 / 가격 / 이미지 / 간단한 설명
-- ============================================

DROP TABLE IF EXISTS "W5_products";

CREATE TABLE "W5_products" (
  id          BIGSERIAL    PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,                       -- 상품명
  price       INTEGER      NOT NULL CHECK (price >= 0),    -- 가격 (원)
  image_url   TEXT,                                        -- 이미지 URL
  description TEXT,                                        -- 간단한 설명
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_w5_products_price      ON "W5_products" (price);
CREATE INDEX idx_w5_products_created_at ON "W5_products" (created_at DESC);

-- ============================================
-- 샘플 데이터 5건 (의류/잡화 컨셉)
-- 이미지는 picsum.photos 시드 URL 사용
-- ============================================

INSERT INTO "W5_products" (name, price, image_url, description) VALUES
  ('베이직 화이트 티셔츠',
   19900,
   'https://picsum.photos/seed/white-tee/600/600',
   '편안한 핏의 100% 코튼 반팔 티셔츠. 데일리 룩에 부담 없이 매치하기 좋은 화이트 컬러.'),

  ('데님 와이드 팬츠',
   49000,
   'https://picsum.photos/seed/denim-pants/600/600',
   '미디엄 워싱의 와이드 핏 데님. 적당한 두께감과 편안한 허리 밴딩이 특징.'),

  ('캔버스 스니커즈',
   59000,
   'https://picsum.photos/seed/canvas-shoes/600/600',
   '클래식한 디자인의 로우탑 캔버스 스니커즈. 어떤 옷에도 잘 어울리는 베이직 아이템.'),

  ('가죽 크로스백',
   89000,
   'https://picsum.photos/seed/leather-bag/600/600',
   '소가죽 미니 크로스백. 핸드폰 + 카드지갑이 딱 들어가는 사이즈, 길이 조절 스트랩.'),

  ('울 블렌드 카디건',
   39000,
   'https://picsum.photos/seed/wool-cardigan/600/600',
   '봄/가을 간절기용 울 30% 블렌드 카디건. 단추 5개의 V넥 라인.');
