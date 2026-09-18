-- (주)네오콘크리트 — 사이트 편집 내용 보관용 테이블
-- 행 1개(id=1)에 전체 내용을 JSON 문자열로 저장한다. 게시판별 테이블을 나누지 않는 이유는
-- 관리 항목이 적고, 한 번의 [저장]으로 전체를 통째로 덮어쓰는 편이 단순하고 안전하기 때문.
CREATE TABLE IF NOT EXISTS neo_content (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
