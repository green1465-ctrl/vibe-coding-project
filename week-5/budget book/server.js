// 가계부 (Budget Book) - Express + Supabase Postgres
// Single-file backend that serves index.html and provides /api/transactions endpoints.

require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// ----------------------------------------------------------------------------
// App + DB initialization
// ----------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[pg] unexpected pool error:', err);
});

const TABLE = '"W5_budget_transactions"';

// ----------------------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const VALID_TYPES = new Set(['수입', '지출']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// pg returns DATE as a JS Date in local time. Normalize to YYYY-MM-DD string
// so the client never has to worry about timezone shifts.
function rowToTransaction(row) {
  let dateStr;
  if (row.date instanceof Date) {
    const y = row.date.getFullYear();
    const m = String(row.date.getMonth() + 1).padStart(2, '0');
    const d = String(row.date.getDate()).padStart(2, '0');
    dateStr = `${y}-${m}-${d}`;
  } else if (typeof row.date === 'string') {
    // Already 'YYYY-MM-DD' or ISO — keep just the date part.
    dateStr = row.date.slice(0, 10);
  } else {
    dateStr = String(row.date);
  }
  return {
    id: Number(row.id),
    type: row.type,
    category: row.category,
    amount: Number(row.amount),
    memo: row.memo,
    date: dateStr,
    created_at: row.created_at,
  };
}

// ----------------------------------------------------------------------------
// API Routes
// ----------------------------------------------------------------------------

// GET /api/transactions  (optional ?year=YYYY&month=M)
app.get('/api/transactions', async (req, res) => {
  try {
    const { year, month } = req.query;
    let result;
    if (year && month) {
      const y = Number(year);
      const m = Number(month);
      if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
        return res.status(400).json({ error: 'Invalid year or month' });
      }
      result = await pool.query(
        `SELECT id, type, category, amount, memo, date, created_at
         FROM ${TABLE}
         WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2
         ORDER BY date DESC, id DESC`,
        [y, m]
      );
    } else {
      result = await pool.query(
        `SELECT id, type, category, amount, memo, date, created_at
         FROM ${TABLE}
         ORDER BY date DESC, id DESC`
      );
    }
    res.json({ transactions: result.rows.map(rowToTransaction) });
  } catch (err) {
    console.error('[GET /api/transactions]', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET /api/transactions/summary?year=YYYY&month=M
// Note: this MUST be defined before '/api/transactions/:id' so Express doesn't
// try to interpret 'summary' as an id.
app.get('/api/transactions/summary', async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: 'year and month query params are required' });
    }
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const totalsQ = pool.query(
      `SELECT type, COALESCE(SUM(amount), 0)::bigint AS total
       FROM ${TABLE}
       WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2
       GROUP BY type`,
      [y, m]
    );
    const byCatQ = pool.query(
      `SELECT category, type, COALESCE(SUM(amount), 0)::bigint AS total
       FROM ${TABLE}
       WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2
       GROUP BY category, type
       ORDER BY total DESC`,
      [y, m]
    );

    const [totalsRes, byCatRes] = await Promise.all([totalsQ, byCatQ]);

    let income = 0;
    let expense = 0;
    for (const row of totalsRes.rows) {
      if (row.type === '수입') income = Number(row.total);
      else if (row.type === '지출') expense = Number(row.total);
    }
    const byCategory = byCatRes.rows.map((r) => ({
      category: r.category,
      type: r.type,
      total: Number(r.total),
    }));

    res.json({ income, expense, balance: income - expense, byCategory });
  } catch (err) {
    console.error('[GET /api/transactions/summary]', err);
    res.status(500).json({ error: 'Failed to compute summary' });
  }
});

// POST /api/transactions
app.post('/api/transactions', async (req, res) => {
  try {
    const body = req.body || {};
    const type = body.type;
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const amount = Number(body.amount);
    const memo = body.memo == null ? null : String(body.memo).trim() || null;
    const date = body.date ? String(body.date) : todayISO();

    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({ error: "type must be '수입' or '지출'" });
    }
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }
    if (!DATE_RE.test(date)) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    const result = await pool.query(
      `INSERT INTO ${TABLE} (type, category, amount, memo, date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, category, amount, memo, date, created_at`,
      [type, category, amount, memo, date]
    );
    res.status(201).json({ transaction: rowToTransaction(result.rows[0]) });
  } catch (err) {
    console.error('[POST /api/transactions]', err);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// DELETE /api/transactions  (delete all)
app.delete('/api/transactions', async (_req, res) => {
  try {
    const result = await pool.query(`DELETE FROM ${TABLE}`);
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error('[DELETE /api/transactions]', err);
    res.status(500).json({ error: 'Failed to delete all transactions' });
  }
});

// DELETE /api/transactions/:id
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const result = await pool.query(
      `DELETE FROM ${TABLE} WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/transactions/:id]', err);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// ----------------------------------------------------------------------------
// Final error handler (defense in depth)
// ----------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ----------------------------------------------------------------------------
// Local + serverless dual-mode startup
// ----------------------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🟢 Budget Book server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
