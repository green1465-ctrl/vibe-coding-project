-- ============================================================
-- Q6 익명 연봉 지출 비교 - 스키마
-- 다른 테이블과 충돌 방지를 위해 모든 테이블 이름 앞에 Q6_ 접두사
-- ============================================================

-- 메인 테이블: 익명 제출 1건 = 1행
-- 카테고리별 지출은 컬럼 분할 (AVG, GROUP BY 쿼리 효율)
CREATE TABLE IF NOT EXISTS "Q6_salary_submissions" (
  id                    BIGSERIAL PRIMARY KEY,

  -- 프로필 (직군 / 연차)
  job                   TEXT     NOT NULL,
  level                 TEXT     NOT NULL,

  -- 월급 (만원, 세후 실수령액)
  salary                INTEGER  NOT NULL CHECK (salary >= 0 AND salary < 100000),

  -- 카테고리별 월 지출 (만원)
  expense_food          INTEGER  NOT NULL DEFAULT 0 CHECK (expense_food >= 0),
  expense_housing       INTEGER  NOT NULL DEFAULT 0 CHECK (expense_housing >= 0),
  expense_transport     INTEGER  NOT NULL DEFAULT 0 CHECK (expense_transport >= 0),
  expense_subscription  INTEGER  NOT NULL DEFAULT 0 CHECK (expense_subscription >= 0),
  expense_shopping      INTEGER  NOT NULL DEFAULT 0 CHECK (expense_shopping >= 0),
  expense_culture       INTEGER  NOT NULL DEFAULT 0 CHECK (expense_culture >= 0),
  expense_savings       INTEGER  NOT NULL DEFAULT 0 CHECK (expense_savings >= 0),
  expense_etc           INTEGER  NOT NULL DEFAULT 0 CHECK (expense_etc >= 0),

  -- 총 지출 (생성 시점에 서버에서 합산해서 저장 → 정렬/필터 빠르게)
  total_expense         INTEGER  NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 통계 쿼리 가속용 인덱스 (job, level 조합으로 GROUP BY/WHERE 자주 함)
CREATE INDEX IF NOT EXISTS "Q6_salary_submissions_job_level_idx"
  ON "Q6_salary_submissions" (job, level);

CREATE INDEX IF NOT EXISTS "Q6_salary_submissions_created_at_idx"
  ON "Q6_salary_submissions" (created_at DESC);
