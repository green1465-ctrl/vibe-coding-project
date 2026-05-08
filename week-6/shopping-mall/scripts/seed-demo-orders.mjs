// 일회용: test@example.com 계정에 데모 주문 2건 INSERT
// 결제 플로우가 만들어지기 전에도 마이페이지 검증용 데이터 확보
// 사용: DATABASE_URL=... node scripts/seed-demo-orders.mjs
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
if (!DATABASE_URL) {
  console.error('DATABASE_URL 이 설정되어 있지 않습니다');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const TARGET_EMAIL = 'test@example.com';

// 주문 1: 베이직 화이트 티셔츠 × 2 + 캔버스 스니커즈 × 1
// 주문 2: 가죽 크로스백 × 1 + 울 블렌드 카디건 × 1
const DEMO_ORDERS = [
  {
    daysAgo: 7,
    items: [
      { product_id: 1, quantity: 2 },
      { product_id: 3, quantity: 1 },
    ],
  },
  {
    daysAgo: 2,
    items: [
      { product_id: 4, quantity: 1 },
      { product_id: 5, quantity: 1 },
    ],
  },
];

async function main() {
  const client = await pool.connect();
  try {
    // 대상 사용자
    const userRes = await client.query(
      `SELECT id, email FROM "W5_users" WHERE email = $1`,
      [TARGET_EMAIL]
    );
    if (userRes.rows.length === 0) {
      console.error(`${TARGET_EMAIL} 계정이 없습니다 — 먼저 가입하세요`);
      process.exit(1);
    }
    const userId = Number(userRes.rows[0].id);
    console.log(`Target user: ${TARGET_EMAIL} (id=${userId})`);

    for (const o of DEMO_ORDERS) {
      // 상품 가격/이름 스냅샷
      const ids = o.items.map((it) => it.product_id);
      const prodRes = await client.query(
        `SELECT id, name, price, image_url FROM "W5_products" WHERE id = ANY($1)`,
        [ids]
      );
      const prodMap = new Map(prodRes.rows.map((p) => [Number(p.id), p]));

      const lineItems = o.items.map((it) => {
        const p = prodMap.get(it.product_id);
        if (!p) throw new Error(`product ${it.product_id} not found`);
        return {
          product_id: Number(p.id),
          product_name: p.name,
          price: p.price,
          image_url: p.image_url,
          quantity: it.quantity,
          subtotal: p.price * it.quantity,
        };
      });
      const total = lineItems.reduce((s, it) => s + it.subtotal, 0);

      await client.query('BEGIN');
      try {
        // 1) 주문 인서트 (created_at 을 과거로 셋)
        const orderInsert = await client.query(
          `INSERT INTO "W5_orders" (user_id, order_number, total, status, created_at)
           VALUES ($1, '__pending__', $2, 'paid', NOW() - ($3 || ' days')::interval)
           RETURNING id, created_at`,
          [userId, total, String(o.daysAgo)]
        );
        const orderId = Number(orderInsert.rows[0].id);

        // 2) order_number 를 'ORD-{6자리 zero-pad}' 로 업데이트
        const orderNumber = 'ORD-' + String(orderId).padStart(6, '0');
        await client.query(
          `UPDATE "W5_orders" SET order_number = $1 WHERE id = $2`,
          [orderNumber, orderId]
        );

        // 3) 라인 아이템 인서트
        for (const li of lineItems) {
          await client.query(
            `INSERT INTO "W5_order_items"
             (order_id, product_id, product_name, price, image_url, quantity, subtotal)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              orderId,
              li.product_id,
              li.product_name,
              li.price,
              li.image_url,
              li.quantity,
              li.subtotal,
            ]
          );
        }

        await client.query('COMMIT');
        console.log(
          `  ✓ ${orderNumber} | ${o.daysAgo}일 전 | ₩${total.toLocaleString()} | ${lineItems.length}품목`
        );
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('\nDone.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
