// ========================================
// DB 초기화 스크립트
// - Q5_questions, Q5_votes 테이블 생성
// - 인덱스 / 제약조건 설정
// - 12개 밸런스 질문 시드 INSERT
// 실행: npm run setup
// ========================================
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.trim(),
  ssl: { rejectUnauthorized: false },
});

const SEED_QUESTIONS = [
  { id: 'q1',  category: '능력',   order: 1,  a_text: '많이 먹어도 배 안 나오기',     a_emoji: '🍔', a_color: 'rose',    b_text: '여름에 땀 안 나기',             b_emoji: '☀️', b_color: 'sky' },
  { id: 'q2',  category: '음식',   order: 2,  a_text: '평생 치킨만 먹기',              a_emoji: '🍗', a_color: 'amber',   b_text: '평생 피자만 먹기',              b_emoji: '🍕', b_color: 'red' },
  { id: 'q3',  category: '초능력', order: 3,  a_text: '시간을 멈출 수 있는 능력',      a_emoji: '⏸️', a_color: 'indigo',  b_text: '시간을 되돌릴 수 있는 능력',    b_emoji: '⏪', b_color: 'fuchsia' },
  { id: 'q4',  category: '초능력', order: 4,  a_text: '하늘을 날 수 있다',             a_emoji: '🦅', a_color: 'cyan',    b_text: '순간이동 할 수 있다',           b_emoji: '✨', b_color: 'violet' },
  { id: 'q5',  category: '초능력', order: 5,  a_text: '사람의 마음을 읽기',            a_emoji: '🧠', a_color: 'pink',    b_text: '미래를 미리 보기',              b_emoji: '🔮', b_color: 'purple' },
  { id: 'q6',  category: '일상',   order: 6,  a_text: '평생 여름만 있는 나라',         a_emoji: '🏖️', a_color: 'orange',  b_text: '평생 겨울만 있는 나라',         b_emoji: '❄️', b_color: 'blue' },
  { id: 'q7',  category: '돈',     order: 7,  a_text: '월급 500, 주 5일 근무',         a_emoji: '💼', a_color: 'emerald', b_text: '월급 1000, 주 7일 근무',        b_emoji: '💰', b_color: 'yellow' },
  { id: 'q8',  category: '연애',   order: 8,  a_text: '잘생긴/예쁜데 성격 별로',       a_emoji: '😎', a_color: 'rose',    b_text: '평범한데 성격 최고',            b_emoji: '🥰', b_color: 'teal' },
  { id: 'q9',  category: '여행',   order: 9,  a_text: '평생 한 도시에서만 살기',       a_emoji: '🏙️', a_color: 'slate',   b_text: '매년 강제로 이사 가기',         b_emoji: '🧳', b_color: 'lime' },
  { id: 'q10', category: '취향',   order: 10, a_text: '여름 휴가지로 산 가기',         a_emoji: '⛰️', a_color: 'green',   b_text: '여름 휴가지로 바다 가기',       b_emoji: '🌊', b_color: 'sky' },
  { id: 'q11', category: '능력',   order: 11, a_text: '하루 3시간만 자도 안 피곤',     a_emoji: '😴', a_color: 'indigo',  b_text: '먹은 만큼 무조건 안 살찜',      b_emoji: '🍰', b_color: 'pink' },
  { id: 'q12', category: '엉뚱',   order: 12, a_text: '말할 때 끝마다 "냥" 붙이기',    a_emoji: '🐱', a_color: 'orange',  b_text: '말할 때 끝마다 "멍" 붙이기',    b_emoji: '🐶', b_color: 'amber' },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('▶ DB 연결 성공. 테이블 생성 시작...');

    // 1) 질문 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Q5_questions" (
        id              TEXT        PRIMARY KEY,
        category        TEXT        NOT NULL,
        option_a_text   TEXT        NOT NULL,
        option_a_emoji  TEXT        NOT NULL DEFAULT '',
        option_a_color  TEXT        NOT NULL DEFAULT 'rose',
        option_b_text   TEXT        NOT NULL,
        option_b_emoji  TEXT        NOT NULL DEFAULT '',
        option_b_color  TEXT        NOT NULL DEFAULT 'sky',
        display_order   INTEGER     NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log('  ✓ Q5_questions 생성');

    // 2) 투표 테이블 (한 voter 가 한 질문에 1표만 → UNIQUE)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Q5_votes" (
        id           BIGSERIAL    PRIMARY KEY,
        question_id  TEXT         NOT NULL REFERENCES "Q5_questions"(id) ON DELETE CASCADE,
        choice       CHAR(1)      NOT NULL CHECK (choice IN ('A','B')),
        voter_id     TEXT         NOT NULL,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        UNIQUE (question_id, voter_id)
      );
    `);
    console.log('  ✓ Q5_votes 생성');

    // 3) 인덱스 (집계 쿼리 가속)
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_Q5_votes_question" ON "Q5_votes"(question_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_Q5_votes_voter"    ON "Q5_votes"(voter_id);`);
    console.log('  ✓ 인덱스 생성');

    // 4) 시드 질문 UPSERT
    let inserted = 0;
    for (const q of SEED_QUESTIONS) {
      const result = await client.query(
        `INSERT INTO "Q5_questions"
           (id, category, option_a_text, option_a_emoji, option_a_color,
                          option_b_text, option_b_emoji, option_b_color, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           category       = EXCLUDED.category,
           option_a_text  = EXCLUDED.option_a_text,
           option_a_emoji = EXCLUDED.option_a_emoji,
           option_a_color = EXCLUDED.option_a_color,
           option_b_text  = EXCLUDED.option_b_text,
           option_b_emoji = EXCLUDED.option_b_emoji,
           option_b_color = EXCLUDED.option_b_color,
           display_order  = EXCLUDED.display_order
         RETURNING id;`,
        [q.id, q.category, q.a_text, q.a_emoji, q.a_color, q.b_text, q.b_emoji, q.b_color, q.order]
      );
      if (result.rowCount > 0) inserted++;
    }
    console.log(`  ✓ 질문 ${inserted}개 시드(upsert) 완료`);

    // 5) 검증
    const countQ = await client.query(`SELECT COUNT(*)::int AS n FROM "Q5_questions";`);
    const countV = await client.query(`SELECT COUNT(*)::int AS n FROM "Q5_votes";`);
    console.log(`▶ 현재 상태 → 질문: ${countQ.rows[0].n}건, 투표: ${countV.rows[0].n}건`);
    console.log('✅ 모든 셋업 완료');
  } catch (err) {
    console.error('❌ 셋업 실패:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
