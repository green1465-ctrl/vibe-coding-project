-- 가계부 앱 (Budget Book) 테이블 스키마
-- Supabase PostgreSQL

CREATE TABLE IF NOT EXISTS "W5_budget_transactions" (
  id          BIGSERIAL PRIMARY KEY,
  type        VARCHAR(10) NOT NULL CHECK (type IN ('수입', '지출')),
  category    VARCHAR(50) NOT NULL,
  amount      BIGINT      NOT NULL CHECK (amount >= 0),
  memo        TEXT,
  date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "W5_budget_transactions_date_idx"
  ON "W5_budget_transactions" (date DESC);

CREATE INDEX IF NOT EXISTS "W5_budget_transactions_category_idx"
  ON "W5_budget_transactions" (category);


-- 샘플 데이터
INSERT INTO "W5_budget_transactions" (type, category, amount, memo, date) VALUES
  ('수입', '월급',     3200000, '5월 월급',         '2026-05-01'),
  ('지출', '주거',      850000, '월세',             '2026-05-01'),
  ('지출', '구독료',     17000, '넷플릭스',         '2026-05-02'),
  ('지출', '식비',       28500, '점심 김치찌개',    '2026-05-03'),
  ('지출', '교통',        3200, '지하철',           '2026-05-03'),
  ('지출', '경조사',    100000, '친구 결혼식',      '2026-05-04');


-- 카테고리별 합계 조회 예시 (GROUP BY)
-- SELECT category, SUM(amount) AS total
-- FROM "W5_budget_transactions"
-- WHERE type = '지출'
--   AND date >= DATE_TRUNC('month', CURRENT_DATE)
--   AND date <  DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
-- GROUP BY category
-- ORDER BY total DESC;
