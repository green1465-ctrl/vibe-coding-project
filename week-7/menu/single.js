// === Imports ===
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');

// Week 2/3/5 실제 구현용
const { OpenAI } = require('openai');
const { chromium } = require('playwright');
const archiver = require('archiver');
const ImageKit = require('imagekit');

// === Constants ===
const app = express();
const PORT = process.env.PORT || 3000;

const CLIENTS_PATH = path.join(__dirname, 'data', 'clients.json');
const CAMPAIGNS_PATH = path.join(__dirname, 'data', 'campaigns.json');
const SLIDES_DIR = path.join(__dirname, 'slides');
const SLIDE_TEMPLATE = path.join(__dirname, 'slide-template.html');

// === Env (trim trailing newline) ===
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const FAL_KEY = (process.env.FAL_KEY || '').trim();

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// ImageKit — 메뉴 이미지 업로드용 (frontend가 직접 업로드, 백엔드는 인증 토큰만 발급)
const IMAGEKIT_PUBLIC_KEY = (process.env.IMAGEKIT_PUBLIC_KEY || '').trim();
const IMAGEKIT_PRIVATE_KEY = (process.env.IMAGEKIT_PRIVATE_KEY || '').trim();
const IMAGEKIT_URL_ENDPOINT = (process.env.IMAGEKIT_URL_ENDPOINT || '').trim();
const imagekit =
  IMAGEKIT_PUBLIC_KEY && IMAGEKIT_PRIVATE_KEY && IMAGEKIT_URL_ENDPOINT
    ? new ImageKit({
        publicKey: IMAGEKIT_PUBLIC_KEY,
        privateKey: IMAGEKIT_PRIVATE_KEY,
        urlEndpoint: IMAGEKIT_URL_ENDPOINT,
      })
    : null;

// === Auth (site password gate) ===
const SITE_PASSWORD = (process.env.SITE_PASSWORD || '').trim();
const AUTH_SECRET = (process.env.AUTH_SECRET || '').trim() || 'dev-fallback-secret-change-me';
const AUTH_COOKIE = 'menu_auth';
const AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const AUTH_ENABLED = SITE_PASSWORD.length > 0;

function signToken(expiresAt) {
  const payload = String(expiresAt);
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  if (sig.length !== expectedSig.length) return false;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) return false;
  } catch { return false; }
  const expiresAt = parseInt(payload, 10);
  if (!expiresAt || Date.now() > expiresAt) return false;
  return true;
}
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}
function isAuthed(req) {
  if (!AUTH_ENABLED) return true; // 비밀번호 미설정 시 게이트 비활성
  const cookies = parseCookies(req);
  return verifyToken(cookies[AUTH_COOKIE]);
}
function setAuthCookie(res) {
  const expiresAt = Date.now() + AUTH_TTL_MS;
  const token = signToken(expiresAt);
  const cookie = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    `Max-Age=${Math.floor(AUTH_TTL_MS / 1000)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
}
function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`
  );
}

// === Middleware ===
app.use(express.json({ limit: '2mb' }));

// 인증 미들웨어 — /api/* 보호 (login·logout·me·health는 공개).
// 정적 파일/슬라이드는 그대로 노출 (UI 게이트로 충분).
const PUBLIC_API = new Set(['/api/login', '/api/logout', '/api/me', '/api/health']);
app.use((req, res, next) => {
  if (!AUTH_ENABLED) return next();
  if (!req.path.startsWith('/api/')) return next();
  if (PUBLIC_API.has(req.path)) return next();
  if (isAuthed(req)) return next();
  res.status(401).json({ ok: false, message: 'auth required' });
});

// === Auth routes ===
app.post('/api/login', (req, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ ok: true, message: 'auth disabled (SITE_PASSWORD not set)' });
  }
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ ok: false, message: 'password required' });
  }
  // timingSafeEqual로 비교
  const a = Buffer.from(password);
  const b = Buffer.from(SITE_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, message: '비밀번호가 올바르지 않습니다' });
  }
  setAuthCookie(res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({
    auth_required: AUTH_ENABLED,
    authed: isAuthed(req),
  });
});

app.use(express.static(__dirname));
app.use('/slides', express.static(SLIDES_DIR));

// === Slides folder bootstrap ===
async function ensureSlidesDir() {
  await fs.mkdir(SLIDES_DIR, { recursive: true });
}

// === Helpers: data file I/O ===

async function readClients() {
  const raw = await fs.readFile(CLIENTS_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeClients(arr) {
  await fs.writeFile(CLIENTS_PATH, JSON.stringify(arr, null, 2), 'utf-8');
}

async function readCampaigns() {
  const raw = await fs.readFile(CAMPAIGNS_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeCampaigns(arr) {
  await fs.writeFile(CAMPAIGNS_PATH, JSON.stringify(arr, null, 2), 'utf-8');
}

// 특정 month의 campaign + 해당 client의 item을 안전하게 읽고 갱신하는 헬퍼
async function upsertCampaignItem(month, clientId, patch) {
  const campaigns = await readCampaigns();
  let campaign = campaigns.find((c) => c.month === month);
  if (!campaign) {
    campaign = { id: month, month, collected_at: new Date().toISOString(), trends: {}, items: [] };
    campaigns.push(campaign);
  }
  if (!Array.isArray(campaign.items)) campaign.items = [];
  let item = campaign.items.find((i) => i.client_id === clientId);
  if (!item) {
    item = { client_id: clientId };
    campaign.items.push(item);
  }
  Object.assign(item, patch);
  await writeCampaigns(campaigns);
  return item;
}

// === Helpers: mock data generators (fallback용 — 보존) ===

/**
 * 업종별 mock 트렌드.
 * Week 4에 Playwright로 ahatrend / foodbank / atfis 실제 스크래핑으로 교체 예정.
 */
// TODO: replace with Playwright scraping (Week 4)
function generateMockTrends(_month) {
  return {
    한식: [
      {
        title: '마이 헬시 다이닝, 한식의 균형 잡힌 한 상이 뜬다',
        summary:
          '저염·저당을 지향하는 "마이 헬시 다이닝" 흐름이 확산되며, 나물·발효식품 중심의 한정식이 건강식 카테고리로 재조명되고 있다.',
        source_url: 'https://www.ahatrend.com/trend/korean-healthy-dining-2026',
        source_name: 'ahatrend',
      },
      {
        title: '한 그릇 음식 부활 — 비빔밥·국밥의 프리미엄화',
        summary:
          '1인 가구 증가와 빠른 식사 수요가 맞물리며 한 그릇 음식이 다시 떠오른다. 단순한 백반이 아닌 "프리미엄 한 그릇" 포지셔닝이 핵심.',
        source_url: 'https://www.foodbank.co.kr/news/2026-05-onebowl',
        source_name: 'foodbank',
      },
      {
        title: '발효·전통주 페어링, 한식의 미식 가치 재발견',
        summary:
          '막걸리·약주 등 전통주와 한식 메뉴를 함께 큐레이션한 페어링 코스가 2030 세대 사이에서 인기를 끌고 있다.',
        source_url: 'https://www.atfis.or.kr/report/2026/korean-pairing',
        source_name: 'atfis',
      },
    ],
    분식: [
      {
        title: '매운맛 4.0 — "기분 좋은 매움"의 시대',
        summary:
          '극강의 매운맛에서 한 단계 진화한, 향과 감칠맛이 공존하는 "기분 좋은 매움"이 떡볶이·라볶이 신메뉴를 주도한다.',
        source_url: 'https://www.ahatrend.com/trend/spicy-4-0-bunsik',
        source_name: 'ahatrend',
      },
      {
        title: '분식의 가성비 + 가심비 양극화',
        summary:
          '3,000원대 가성비 떡볶이와 1만 원대 프리미엄 분식 다이닝이 동시에 성장. 중간 가격대가 가장 빠르게 퇴출되는 중.',
        source_url: 'https://www.foodbank.co.kr/news/2026-05-bunsik-polarization',
        source_name: 'foodbank',
      },
      {
        title: '추억 분식의 SNS 리바이벌',
        summary:
          '학교 앞 옛날 떡볶이·쫀드기·아폴로 같은 추억의 분식이 2030 SNS에서 재유행. 노스탤지어 마케팅이 핵심 키워드.',
        source_url: 'https://www.atfis.or.kr/report/2026/retro-bunsik',
        source_name: 'atfis',
      },
    ],
    카페: [
      {
        title: '시즌 음료의 주인공이 된 "허브 라떼"',
        summary:
          '라벤더·로즈마리·바질을 활용한 허브 라떼가 봄·초여름 시즌 메뉴를 장악. 디카페인 수요와 맞물려 더 빠르게 성장 중.',
        source_url: 'https://www.ahatrend.com/trend/herb-latte-2026',
        source_name: 'ahatrend',
      },
      {
        title: '디저트 카페의 "한입 디저트" 트렌드',
        summary:
          '한 조각 케이크 대신 손가락 두 마디 크기의 미니 디저트 3~4종을 한 접시에 담아내는 포맷이 인스타 친화적 메뉴로 자리잡고 있다.',
        source_url: 'https://www.foodbank.co.kr/news/2026-05-bite-dessert',
        source_name: 'foodbank',
      },
      {
        title: '파인다이닝 vs 스페셜티 — 카페 시장의 양극화',
        summary:
          '저가 커피 체인의 점유율이 굳어진 사이, 1잔 8천 원 이상의 스페셜티 카페가 도심 소형 매장 중심으로 확대.',
        source_url: 'https://www.atfis.or.kr/report/2026/cafe-polarization',
        source_name: 'atfis',
      },
    ],
  };
}

/**
 * Mock 카피 — OpenAI 실패 시 fallback.
 */
function generateMockCopy(client, categoryTrends) {
  const firstTrend =
    Array.isArray(categoryTrends) && categoryTrends.length > 0 ? categoryTrends[0] : null;

  const sourceName = firstTrend ? firstTrend.source_name : 'ahatrend';
  const sourceUrl = firstTrend ? firstTrend.source_url : '';
  const trendTitle = firstTrend ? firstTrend.title : '시즌 트렌드';
  const trendSummary = firstTrend
    ? firstTrend.summary
    : '이번 시즌의 흐름을 한 줄로 정리합니다.';

  const menu1 =
    Array.isArray(client.menu_keywords) && client.menu_keywords[0]
      ? client.menu_keywords[0]
      : '대표 메뉴';
  const menu2 =
    Array.isArray(client.menu_keywords) && client.menu_keywords[1]
      ? client.menu_keywords[1]
      : '시그니처 메뉴';

  let copy;

  // 카테고리별 mock 5메뉴 카탈로그 + 본문 톤
  const catalog = {
    한식: {
      menus: ['비빔밥', '된장찌개', '잡채', '불고기', '갈비탕'],
      bodies: [
        '신선한 채소와 고슬고슬한 밥이 어우러져, 한 그릇으로 봄 기운을 가득 담은 메뉴입니다.',
        '집된장의 구수한 깊이가 마음까지 데워주는, 정성껏 끓여낸 한 그릇.',
        '쫄깃한 면과 향긋한 채소가 어우러져 손님상에 색감을 더하는 잔칫 메뉴.',
        '간장 양념이 배어든 부드러운 고기, 가족 외식 자리에 빠질 수 없는 한 접시.',
        '진하게 우려낸 사골 국물과 부드러운 고기, 든든한 한 끼를 책임지는 따뜻함.',
      ],
    },
    분식: {
      menus: ['로제 떡볶이', '꼬마김밥', '치즈 라볶이', '튀김 모듬', '왕만두'],
      bodies: [
        '크리미한 소스와 매콤한 떡이 어우러진 트렌디한 한 접시.',
        '한 입 크기로 다양한 재료를 즐길 수 있는 SNS 인증샷 단골 메뉴.',
        '쫄깃한 면과 떡, 고소한 치즈가 한 그릇에서 만나는 분식 정석.',
        '바삭함이 살아있는 모둠 튀김, 친구와 나눠 먹기 딱 좋은 양.',
        '두툼한 만두피 속에 가득 찬 풍성한 소, 한 입에 두 입 분 든든함.',
      ],
    },
    카페: {
      menus: ['딸기 라떼', '바질 에이드', '레몬 에이드', '콜드브루', '말차 라떼'],
      bodies: [
        '신선한 딸기와 부드러운 우유가 한 잔에 담겨, 봄 무드를 깨우는 시그니처.',
        '향긋한 바질과 청량한 탄산이 어우러져, 더운 날 기분을 환기시키는 한 잔.',
        '상큼함이 진하게 살아있는 레몬 베이스, 햇살 좋은 오후에 어울리는 음료.',
        '깊은 향과 부드러운 바디감, 천천히 마시는 시간에 가장 잘 어울리는 한 잔.',
        '곱게 거른 말차 파우더의 풍미가 부드러운 우유와 만나, 차분한 무드를 만드는 라떼.',
      ],
    },
  };

  const cat = catalog[client.category] || catalog['한식'];
  const ctxIntro =
    `이번 달의 흐름 "${trendTitle}"을(를) ${client.name}만의 톤으로 풀어낸 시즌 카드뉴스입니다.`;

  // 트렌드 키워드 — categoryTrends의 title에서 짧게 추출
  const trendKws =
    Array.isArray(categoryTrends) && categoryTrends.length > 0
      ? categoryTrends
          .slice(0, 4)
          .map((t) => (t.title || '').replace(/^\[[^\]]+\]\s*/, '').slice(0, 12))
          .filter(Boolean)
      : ['건강 다이닝', '한그릇 식사', '시즌 한정'];

  copy = {
    headline:
      client.category === '카페'
        ? `${client.name}, 이 계절을 한 잔에 담다`
        : client.category === '분식'
        ? `${client.name} — 오늘 진심 맛있다`
        : `${client.name}, 정성 담은 이 달의 한 상`,
    slide2: `${ctxIntro} ${trendSummary}`.slice(0, 110),
    trend_keywords: trendKws.join(', '),
    trend_body: `이번 달 외식 시장은 ${trendKws.slice(0, 2).join(', ')} 같은 흐름이 두드러집니다.`.slice(0, 90),
    cta:
      client.category === '카페'
        ? `이 달, 가족·친구와 함께 ${client.name}에서 오늘의 한 잔을 만나보세요. 예약은 DM으로!`
        : client.category === '분식'
        ? `오늘 ${client.name}에서 친구·가족과 든든한 한 끼! 매장 또는 픽업으로 만나요.`
        : `이 달의 따뜻한 한 끼, ${client.name}에서 가족과 함께 나누세요. 예약은 DM으로 받습니다.`,
    source: sourceUrl || `${sourceName}.com`,
  };

  // 메뉴 3개: 클라이언트 menu_keywords로 우선 채우고, 부족분은 카테고리 catalog로
  const userMenus = (Array.isArray(client.menu_keywords) ? client.menu_keywords : []).filter(Boolean);
  const filled = [];
  const used = new Set();
  const push = (m) => {
    if (!m) return;
    if (used.has(m)) return;
    used.add(m);
    filled.push(m);
  };
  userMenus.forEach(push);
  cat.menus.forEach(push);
  while (filled.length < 3) push(`추천 메뉴 ${filled.length + 1}`);

  for (let i = 0; i < 3; i++) {
    copy[`slide${i + 4}_menu`] = filled[i];
    copy[`slide${i + 4}`] = cat.bodies[i % cat.bodies.length];
  }

  return copy;
}

// === Real trend scraping (Week 4 PoC: foodbank.co.kr live + mock fallback) ===

// 일반 데스크톱 브라우저 UA (봇 차단 회피용)
const SCRAPE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 카테고리별 매칭 키워드 — 사이트의 sc_word 검색이 신뢰할 수 없어
 * 외식 섹션 최신 기사 목록에서 클라이언트측 필터링 후 매칭.
 */
const FOODBANK_KEYWORDS = {
  한식: ['한식', '한정식', '한식당', '백반', '비빔밥', '국밥', '김치', '발효', '전통주', '막걸리', '장(醬)', 'K-푸드'],
  분식: ['분식', '떡볶이', '라볶이', '김밥', '튀김', '순대', '오뎅', '어묵', '쫄면'],
  카페: ['카페', '커피', '라떼', '아메리카노', '디저트', '베이커리', '브런치', '음료', '바리스타', '에스프레소', '콜드브루', '브루잉'],
};

/**
 * foodbank.co.kr 외식 섹션 최신 기사에서 카테고리 매칭되는 기사 추출.
 * view_type=sm 페이지는 list-summary(발췌)도 함께 노출되므로 진짜 요약을 가져옴.
 * 실패 시 [] 반환 — 호출자는 mock으로 보강.
 */
async function scrapeFoodbank(category) {
  const keywords = FOODBANK_KEYWORDS[category] || [category];
  let ctx;
  try {
    const browser = await getBrowser();
    ctx = await browser.newContext({
      userAgent: SCRAPE_UA,
      locale: 'ko-KR',
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();

    // 외식 sub-section (S2N2) 최신 목록 + view_type=sm로 list-summary 노출
    const url =
      'https://www.foodbank.co.kr/news/articleList.html?sc_sub_section_code=S2N2&view_type=sm';
    await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    // 봇 차단/403 페이지 감지
    const bodyText = await page
      .evaluate(() => document.body.innerText.slice(0, 500))
      .catch(() => '');
    if (/접근\s*차단|차단되었|403\s*Forbidden|blocked/i.test(bodyText)) {
      console.warn('[scrapeFoodbank]', category, 'blocked — skip');
      return [];
    }

    const items = await page.evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll('section.article-list-content .list-block')
      );
      return blocks
        .map((block) => {
          const titleA = block.querySelector('.list-titles a[href*="articleView"]');
          const summaryA = block.querySelector('p.list-summary a');
          const datedEl = block.querySelector('.list-dated');
          if (!titleA) return null;
          const title = (titleA.textContent || '').trim();
          const href = titleA.getAttribute('href') || '';
          const summary = summaryA ? (summaryA.textContent || '').trim() : '';
          const dated = datedEl ? (datedEl.textContent || '').trim() : '';
          if (!title || !href) return null;
          return { title, href, summary, dated };
        })
        .filter(Boolean);
    });

    // 카테고리 키워드 매칭 (title 또는 summary에 포함)
    const matched = items.filter((it) => {
      const hay = (it.title + ' ' + it.summary).toLowerCase();
      return keywords.some((kw) => hay.includes(kw.toLowerCase()));
    });

    // 매칭 결과가 비면 외식 섹션 일반 기사를 카테고리 컨텍스트로 1개만 사용 (다양성 확보)
    const pool = matched.length > 0 ? matched : items.slice(0, 1);

    const top = pool.slice(0, 3).map((it) => ({
      title: it.title,
      summary: it.summary
        ? // 너무 긴 발췌는 자르고, 시즌 컨텍스트 한 줄 덧붙임
          (it.summary.length > 180 ? it.summary.slice(0, 180) + '…' : it.summary)
        : `${category} 관련 외식업계 최근 동향. (식품외식경제 보도${it.dated ? ', ' + it.dated : ''})`,
      source_url: it.href.startsWith('http')
        ? it.href
        : `https://www.foodbank.co.kr${it.href}`,
      source_name: 'foodbank',
    }));

    console.log(
      `[scrapeFoodbank] ${category}: ${matched.length}/${items.length} matched, returning ${top.length}`
    );
    return top;
  } catch (e) {
    console.warn('[scrapeFoodbank]', category, e.message);
    return [];
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

/**
 * 배민사장님 foodtrend-2026 페이지에서 트렌드 카드 다수 추출.
 * styled-components prefix(TrendItemstyled__*) 기반 selector — 해시는 변해도 prefix는 안정.
 * 실패 시 [].
 */
/**
 * 아하트렌드 Ranking & Trends 게시판 — 외식 트렌드 분석 글.
 * selector: .main-board .table-row.row → 제목 + .board-text-overflow
 */
async function scrapeAhatrend() {
  let ctx;
  try {
    const browser = await getBrowser();
    ctx = await browser.newContext({
      userAgent: SCRAPE_UA,
      locale: 'ko-KR',
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    const url = 'https://www.ahatrend.com/ConRankingTrends';
    await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    const items = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.main-board .table-row.row'));
      return rows
        .map((r) => {
          const titleEl = r.querySelector('.board-title, a strong, h4, h3, .field a');
          const bodyEl = r.querySelector('.board-text-overflow');
          const linkEl = r.querySelector('a[href*="/board/view/"]') || r.querySelector('a');
          const title = ((titleEl && titleEl.innerText) || (linkEl && linkEl.innerText) || '').trim();
          const raw = (bodyEl ? bodyEl.innerText : '').trim().replace(/\s+/g, ' ');
          const href = linkEl ? linkEl.href : '';
          if (!title || !raw) return null;
          const summary = raw.length > 180 ? raw.slice(0, 180) + '…' : raw;
          return { title: title.length > 100 ? title.slice(0, 100) + '…' : title, summary, href };
        })
        .filter(Boolean)
        .slice(0, 10);
    });

    return items.map((it) => ({
      title: it.title,
      summary: it.summary,
      source_url: it.href || 'https://www.ahatrend.com/ConRankingTrends',
      source_name: 'ahatrend',
    }));
  } catch (e) {
    console.warn('[scrapeAhatrend] failed:', e.message);
    return [];
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

/**
 * 식품산업통계정보(atfis) 시장분석 뉴스레터 — 월별 외식·식품 트렌드 보고서.
 * selector: ul.galleryList > li, 텍스트 라인을 카테고리/기간/제목으로 분리.
 */
async function scrapeAtfis() {
  let ctx;
  try {
    const browser = await getBrowser();
    ctx = await browser.newContext({
      userAgent: SCRAPE_UA,
      locale: 'ko-KR',
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    const url = 'https://www.atfis.or.kr/home/board/FB0002.do';
    await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForSelector('ul.galleryList > li', { timeout: 6000 }).catch(() => {});

    const items = await page.evaluate(() => {
      const lis = Array.from(document.querySelectorAll('ul.galleryList > li'));
      return lis
        .map((li) => {
          const linkEl = li.querySelector('a[href*="FB0002.do"]') || li.querySelector('a');
          const href = linkEl ? linkEl.href : '';
          const text = (li.innerText || '').trim();
          const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
          // 패턴: ['뉴스레터', '<카테고리>', '<기간>', '뉴스레터', '<제목>', '<날짜>']
          if (lines.length < 5) return null;
          const keyword = lines[1] || '';
          const period = lines[2] || '';
          const title = lines[lines.length - 2] || lines[4] || '';
          const date = lines[lines.length - 1] || '';
          const summary = `${period} ${keyword} 키워드 — ${title}`.trim();
          if (!title) return null;
          return {
            title: title.length > 100 ? title.slice(0, 100) + '…' : title,
            summary: summary.length > 180 ? summary.slice(0, 180) + '…' : summary,
            href,
            date,
            keyword,
          };
        })
        .filter(Boolean)
        .slice(0, 10);
    });

    return items.map((it) => ({
      title: it.title,
      summary: it.summary,
      source_url: it.href || 'https://www.atfis.or.kr/home/board/FB0002.do',
      source_name: 'atfis',
    }));
  } catch (e) {
    console.warn('[scrapeAtfis] failed:', e.message);
    return [];
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

async function scrapeBaeminTrend() {
  let ctx;
  try {
    const browser = await getBrowser();
    ctx = await browser.newContext({
      userAgent: SCRAPE_UA,
      locale: 'ko-KR',
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    const url = 'https://ceo.baemin.com/trend/foodtrend-2026';
    await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    const items = await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll('[class*="TrendItemstyled__TextArea"]')
      );
      return cards
        .map((card) => {
          const titleEl = card.querySelector(
            '[class*="TrendItemstyled__TitleArea"] h2, [class*="TrendItemstyled__TitleArea"] h3, h2, h3'
          );
          const descEl = card.querySelector('[class*="TrendItemstyled__Description"]');
          const title = (titleEl?.innerText || '').trim();
          const raw = (descEl?.innerText || '').trim().replace(/\s+/g, ' ');
          if (!title || !raw) return null;
          const summary = raw.length > 180 ? raw.slice(0, 180) + '…' : raw;
          return { title, summary };
        })
        .filter(Boolean)
        .slice(0, 12);
    });

    return items.map((it) => ({
      title: it.title,
      summary: it.summary,
      source_url: url,
      source_name: 'baemin-trend',
    }));
  } catch (e) {
    console.warn('[scrapeBaeminTrend] failed:', e.message);
    return [];
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

/**
 * 배민사장님 월별 장사캘린더에서 입력 month(YYYY-MM)의 일정 추출.
 * 페이지가 표준 FullCalendar(.fc-day[data-date], .fc-event) 라이브러리 사용 — 클래스명 안정적.
 */
async function scrapeBaeminCalendar(month) {
  const yyyymm = String(month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) return [];
  const mm = parseInt(yyyymm.split('-')[1], 10);

  let ctx;
  try {
    const browser = await getBrowser();
    ctx = await browser.newContext({
      userAgent: SCRAPE_UA,
      locale: 'ko-KR',
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    const url = 'https://ceo.baemin.com/calendar';
    await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    // FullCalendar 셀 렌더 대기
    await page.waitForSelector('td.fc-day[data-date]', { timeout: 8000 }).catch(() => {});

    const items = await page.evaluate(({ yyyymm, mmN }) => {
      const dayCells = Array.from(
        document.querySelectorAll(`td.fc-day[data-date^="${yyyymm}"]`)
      );
      const out = [];
      const seen = new Set();
      for (const cell of dayCells) {
        const date = cell.dataset.date;
        const day = parseInt(date.split('-')[2], 10);
        const events = Array.from(cell.querySelectorAll('.fc-event'));
        for (const ev of events) {
          const title = (ev.innerText || '').trim();
          if (!title || title.length < 2 || title.length > 100) continue;
          // 카테고리 추출 (FullCalendar 클래스: category-SUPPORT_PROJECT / category-BAEMINACADEMY 등)
          const catMatch = String(ev.className).match(/category-([A-Z_]+)/);
          const rawCat = catMatch ? catMatch[1] : '';
          // SUPPORT_PROJECT 와 HOLIDAY 만 통과. BAEMINACADEMY 등은 제외.
          if (rawCat !== 'SUPPORT_PROJECT' && rawCat !== 'HOLIDAY') continue;
          const key = `${day}_${title}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            date: `${mmN}/${day}`,
            title,
            category: rawCat === 'HOLIDAY' ? 'holiday' : 'support',
          });
          if (out.length >= 15) break;
        }
        if (out.length >= 15) break;
      }
      return out;
    }, { yyyymm, mmN: mm });

    return items.map((it) => ({
      date: it.date,
      title: it.title,
      category: it.category,
      source_url: url,
      source_name: 'baemin-calendar',
    }));
  } catch (e) {
    console.warn('[scrapeBaeminCalendar] failed:', e.message);
    return [];
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

/**
 * 고향사랑 사이트에서 입력 month의 제철 재료 추출. best-effort.
 */
async function scrapeIlovegohyang(month) {
  const [, mmRaw] = String(month).split('-');
  const mm = String(parseInt(mmRaw || '0', 10));
  if (!mm || mm === '0') return [];

  let ctx;
  try {
    const browser = await getBrowser();
    ctx = await browser.newContext({
      userAgent: SCRAPE_UA,
      locale: 'ko-KR',
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    const url = 'https://www.ilovegohyang.go.kr/event/seasonList-main.html';
    await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    // 월별 카드 렌더 대기
    await page.waitForSelector('.card_tit', { timeout: 6000 }).catch(() => {});

    const items = await page.evaluate((monthN) => {
      // 페이지 구조: <a role="관련 상품 조회">
      //   <div class="card_tit"><span>5월</span></div>
      //   <div class="card_list_items">딸기,매실,앵두,...</div>
      // </a>
      const cards = Array.from(document.querySelectorAll('.card_tit'));
      const target = cards.find((c) => (c.innerText || '').trim() === `${monthN}월`);
      if (!target) return [];
      const wrapper = target.parentElement;
      const itemsEl = wrapper && wrapper.querySelector('.card_list_items');
      if (!itemsEl) return [];
      return (itemsEl.innerText || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length >= 1 && s.length <= 10)
        .slice(0, 30);
    }, mm);

    return items.map((name) => ({ name, source_url: url, source_name: 'gohyang' }));
  } catch (e) {
    console.warn('[scrapeIlovegohyang] failed:', e.message);
    return [];
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

// === Mock fallbacks for new data ===

// 카테고리별 월별 시즌 추천 — 한식=제철 재료, 카페=음료, 분식=분식 메뉴
const SEASONAL_MOCK = {
  한식: {
    '01': ['굴', '과메기', '유자', '한라봉', '시금치'],
    '02': ['굴', '매생이', '딸기', '한라봉', '봄동'],
    '03': ['봄동', '냉이', '달래', '주꾸미', '딸기'],
    '04': ['쑥', '달래', '냉이', '주꾸미', '봄동', '미나리'],
    '05': ['죽순', '두릅', '쑥', '머위', '더덕', '양배추'],
    '06': ['마늘', '매실', '감자', '양파', '살구', '자두'],
    '07': ['옥수수', '가지', '호박', '복숭아', '토마토', '수박'],
    '08': ['수박', '복숭아', '자두', '가지', '풋고추', '옥수수'],
    '09': ['햅쌀', '송이버섯', '전복', '무화과', '사과', '배'],
    '10': ['대하', '전어', '굴', '고구마', '사과', '배'],
    '11': ['굴', '대게', '무', '배추', '귤', '단감'],
    '12': ['굴', '과메기', '대구', '모과', '한라봉', '시금치'],
  },
  카페: {
    '01': ['시나몬 라떼', '핫초콜릿', '얼그레이 밀크티', '캐러멜 마키아토', '바닐라 라떼'],
    '02': ['딸기 라떼', '핫초콜릿', '얼그레이 라떼', '카페모카', '시그니처 카푸치노'],
    '03': ['벚꽃 라떼', '딸기 우유', '플랫화이트', '카페라떼', '말차 라떼'],
    '04': ['벚꽃 라떼', '자몽 티', '말차 라떼', '레몬 에이드', '아이스 아메리카노'],
    '05': ['딸기 라떼', '바질 에이드', '레몬 에이드', '콜드브루', '아이스 카푸치노'],
    '06': ['자몽 에이드', '청포도 에이드', '망고 스무디', '콜드브루', '아이스 라떼'],
    '07': ['수박 에이드', '망고 빙수', '복숭아 아이스티', '콜드브루', '딸기 빙수'],
    '08': ['수박 스무디', '복숭아 빙수', '망고 빙수', '레몬 에이드', '아이스 라떼'],
    '09': ['플랫화이트', '캐러멜 마키아토', '얼그레이 밀크티', '단호박 라떼', '말차 라떼'],
    '10': ['호박 라떼', '캐러멜 마키아토', '얼그레이 라떼', '플랫화이트', '아메리카노'],
    '11': ['시나몬 라떼', '캐러멜 마키아토', '핫초콜릿', '카페모카', '얼그레이 밀크티'],
    '12': ['크리스마스 라떼', '핫초콜릿', '시나몬 모카', '카페모카', '진저브레드 라떼'],
  },
  분식: {
    '01': ['떡국 떡볶이', '어묵탕', '뜨끈한 우동', '김치 라면', '치즈 떡볶이'],
    '02': ['로제 떡볶이', '어묵탕', '뜨끈한 우동', '김치 만두', '치즈 라볶이'],
    '03': ['봄나물 김밥', '냉이 만두', '쑥 떡', '봄동 김밥', '로제 떡볶이'],
    '04': ['봄나물 김밥', '꽃 만두', '쑥떡', '꼬마 김밥', '로제 떡볶이'],
    '05': ['김밥 도시락', '냉면', '비빔국수', '로제 떡볶이', '꼬마김밥'],
    '06': ['비빔국수', '냉면', '잔치 국수', '치즈 떡볶이', '왕만두'],
    '07': ['콩국수', '비빔국수', '냉면', '냉떡볶이', '시원한 라면'],
    '08': ['콩국수', '냉면', '빙수 디저트', '비빔국수', '시원한 우동'],
    '09': ['추억의 떡볶이', '국화 빵', '호빵', '어묵 탕', '치즈 만두'],
    '10': ['호빵', '어묵탕', '추억의 떡볶이', '꼬마 김밥', '튀김 모듬'],
    '11': ['호빵', '어묵탕', '뜨끈한 우동', '김치 라면', '꼬마 김밥'],
    '12': ['호빵', '어묵탕', '치즈 떡볶이', '뜨끈한 우동', '연말 잔치 국수'],
  },
};

const SEASONAL_LABEL = {
  한식: '이번 달 제철 메뉴',
  카페: '이번 달 추천 음료',
  분식: '이번 달 추천 분식',
};

// 카테고리: 'holiday' = 공휴일·시즌 이벤트, 'support' = 지원사업·세금 등 가맹점 운영 일정
const CALENDAR_MOCK = {
  '01': [
    { date: '1/1', title: '신정', category: 'holiday' },
    { date: '1/25', title: '설날 연휴(예상)', category: 'holiday' },
    { date: '1/25', title: '부가가치세 신고 마감', category: 'support' },
  ],
  '02': [
    { date: '2/14', title: '발렌타인데이', category: 'holiday' },
    { date: '2월', title: '설 연휴 대체공휴일', category: 'holiday' },
  ],
  '03': [
    { date: '3/1', title: '삼일절', category: 'holiday' },
    { date: '3/14', title: '화이트데이', category: 'holiday' },
    { date: '3월', title: '신학기 시즌 시작', category: 'holiday' },
  ],
  '04': [
    { date: '4/5', title: '식목일', category: 'holiday' },
    { date: '4/22', title: '지구의 날', category: 'holiday' },
    { date: '4/25', title: '1분기 부가가치세 신고', category: 'support' },
  ],
  '05': [
    { date: '5/1', title: '근로자의 날', category: 'holiday' },
    { date: '5/5', title: '어린이날 (가족 외식 피크)', category: 'holiday' },
    { date: '5/8', title: '어버이날', category: 'holiday' },
    { date: '5/15', title: '스승의 날', category: 'holiday' },
    { date: '5/24', title: '부처님오신날', category: 'holiday' },
    { date: '5/25', title: '부처님오신날 대체공휴일', category: 'holiday' },
    { date: '5/31', title: '종합소득세 신고 마감', category: 'support' },
    { date: '5월', title: '지자체 위생등급 지정 컨설팅', category: 'support' },
  ],
  '06': [
    { date: '6/6', title: '현충일', category: 'holiday' },
    { date: '6/25', title: '한국전쟁 정전일', category: 'holiday' },
    { date: '6월', title: '여름 보양식 시즌 시작', category: 'holiday' },
  ],
  '07': [
    { date: '7/17', title: '제헌절', category: 'holiday' },
    { date: '7월', title: '여름 휴가철 시작', category: 'holiday' },
    { date: '7/25', title: '2분기 부가가치세 신고', category: 'support' },
  ],
  '08': [
    { date: '8/15', title: '광복절', category: 'holiday' },
    { date: '8월', title: '말복·여름 보양식 마무리', category: 'holiday' },
  ],
  '09': [
    { date: '9월', title: '추석 연휴(예상)', category: 'holiday' },
    { date: '9월', title: '추석 가족외식 피크', category: 'holiday' },
  ],
  '10': [
    { date: '10/3', title: '개천절', category: 'holiday' },
    { date: '10/9', title: '한글날', category: 'holiday' },
    { date: '10/25', title: '3분기 부가가치세 신고', category: 'support' },
  ],
  '11': [
    { date: '11/11', title: '빼빼로데이', category: 'holiday' },
    { date: '11월', title: '김장철 시작', category: 'holiday' },
  ],
  '12': [
    { date: '12/25', title: '크리스마스', category: 'holiday' },
    { date: '12/31', title: '송년 연말 외식 피크', category: 'holiday' },
    { date: '12월', title: '연말 결산·소상공인 지원사업 마감', category: 'support' },
  ],
};

function mockSeasonalFor(category, month) {
  const [, mmRaw] = String(month).split('-');
  const mm = String(parseInt(mmRaw || '0', 10)).padStart(2, '0');
  const cat = SEASONAL_MOCK[category] ? category : '한식';
  return (SEASONAL_MOCK[cat][mm] || []).map((name) => ({ name, source_name: 'mock' }));
}

function seasonalLabelFor(category) {
  return SEASONAL_LABEL[category] || '이번 달 추천 메뉴';
}

// "YYYY-MM" → "5월" 형태의 짧은 라벨
function shortMonthLabel(month) {
  const [, mmRaw] = String(month || '').split('-');
  const mm = parseInt(mmRaw || '0', 10);
  return mm > 0 ? `${mm}월` : '';
}

/**
 * 카테고리별 seasonal recommend 묶음 생성.
 * 한식만 gohyang 라이브 시도, 나머지는 mock.
 */
function buildSeasonalByCategory(month, liveKorean) {
  const make = (category) => {
    const useLive = category === '한식' && liveKorean && liveKorean.length > 0;
    return {
      items: useLive ? liveKorean.slice(0, 8) : mockSeasonalFor(category, month),
      label: seasonalLabelFor(category),
      source_name: useLive ? 'gohyang' : 'mock',
      source_url: useLive ? 'https://www.ilovegohyang.go.kr/event/seasonList-main.html' : '',
    };
  };
  return {
    한식: make('한식'),
    분식: make('분식'),
    카페: make('카페'),
  };
}

function mockCalendarFor(month) {
  const [, mmRaw] = String(month).split('-');
  const mm = String(parseInt(mmRaw || '0', 10)).padStart(2, '0');
  return (CALENDAR_MOCK[mm] || []).map((it) => ({ ...it, source_name: 'mock' }));
}

/**
 * 카테고리별 트렌드 분배 — 키워드 매칭 또는 균등 분배.
 * baemin trend, ahatrend, atfis 등 카테고리 무관 소스에 모두 적용 가능.
 */
const CATEGORY_KEYWORDS = {
  한식: ['한식', '한정식', '백반', '비빔밥', '국밥', '김치', '발효', '전통주', '막걸리', 'K-푸드', '제철', '나물', '장(醬)', '국물'],
  분식: ['분식', '떡볶이', '김밥', '튀김', '순대', '오뎅', '어묵', '간식', '라면', '만두', '핫도그'],
  카페: ['카페', '커피', '라떼', '아메리카노', '디저트', '베이커리', '브런치', '음료', '바리스타', '에스프레소', '말차', '음료수'],
};

function attachTrendsByCategory(trends) {
  const byCategory = { 한식: [], 분식: [], 카페: [] };
  for (const t of trends) {
    const hay = (t.title + ' ' + t.summary).toLowerCase();
    let matched = false;
    for (const cat of Object.keys(CATEGORY_KEYWORDS)) {
      if (CATEGORY_KEYWORDS[cat].some((kw) => hay.includes(kw.toLowerCase()))) {
        byCategory[cat].push(t);
        matched = true;
        break;
      }
    }
    if (!matched) {
      const target = Object.entries(byCategory).sort((a, b) => a[1].length - b[1].length)[0][0];
      byCategory[target].push(t);
    }
  }
  return byCategory;
}

// 하위호환: 기존 호출이 있으면 같은 동작
const attachBaeminTrendByCategory = attachTrendsByCategory;

/**
 * 한식·분식·카페 카테고리에 대해 실제 스크래핑 시도 + mock 보강.
 * baemin trend / calendar / seasonal 도 함께 수집해 캠페인 객체에 포함.
 */
async function scrapeRealTrends(month) {
  const categories = ['한식', '분식', '카페'];
  // 모든 스크래핑을 병렬로 + 100초 전체 cap
  const allPromise = Promise.all([
    Promise.all(categories.map((c) => scrapeFoodbank(c))),
    scrapeBaeminTrend(),
    scrapeBaeminCalendar(month),
    scrapeIlovegohyang(month),
    scrapeAhatrend(),
    scrapeAtfis(),
  ]);
  const cap = new Promise((resolve) =>
    setTimeout(
      () => resolve([categories.map(() => []), [], [], [], [], []]),
      100000
    )
  );
  const [
    foodbankByCat,
    baeminTrends,
    baeminCal,
    gohyang,
    ahatrends,
    atfisTrends,
  ] = await Promise.race([allPromise, cap]);

  const mock = generateMockTrends(month);
  const baeminByCat = attachTrendsByCategory(baeminTrends || []);
  const ahatrendByCat = attachTrendsByCategory(ahatrends || []);
  const atfisByCat = attachTrendsByCategory(atfisTrends || []);

  const trends = {};
  let liveCount = 0;
  categories.forEach((c, i) => {
    const foodbank = (foodbankByCat && foodbankByCat[i]) || [];
    const baemin = baeminByCat[c] || [];
    const ahatrend = ahatrendByCat[c] || [];
    const atfis = atfisByCat[c] || [];
    liveCount += foodbank.length + baemin.length + ahatrend.length + atfis.length;
    const mockForC = mock[c] || [];
    // 라이브 우선 + mock 보강, 카테고리당 최대 5개
    trends[c] = [...foodbank, ...baemin, ...ahatrend, ...atfis, ...mockForC].slice(0, 5);
  });

  // seasonal — 카테고리별로 분기 (한식만 gohyang 라이브 시도, 카페/분식은 mock 음료/분식 추천)
  const seasonal_by_category = buildSeasonalByCategory(month, gohyang);

  // calendar — 공휴일(mock) + 지원사업(live baemin) 합쳐 중복 제거, 날짜순 정렬, 최대 16개.
  const mockCal = mockCalendarFor(month);
  const allSources = [
    ...mockCal,
    ...((baeminCal || []).filter((it) => it.category === 'support' || it.category === 'holiday')),
  ];
  const dedupCal = [];
  const seenKeys = new Set();
  for (const it of allSources) {
    if (!it || !it.title) continue;
    const key = `${it.date || ''}::${it.title}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    dedupCal.push(it);
  }
  // 날짜순 정렬 — "M/D" 패턴에서 D 추출, "M월" 단위는 맨 뒤
  const dayOf = (it) => {
    const s = String(it.date || '');
    const m = s.match(/\d{1,2}\s*\/\s*(\d{1,2})/);
    if (m) return parseInt(m[1], 10);
    if (/\d{1,2}\s*월/.test(s)) return 99;
    return 99;
  };
  const sortByDay = (a, b) => {
    const diff = dayOf(a) - dayOf(b);
    if (diff !== 0) return diff;
    if (a.category === 'holiday' && b.category !== 'holiday') return -1;
    if (b.category === 'holiday' && a.category !== 'holiday') return 1;
    return 0;
  };
  // 공휴일 먼저 모두 보장 + 지원사업은 남는 자리만 (cap 16). 최종은 날짜순.
  const holidays = dedupCal.filter((it) => it.category === 'holiday').sort(sortByDay);
  const supports = dedupCal.filter((it) => it.category !== 'holiday').sort(sortByDay);
  const MAX_CAL = 18;
  const supportBudget = Math.max(0, MAX_CAL - holidays.length);
  const mergedCal = [...holidays, ...supports.slice(0, supportBudget)].sort(sortByDay);
  const calendarSourceName =
    baeminCal && baeminCal.length > 0
      ? (mergedCal.some((i) => i.source_name === 'mock') ? 'baemin-calendar+mock' : 'baemin-calendar')
      : 'mock';
  const calendar = {
    items: mergedCal,
    source_name: calendarSourceName,
    source_url: 'https://ceo.baemin.com/calendar',
  };

  const sourcesActive = [];
  const fbAny = (foodbankByCat || []).some((arr) => arr && arr.length);
  const bmAny = (baeminTrends || []).length > 0;
  const ahaAny = (ahatrends || []).length > 0;
  const atfisAny = (atfisTrends || []).length > 0;
  if (fbAny) sourcesActive.push('foodbank (live)');
  if (bmAny) sourcesActive.push('baemin-trend (live)');
  if (ahaAny) sourcesActive.push('ahatrend (live)');
  if (atfisAny) sourcesActive.push('atfis (live)');
  if (gohyang && gohyang.length > 0) sourcesActive.push('gohyang (live)');
  if (baeminCal && baeminCal.length > 0) sourcesActive.push('baemin-calendar (live)');
  if (sourcesActive.length === 0) sourcesActive.push('mock only');
  else sourcesActive.push('mock');

  return { trends, seasonal_by_category, calendar, sources_used: sourcesActive, liveCount };
}

// === Real implementations (Week 2/3/5) ===

/**
 * OpenAI gpt-4o-mini로 카드뉴스 5섹션 카피 재창조.
 * 실패 시 generateMockCopy로 fallback.
 */
function buildCopyPrompt(client, categoryTrends, seasonal, calendar) {
  const trendsBlock = (categoryTrends || [])
    .slice(0, 3)
    .map(
      (t, i) =>
        `[트렌드 ${i + 1}] ${t.title}\n요약: ${t.summary}\n출처: ${t.source_url} (${t.source_name})`
    )
    .join('\n\n');

  const menuList =
    Array.isArray(client.menu_keywords) && client.menu_keywords.length
      ? client.menu_keywords.join(', ')
      : '대표 메뉴';

  const seasonalLabel =
    (seasonal && seasonal.label) || '이번 달 추천 메뉴';
  const seasonalLine =
    seasonal && Array.isArray(seasonal.items) && seasonal.items.length
      ? seasonal.items.map((s) => s.name).slice(0, 8).join(', ')
      : '';
  // CTA용은 공휴일·시즌 이벤트만 (지원사업/세금은 카피 톤과 안 맞음)
  const calendarHolidays =
    calendar && Array.isArray(calendar.items)
      ? calendar.items.filter((c) => !c.category || c.category === 'holiday')
      : [];
  const calendarLines = calendarHolidays.length > 0
    ? calendarHolidays.slice(0, 6).map((c) => `- ${c.date} ${c.title}`).join('\n')
    : '';

  return `[클라이언트 정보]
- 매장명: ${client.name}
- 업종: ${client.category}
- 톤앤매너: ${client.tone || '자연스럽고 친근한'}
- 대표 메뉴 키워드: ${menuList}

[이번 시즌 외식 트렌드 (영감용)]
${trendsBlock || '(트렌드 정보 없음)'}

[${seasonalLabel} (영감용 — 가능하면 카피에 1개 자연스럽게 녹여주세요)]
${seasonalLine || '(없음)'}

[이번 달 공휴일·시즌 이벤트 (CTA에 반드시 1개를 자연스럽게 녹여주세요)]
${calendarLines || '(없음)'}

[작업 지시 — 매우 중요]
위 정보를 **재료처럼** 사용해 ${client.name}만의 인스타그램 카드뉴스 **8장** 카피를 작성하세요.
**카피 전체가 하나의 흐름**으로 읽혀야 하며, **트렌드·시즌 재료/메뉴·이번 달 일정 세 가지가 카피 속에 자연스럽게 녹아 있어야** 합니다.

[슬라이드 구성 (8장)]
1. 헤드라인 (음식 이미지 위)
2. 이번 달 ${seasonalLabel} (재료/메뉴 리스트만 — 카피 본문 없음)
3. **이달의 외식 트렌드 한눈에** (트렌드 키워드 3~5개 + 한 줄 요약 본문)
4~6. **추천 메뉴 3개** (각각 메뉴명 + 본문)
7. 5월 일정 (별도 페이지)
8. CTA + Source

[필수 규칙]
1. **트렌드 슬라이드(Slide 3)**: 위 [트렌드] 항목을 기반으로 **trend_keywords**에 3~5개 짧은 키워드(쉼표 구분, 각 2~10자)를 뽑고, **trend_body**에는 그 키워드들을 관통하는 한 줄 인사이트(50~80자)를 매장 톤으로 풀어 쓰세요. 트렌드 원문 복붙 금지.
2. **추천 메뉴 본문(Slide 4·5·6)**: 위 [${seasonalLabel}] 중 1~2개 시즌 재료/메뉴를 본문에 자연스럽게 한 번 등장시키세요. 트렌드 키워드 한두 개를 본문에 살짝 녹여도 좋음.
3. **공휴일·시즌 이벤트**: CTA에는 위 [이번 달 공휴일·시즌 이벤트] 중 **반드시 1개의 공휴일을 명시적으로 언급**하고, 그 분위기에 맞는 외식 메시지를 만들어주세요 (예: 어버이날→부모님과 함께, 어린이날→가족 외식, 크리스마스→연말 모임). 단순히 "특별한 날" 같은 두루뭉술한 표현은 금지 — 구체적인 날짜·이름을 쓰세요.
4. **headline ↔ CTA 호응**: headline의 감정/키워드가 CTA에서 한 번 더 살아나도록.
5. **추천 메뉴 3개는 모두 서로 다른 메뉴**여야 합니다. 매장의 menu_keywords 중에서 고르거나, 카테고리에 맞게 자연스럽게 확장해도 좋습니다. 절대 같은 메뉴 반복 X.
6. **slide4_menu, slide5_menu, slide6_menu는 반드시 "실제 메뉴 이름"으로 채우세요** (예: "비빔밥", "딸기 라떼", "로제 떡볶이"). "이 한 그릇", "오늘의 한 입" 같은 지시어를 메뉴 이름 자리에 넣지 마세요.
7. 단, **본문(slide4, slide5, slide6)에서는** 그 메뉴를 직접 부르지 말고 "이 한 그릇", "오늘의 한 입" 같은 지시어로 가리키세요. 즉, 메뉴 이름은 제목에만 있고 본문에는 없습니다.
7. **본문은 말이 되어야 합니다**. 재료/식감/먹는 순간의 감각/누구에게 좋은지/시즌 무드 등 구체적으로.
8. **글자수 가이드 반드시 준수**:

| 필드 | 글자수 | 문장 수 |
|---|---|---|
| headline | 28자 이내 | 1문장 |
| slide2 (PNG 미표시) | 60~100자 | 1~2문장 |
| trend_keywords | 키워드 3~5개, 쉼표 구분, 각 2~10자 | - |
| trend_body | 50~80자 | 1~2문장 |
| slide4_menu ~ slide6_menu | 2~10자 | 단어급 |
| slide4 ~ slide6 본문 | 90~130자 | 2~3문장 |
| cta | 70~100자 | 1~2문장 |
| source | URL 문자열 | - |

반드시 다음 JSON 스키마로만 응답 (필드 누락 X):
{"headline":"...","slide2":"...","trend_keywords":"키1, 키2, 키3","trend_body":"...","slide4_menu":"...","slide4":"...","slide5_menu":"...","slide5":"...","slide6_menu":"...","slide6":"...","cta":"...","source":"https://..."}`;
}

async function generateRealCopy(client, categoryTrends, seasonal, calendar) {
  if (!openai) return generateMockCopy(client, categoryTrends);

  try {
    const prompt = buildCopyPrompt(client, categoryTrends, seasonal, calendar);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            '당신은 외식 프랜차이즈 마케팅 전문 카피라이터입니다. 한국어로, 매장의 톤앤매너에 정확히 맞춰, 외식 트렌드·시즌 재료·이번 달 일정이 모두 자연스럽게 녹아든 인스타그램 카드뉴스 카피를 씁니다. 트렌드는 키워드 한두 개라도 반드시 반영하되 원문을 복붙하지 않고, 매장만의 언어로 재창조합니다. 슬라이드 5장이 따로 노는 게 아니라 headline → 시즌 무드 → 추천 메뉴 ① → 추천 메뉴 ② → CTA로 이어지는 한 편의 이야기처럼 호응합니다. 항상 지정된 JSON 스키마로만 응답하세요.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    // 필수 본문 필드 검증 — 누락 시 fallback
    const required = ['headline', 'slide2', 'trend_body', 'slide4', 'slide5', 'slide6', 'cta'];
    for (const k of required) {
      if (typeof parsed[k] !== 'string' || !parsed[k].trim()) {
        console.warn('[generateRealCopy] missing field:', k, '— falling back to mock');
        return generateMockCopy(client, categoryTrends);
      }
    }

    // trend_keywords 보강 — 누락 시 categoryTrends에서 추출
    if (typeof parsed.trend_keywords !== 'string' || !parsed.trend_keywords.trim()) {
      const fallback = (categoryTrends || [])
        .slice(0, 4)
        .map((t) => (t.title || '').replace(/^\[[^\]]+\]\s*/, '').slice(0, 12))
        .filter(Boolean);
      parsed.trend_keywords = fallback.length > 0 ? fallback.join(', ') : '시즌 트렌드';
    }

    // 메뉴 3개 보강 (LLM 누락 또는 중복 시 메뉴 키워드로 채움 + 강제 unique)
    const baseMenus = Array.isArray(client.menu_keywords) ? client.menu_keywords.slice() : [];
    const filler = ['시그니처 메뉴', '오늘의 추천', '인기 메뉴', '시즌 한정', '신메뉴'];
    const used = new Set();
    for (let i = 4; i <= 6; i++) {
      const fld = `slide${i}_menu`;
      let m = typeof parsed[fld] === 'string' ? parsed[fld].trim() : '';
      if (!m || used.has(m)) {
        m = baseMenus.shift() || filler.shift() || `추천 메뉴 ${i - 3}`;
        while (used.has(m)) {
          m = (baseMenus.shift() || filler.shift() || (m + ' ' + (i - 3))).trim();
        }
      }
      used.add(m);
      parsed[fld] = m;
    }

    // source 누락 시 1순위 트렌드 URL 사용
    if (!parsed.source) {
      parsed.source =
        (categoryTrends && categoryTrends[0] && categoryTrends[0].source_url) || '';
    }

    return parsed;
  } catch (err) {
    console.error('[generateRealCopy] OpenAI failed, falling back:', err.message);
    return generateMockCopy(client, categoryTrends);
  }
}

// 한글 메뉴 → 영문 풀이. fal이 한글을 글자로 새기지 않도록 prompt는 영문만.
const MENU_TO_EN = {
  '한정식': 'hanjeongsik Korean course meal',
  '한식': 'Korean traditional cuisine',
  '비빔밥': 'bibimbap mixed rice bowl with vegetables',
  '여름 비빔밥': 'cold summer bibimbap with fresh greens',
  '봄나물 비빔밥': 'spring herb bibimbap with seasonal greens',
  '된장찌개': 'doenjang jjigae Korean soybean stew',
  '김치찌개': 'kimchi jjigae stew',
  '불고기': 'bulgogi marinated beef',
  '갈비탕': 'galbitang short rib soup',
  '잡채': 'japchae glass noodles with vegetables',
  '보쌈': 'bossam steamed pork wrap',
  '족발': 'jokbal braised pig feet',
  '백반': 'baekban Korean home-style set meal',
  '국밥': 'gukbap hot soup with rice',
  '떡볶이': 'tteokbokki spicy rice cakes',
  '로제 떡볶이': 'rose cream tteokbokki',
  '냉떡볶이': 'cold tteokbokki',
  '치즈 떡볶이': 'cheese tteokbokki',
  '추억의 떡볶이': 'old school nostalgic tteokbokki',
  '김밥': 'kimbap seaweed rice roll',
  '꼬마김밥': 'mini kimbap bite-size rolls',
  '봄나물 김밥': 'spring herb kimbap',
  '김밥 도시락': 'kimbap lunch box set',
  '튀김': 'Korean fried snacks',
  '튀김 모듬': 'assorted Korean fritters platter',
  '순대': 'sundae Korean blood sausage',
  '어묵': 'eomuk fish cake skewers',
  '어묵탕': 'eomuk fish cake soup',
  '오뎅': 'fish cakes in hot broth',
  '치즈 라볶이': 'cheese rabokki ramen with rice cakes',
  '왕만두': 'large steamed mandu dumplings',
  '꽃 만두': 'flower-shaped mandu dumplings',
  '냉이 만두': 'shepherd purse mandu dumplings',
  '냉면': 'naengmyeon cold buckwheat noodles',
  '비빔국수': 'bibim guksu spicy noodles',
  '잔치 국수': 'janchi guksu thin noodle soup',
  '콩국수': 'kongguksu cold soybean noodle soup',
  '호빵': 'hoppang steamed bun',
  '국화 빵': 'gukhwa bbang chrysanthemum-shaped pastries',
  '쑥떡': 'mugwort rice cake',
  '쑥 떡': 'mugwort rice cake',
  '뜨끈한 우동': 'hot udon noodles',
  '시원한 우동': 'cold udon noodles',
  '김치 라면': 'kimchi ramen',
  '김치 만두': 'kimchi mandu dumplings',
  '시원한 라면': 'refreshing cold ramen',
  '빙수 디저트': 'bingsu shaved ice dessert',
  '떡국 떡볶이': 'tteokguk style tteokbokki',
  '라떼': 'cafe latte with delicate latte art',
  '카페라떼': 'cafe latte with latte art',
  '딸기 라떼': 'fresh strawberry latte with whole strawberries',
  '바닐라 라떼': 'vanilla latte',
  '시나몬 라떼': 'cinnamon latte',
  '말차 라떼': 'matcha latte with vivid green',
  '호박 라떼': 'pumpkin latte autumn vibe',
  '단호박 라떼': 'sweet pumpkin latte',
  '벚꽃 라떼': 'cherry blossom pink latte',
  '크리스마스 라떼': 'festive Christmas latte with cinnamon stick',
  '진저브레드 라떼': 'gingerbread latte',
  '아메리카노': 'iced americano in tall glass',
  '아이스 아메리카노': 'iced americano coffee',
  '콜드브루': 'cold brew coffee in glass',
  '카페모카': 'cafe mocha with whipped cream',
  '시나몬 모카': 'cinnamon mocha',
  '캐러멜 마키아토': 'caramel macchiato',
  '플랫화이트': 'flat white coffee',
  '아이스 카페라떼': 'iced cafe latte',
  '아이스 카푸치노': 'iced cappuccino with foam',
  '아이스 라떼': 'iced latte',
  '얼그레이 라떼': 'earl grey milk tea latte',
  '얼그레이 밀크티': 'earl grey milk tea',
  '시그니처 카푸치노': 'signature cappuccino with foam art',
  '핫초콜릿': 'hot chocolate with marshmallows',
  '딸기 우유': 'fresh strawberry milk drink',
  '자몽 티': 'grapefruit iced tea',
  '자몽 에이드': 'grapefruit ade with citrus slices',
  '바질 에이드': 'basil herb ade refreshing',
  '레몬 에이드': 'lemonade with fresh lemon slices',
  '청포도 에이드': 'green grape ade',
  '망고 스무디': 'mango smoothie',
  '망고 빙수': 'mango bingsu shaved ice',
  '복숭아 빙수': 'peach bingsu',
  '딸기 빙수': 'strawberry bingsu',
  '수박 에이드': 'watermelon ade',
  '수박 스무디': 'watermelon smoothie',
  '복숭아 아이스티': 'peach iced tea',
  '디저트': 'cafe dessert plate',
  '베이커리': 'bakery pastries',
  '브런치': 'brunch plate',
  '음료': 'cafe drink',
  '시즌 음료': 'seasonal cafe drink',
  '스페셜티 커피': 'specialty coffee',
};

function menuToEnglish(menus) {
  if (!Array.isArray(menus)) return [];
  return menus
    .map((m) => MENU_TO_EN[String(m || '').trim()] || '')
    .filter(Boolean);
}

// 카테고리별 fal.ai 프롬프트 컨텍스트 — 한식·분식·카페별로 분위기를 명확히
const CATEGORY_IMAGE_PROMPT = {
  한식:
    'Korean traditional cuisine (hansik), authentic Korean banchan setting, hero dish in the center with multiple small side dishes around, served on natural ceramic or stoneware on a warm wooden table, top-down or 45-degree angle, editorial food magazine style',
  분식:
    'Korean street food / bunsik plating, casual vibrant presentation, generous hearty portion on a simple plate or tray, dynamic 45-degree angle, mouth-watering close-up of the hero dish, splash of sauce, steam rising, lively energetic mood',
  카페:
    'modern Korean cafe scene, beautifully styled drink and small dessert, marble or warm wooden countertop, soft natural window light, shallow depth of field, minimalist photogenic aesthetic, latte-art or fresh fruit accent',
  default:
    'Korean restaurant food photography, hero dish centered, natural ceramic plating, editorial magazine style',
};

// 월별 시즌 무드 — 사진 분위기에 살짝 반영
const SEASONAL_VIBE = {
  '01': 'winter, warm cozy mood, soft golden lighting',
  '02': 'late winter, soft natural light, calm atmosphere',
  '03': 'early spring, fresh greens, bright and clean',
  '04': 'spring vibes, soft sunlight, fresh herbs garnish',
  '05': 'late spring, vibrant fresh atmosphere, lush greens',
  '06': 'early summer, bright vibrant mood, light and airy',
  '07': 'midsummer, vivid colors, refreshing cool feel',
  '08': 'late summer, warm bright tones, juicy abundance',
  '09': 'early autumn, golden warm light, comforting mood',
  '10': 'autumn, earthy warm tones, harvest abundance',
  '11': 'late autumn, warm cozy ambiance, deep rich colors',
  '12': 'winter holiday season, warm festive lighting',
};

function seasonalVibeFor(month) {
  const [, mmRaw] = String(month || '').split('-');
  const mm = String(parseInt(mmRaw || '0', 10)).padStart(2, '0');
  return SEASONAL_VIBE[mm] || 'natural seasonal mood';
}

/**
 * fal.ai Z-Image Turbo로 Slide 1 hero 음식 이미지 생성.
 * 카테고리·시즌·메뉴 키워드를 종합한 풍부한 프롬프트.
 * 실패 시 null 반환 (Slide 1은 회색 placeholder fallback).
 */
async function generateFoodImage(client, copy, month) {
  if (!FAL_KEY) {
    console.warn('[generateFoodImage] FAL_KEY missing — skip image generation');
    return null;
  }

  // 메뉴 키워드를 영문으로 매핑 — 한글이 prompt에 들어가면 fal이 글자로 새기려고 함
  const enMenus = menuToEnglish(client.menu_keywords);
  const heroMenu = enMenus[0] || '';
  const supportMenu = enMenus[1] || '';
  const menuLine = heroMenu
    ? `Featured hero menu: ${heroMenu}${supportMenu ? `, supporting dish: ${supportMenu}` : ''}.`
    : '';

  const categoryCtx = CATEGORY_IMAGE_PROMPT[client.category] || CATEGORY_IMAGE_PROMPT.default;
  const vibe = seasonalVibeFor(month);

  // 핵심 negative — 짧고 강하게 (긴 negative는 품질 저하 가능)
  const negative =
    'no text, no letters, no Korean Hangul, no Chinese characters, no signage, no captions, no menu writing, no watermark, no logo, no human hands';

  const prompt = [
    categoryCtx + '.',
    menuLine,
    `Seasonal mood: ${vibe}.`,
    'Professional editorial food photography, sharp focus on hero dish, vivid natural colors, soft natural lighting, shallow depth of field, high detail, appetizing texture, clean composition, 1:1 square aspect ratio.',
    negative + '.',
  ]
    .filter(Boolean)
    .join(' ');

  try {
    const res = await fetch('https://fal.run/fal-ai/z-image/turbo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${FAL_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: 1080, height: 1080 },
        num_inference_steps: 8, // 4 → 8: 품질 ↑, 시간 약간 ↑
        num_images: 1,
        output_format: 'png',
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[generateFoodImage] fal.ai HTTP', res.status, txt.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const url =
      data && data.images && data.images[0] && data.images[0].url ? data.images[0].url : null;
    return url;
  } catch (err) {
    console.error('[generateFoodImage] fal.ai failed:', err.message);
    return null;
  }
}

// === Playwright HTML→PNG 합성 ===

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = null; // 실패 시 다음 호출에 재시도 가능
      throw err;
    });
  }
  return browserPromise;
}

function buildSlideUrl(slideN, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  // file:// URL — Windows 경로의 백슬래시는 forward slash로
  const filePath = SLIDE_TEMPLATE.replace(/\\/g, '/');
  return `file:///${filePath}?slide=${slideN}&${qs}`;
}

async function renderSlide(slideN, params, outputPath) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  try {
    const url = buildSlideUrl(slideN, params);
    await page.goto(url, { waitUntil: 'load' });
    // template이 데이터·이미지·폰트 로드 후 body[data-ready=1]로 신호
    await page
      .waitForFunction(
        () =>
          document.body &&
          document.body.dataset &&
          document.body.dataset.ready === '1',
        { timeout: 15000 }
      )
      .catch(() => {});
    // 외부 폰트/이미지 로드 대기 (안전망)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: outputPath, fullPage: false, omitBackground: false });
  } finally {
    await ctx.close();
  }
}

async function renderClientSlides(client, copy, image_url, month, seasonal, calendar) {
  await ensureSlidesDir();

  // 시즌 추천: 이름 리스트를 쉼표 join (최대 5개)
  const seasonalStr =
    seasonal && Array.isArray(seasonal.items) && seasonal.items.length
      ? seasonal.items.slice(0, 5).map((s) => s.name).join(',')
      : '';
  // 라벨: 카테고리별 ("이번 달 제철 메뉴" / "이번 달 추천 음료" / "이번 달 추천 분식")
  const seasonalLabel =
    (seasonal && seasonal.label) || seasonalLabelFor(client.category);
  // 캘린더 — 페이지당 6개, 데이터 개수에 따라 페이지 가변 (최소 1장, 최대 3장)
  const calItemsAll =
    calendar && Array.isArray(calendar.items) ? calendar.items.slice(0, 18) : [];
  const CAL_PER_PAGE = 6;
  const calPages = Math.max(1, Math.min(3, Math.ceil(calItemsAll.length / CAL_PER_PAGE)));
  const calendarStr = calItemsAll.length
    ? JSON.stringify(
        calItemsAll.map((c) => ({
          date: c.date,
          title: c.title,
          category: c.category || '',
        }))
      )
    : '';

  const monthLabel = shortMonthLabel(month);
  // 추천 메뉴 3개 — slide4~6_menu가 없으면 메뉴 키워드 + 인덱스로 fallback, unique 보장
  const mk = Array.isArray(client.menu_keywords) ? client.menu_keywords : [];
  const fillerMenus = ['시그니처 메뉴', '오늘의 추천', '인기 메뉴', '시즌 한정', '신메뉴'];
  const slideMenus = [];
  const usedMenu = new Set();
  for (let i = 4; i <= 6; i++) {
    let m = ((copy[`slide${i}_menu`] || '') + '').trim();
    if (!m || usedMenu.has(m)) {
      m = (mk.find((x) => x && !usedMenu.has(x)) || fillerMenus.shift() || `추천 메뉴 ${i - 3}`).trim();
      while (usedMenu.has(m)) {
        m = (fillerMenus.shift() || `${m} ${i - 3}`).trim();
      }
    }
    usedMenu.add(m);
    slideMenus.push(m);
  }

  // 트렌드 슬라이드 데이터 — copy.trend_keywords / trend_body 우선, 없으면 fallback
  const trendKeywords =
    (copy.trend_keywords && copy.trend_keywords.toString().trim()) || '시즌 트렌드';
  const trendBody = (copy.trend_body && copy.trend_body.toString().trim()) || '';

  const baseParams = {
    category: client.category,
    client_name: client.name,
    headline: copy.headline || '',
    slide2: copy.slide2 || '',
    trend_keywords: trendKeywords,
    trend_body: trendBody,
    slide4_menu: slideMenus[0],
    slide4: copy.slide4 || '',
    slide4_image: (copy.slide4_image || '').toString().trim(),
    slide5_menu: slideMenus[1],
    slide5: copy.slide5 || '',
    slide5_image: (copy.slide5_image || '').toString().trim(),
    slide6_menu: slideMenus[2],
    slide6: copy.slide6 || '',
    slide6_image: (copy.slide6_image || '').toString().trim(),
    cta: copy.cta || '',
    source: copy.source || '',
    image_url: image_url || '',
    seasonal: seasonalStr,
    seasonal_label: seasonalLabel,
    month_label: monthLabel,
    calendar: calendarStr,
    cal_pages: calPages,
  };

  // 동적 슬라이드 수: 헤드라인(1) + 제철(1) + 트렌드(1) + 메뉴 3개(3) + 캘린더(calPages) + CTA(1)
  const TOTAL_SLIDES = 6 + calPages + 1;
  const results = [];
  for (let n = 1; n <= TOTAL_SLIDES; n++) {
    const fileName = `${month}_${client.id}_${n}.png`;
    const outputPath = path.join(SLIDES_DIR, fileName);
    await renderSlide(n, baseParams, outputPath);
    results.push({
      slide_n: n,
      url: `/slides/${fileName}`,
      kind: n === 1 ? 'image_with_overlay' : 'text',
      file: fileName,
    });
  }
  return results;
}

// === Routes ===

// 1. Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    openai: Boolean(openai),
    fal: Boolean(FAL_KEY),
    imagekit: Boolean(imagekit),
  });
});

// 1-2. ImageKit auth — frontend SDK 업로드용 토큰/서명 발급
//      필요: IMAGEKIT_PUBLIC_KEY / IMAGEKIT_PRIVATE_KEY / IMAGEKIT_URL_ENDPOINT (.env)
app.get('/api/imagekit-auth', (_req, res) => {
  if (!imagekit) {
    return res
      .status(503)
      .json({ ok: false, message: 'ImageKit not configured. Set IMAGEKIT_* env vars.' });
  }
  try {
    const params = imagekit.getAuthenticationParameters();
    res.json({
      ...params,
      publicKey: IMAGEKIT_PUBLIC_KEY,
      urlEndpoint: IMAGEKIT_URL_ENDPOINT,
    });
  } catch (err) {
    console.error('[GET /api/imagekit-auth] failed:', err);
    res.status(500).json({ ok: false, message: 'failed to get imagekit auth params' });
  }
});

// 2-1. List clients
app.get('/api/clients', async (_req, res) => {
  try {
    const clients = await readClients();
    res.json(clients);
  } catch (err) {
    console.error('[GET /api/clients] failed:', err);
    res.status(500).json({ ok: false, message: 'failed to read clients.json' });
  }
});

// 2-2. Create client
app.post('/api/clients', async (req, res) => {
  try {
    const { name, category, email, tone, menu_keywords } = req.body || {};

    if (!name || !category || !email) {
      return res
        .status(400)
        .json({ ok: false, message: 'name, category, email are required' });
    }

    const clients = await readClients();

    let maxN = 0;
    for (const c of clients) {
      if (typeof c.id === 'string' && c.id.startsWith('c')) {
        const n = parseInt(c.id.slice(1), 10);
        if (!Number.isNaN(n) && n > maxN) maxN = n;
      }
    }
    const newId = `c${maxN + 1}`;

    const newClient = {
      id: newId,
      name,
      category,
      email,
      tone: tone || '',
      menu_keywords: Array.isArray(menu_keywords) ? menu_keywords : [],
    };

    clients.push(newClient);
    await writeClients(clients);

    res.status(201).json(newClient);
  } catch (err) {
    console.error('[POST /api/clients] failed:', err);
    res.status(500).json({ ok: false, message: 'failed to create client' });
  }
});

// 2-3. Update client (partial)
app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clients = await readClients();
    const idx = clients.findIndex((c) => c.id === id);

    if (idx === -1) {
      return res.status(404).json({ ok: false, message: 'client not found' });
    }

    const patch = req.body || {};
    delete patch.id;

    const updated = { ...clients[idx], ...patch };
    clients[idx] = updated;

    await writeClients(clients);
    res.json(updated);
  } catch (err) {
    console.error('[PUT /api/clients/:id] failed:', err);
    res.status(500).json({ ok: false, message: 'failed to update client' });
  }
});

// 2-4. Delete client
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clients = await readClients();
    const idx = clients.findIndex((c) => c.id === id);

    if (idx === -1) {
      return res.status(404).json({ ok: false, message: 'client not found' });
    }

    clients.splice(idx, 1);
    await writeClients(clients);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/clients/:id] failed:', err);
    res.status(500).json({ ok: false, message: 'failed to delete client' });
  }
});

// 3. Collect trends — PoC: foodbank.co.kr live + mock fallback
//    body: { month: "2026-05", mode?: "auto" | "live" | "mock" }
//    mode 미지정/"auto"/"live": 실제 스크래핑 시도 → 실패한 카테고리는 mock으로 보강
//    mode "mock": 강제 mock (테스트용)
//    스크래핑 전체 실패해도 mock으로 응답 (절대 500 에러 X)
app.post('/api/collect-trends', async (req, res) => {
  try {
    const { month, mode } = req.body || {};
    if (!month || typeof month !== 'string') {
      return res
        .status(400)
        .json({ ok: false, message: 'month (e.g. "2026-05") is required' });
    }

    const useLive = mode !== 'mock'; // 'auto'(default) / 'live' → live, 'mock' → mock
    let trends;
    let sources_used;
    let seasonal_by_category;
    let calendar;

    if (useLive) {
      try {
        const result = await scrapeRealTrends(month);
        trends = result.trends;
        sources_used = result.sources_used;
        seasonal_by_category = result.seasonal_by_category;
        calendar = result.calendar;
      } catch (err) {
        console.error('[collect-trends] live scrape failed, fallback to mock:', err.message);
        trends = generateMockTrends(month);
        sources_used = ['mock only (scrape error)'];
        seasonal_by_category = buildSeasonalByCategory(month, null);
        calendar = { items: mockCalendarFor(month), source_name: 'mock', source_url: '' };
      }
    } else {
      trends = generateMockTrends(month);
      sources_used = ['mock only (forced)'];
      seasonal_by_category = buildSeasonalByCategory(month, null);
      calendar = { items: mockCalendarFor(month), source_name: 'mock', source_url: '' };
    }

    const campaigns = await readCampaigns();
    const idx = campaigns.findIndex((c) => c.month === month);

    const next = {
      id: month,
      month,
      collected_at: new Date().toISOString(),
      trends,
      seasonal_by_category,
      calendar,
      sources_used,
      items: idx === -1 ? [] : (campaigns[idx].items || []),
    };

    if (idx === -1) {
      campaigns.push(next);
    } else {
      campaigns[idx] = next;
    }
    await writeCampaigns(campaigns);

    res.json(next);
  } catch (err) {
    console.error('[POST /api/collect-trends] failed:', err);
    // 최후의 fallback — 절대 클라이언트가 500을 보지 않게
    try {
      const { month } = req.body || {};
      const safeMonth = (month && typeof month === 'string') ? month : 'unknown';
      res.json({
        id: safeMonth,
        month: safeMonth,
        collected_at: new Date().toISOString(),
        trends: generateMockTrends(safeMonth),
        seasonal_by_category: buildSeasonalByCategory(safeMonth, null),
        calendar: { items: mockCalendarFor(safeMonth), source_name: 'mock', source_url: '' },
        sources_used: ['mock only (server error)'],
        items: [],
        warning: 'unexpected error — served from mock without persistence',
      });
    } catch {
      res.status(500).json({ ok: false, message: 'failed to collect trends' });
    }
  }
});

// 4. Generate copy — OpenAI gpt-4o-mini 우선, 실패 시 mock fallback
app.post('/api/generate-copy', async (req, res) => {
  try {
    const { client_id, month } = req.body || {};
    if (!client_id || !month) {
      return res
        .status(400)
        .json({ ok: false, message: 'client_id and month are required' });
    }

    const clients = await readClients();
    const client = clients.find((c) => c.id === client_id);
    if (!client) {
      return res.status(404).json({ ok: false, message: 'client not found' });
    }

    const campaigns = await readCampaigns();
    const campaign = campaigns.find((c) => c.month === month);
    if (!campaign) {
      return res.status(404).json({
        ok: false,
        message: `campaign for month ${month} not found. call /api/collect-trends first.`,
      });
    }

    const categoryTrends =
      campaign.trends && Array.isArray(campaign.trends[client.category])
        ? campaign.trends[client.category]
        : [];

    const seasonalForClient =
      (campaign.seasonal_by_category && campaign.seasonal_by_category[client.category]) || null;

    const copy = await generateRealCopy(
      client,
      categoryTrends,
      seasonalForClient,
      campaign.calendar || null
    );

    // campaigns.json items에 캐싱
    await upsertCampaignItem(month, client.id, {
      client_name: client.name,
      category: client.category,
      copy,
      copy_generated_at: new Date().toISOString(),
    });

    res.json({
      client_id: client.id,
      client_name: client.name,
      category: client.category,
      copy,
      ai: openai ? 'gpt-4o-mini' : 'mock-fallback',
    });
  } catch (err) {
    console.error('[POST /api/generate-copy] failed:', err);
    res.status(500).json({ ok: false, message: 'failed to generate copy' });
  }
});

// 5. Regenerate image — fal.ai Z-Image Turbo
app.post('/api/regenerate-image', async (req, res) => {
  try {
    const { client_id, month } = req.body || {};
    if (!client_id || !month) {
      return res
        .status(400)
        .json({ ok: false, message: 'client_id and month are required' });
    }

    const clients = await readClients();
    const client = clients.find((c) => c.id === client_id);
    if (!client) {
      return res.status(404).json({ ok: false, message: 'client not found' });
    }

    const campaigns = await readCampaigns();
    const campaign = campaigns.find((c) => c.month === month);
    const item =
      campaign && Array.isArray(campaign.items)
        ? campaign.items.find((i) => i.client_id === client_id)
        : null;
    const copy = (item && item.copy) || {};

    const image_url = await generateFoodImage(client, copy, month);

    if (image_url) {
      await upsertCampaignItem(month, client.id, {
        image_url,
        image_generated_at: new Date().toISOString(),
      });
    }

    res.json({
      client_id,
      image_url,
      provider: image_url ? 'fal.ai z-image/turbo' : 'unavailable',
      message: image_url
        ? null
        : 'FAL_KEY 미설정 또는 호출 실패 — Slide 1은 회색 placeholder로 합성됩니다.',
    });
  } catch (err) {
    console.error('[POST /api/regenerate-image] failed:', err);
    res.status(500).json({ ok: false, message: 'failed to regenerate image' });
  }
});

// 5-2. Quick copy — 클라이언트 컨텍스트 + 메뉴명 한 개로 짧은 카피 즉석 생성
//      body: { client_id, menu_name, style? } → { menu_name, headline, line }
app.post('/api/quick-copy', async (req, res) => {
  try {
    const { client_id, menu_name, style } = req.body || {};
    if (!client_id || !menu_name || typeof menu_name !== 'string') {
      return res.status(400).json({ ok: false, message: 'client_id and menu_name are required' });
    }
    const trimmedMenu = menu_name.trim();
    if (!trimmedMenu) {
      return res.status(400).json({ ok: false, message: 'menu_name is empty' });
    }

    const clients = await readClients();
    const client = clients.find((c) => c.id === client_id);
    if (!client) {
      return res.status(404).json({ ok: false, message: 'client not found' });
    }

    // OpenAI 없으면 mock fallback
    if (!openai) {
      return res.json({
        menu_name: trimmedMenu,
        headline: `${trimmedMenu}, ${client.name}의 추천 한 그릇`,
        line: `${client.name}에서 정성껏 준비한 ${trimmedMenu}을(를) 만나보세요. ${client.tone || '정중하고 따뜻한'} 분위기로 즐기는 한 끼.`,
        provider: 'mock-fallback',
      });
    }

    const styleHint = (style || '인스타 카드뉴스').toString().slice(0, 30);
    const prompt = `[클라이언트]
- 매장명: ${client.name}
- 업종: ${client.category}
- 톤앤매너: ${client.tone || '자연스럽고 친근한'}

[입력 메뉴]
${trimmedMenu}

[작업 지시]
"${trimmedMenu}" 메뉴 1개를 위한 짧은 ${styleHint}용 카피를 생성하세요.
- headline: 메뉴 임팩트가 살아있는 한 문장. 24자 이내. 매장명·메뉴명을 자연스럽게 활용해도 좋음.
- line: 메뉴의 매력(재료/식감/시즌 무드/먹는 순간) + 매장 톤이 살아있는 한 문장. 50~80자.

반드시 다음 JSON 스키마로만 응답:
{"headline":"...","line":"..."}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.75,
      messages: [
        {
          role: 'system',
          content:
            '당신은 외식 프랜차이즈 마케팅 전문 카피라이터입니다. 짧고 임팩트 있는 한국어 메뉴 카피를 매장 톤에 맞춰 작성합니다. 항상 지정된 JSON 스키마로만 응답하세요.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : '';
    const line = typeof parsed.line === 'string' ? parsed.line.trim() : '';

    res.json({
      menu_name: trimmedMenu,
      headline: headline || `${trimmedMenu}, ${client.name}의 추천 한 그릇`,
      line: line || `${client.name}에서 정성껏 준비한 ${trimmedMenu}을(를) 만나보세요.`,
      provider: 'openai gpt-4o-mini',
    });
  } catch (err) {
    console.error('[POST /api/quick-copy] failed:', err);
    res.status(500).json({ ok: false, message: 'failed to generate quick copy' });
  }
});

// 6. Render slides — Playwright HTML→PNG, 5장 PNG 생성
app.post('/api/render-slides', async (req, res) => {
  try {
    const { client_id, copy: copyOverride, image_url: imageOverride, month: monthInput } =
      req.body || {};
    if (!client_id) {
      return res.status(400).json({ ok: false, message: 'client_id is required' });
    }

    const clients = await readClients();
    const client = clients.find((c) => c.id === client_id);
    if (!client) {
      return res.status(404).json({ ok: false, message: 'client not found' });
    }

    // month: 명시 안 되면 가장 최근 campaign 사용
    const campaigns = await readCampaigns();
    let campaign = monthInput ? campaigns.find((c) => c.month === monthInput) : null;
    if (!campaign && campaigns.length > 0) {
      campaign = campaigns
        .slice()
        .sort((a, b) => String(b.month).localeCompare(String(a.month)))[0];
    }
    const month = (campaign && campaign.month) || monthInput || 'no-month';

    const cachedItem =
      campaign && Array.isArray(campaign.items)
        ? campaign.items.find((i) => i.client_id === client_id)
        : null;

    // copy 우선순위: body > campaign 캐시 > 즉석 mock
    const copy =
      (copyOverride && typeof copyOverride === 'object' && copyOverride) ||
      (cachedItem && cachedItem.copy) ||
      generateMockCopy(
        client,
        (campaign && campaign.trends && campaign.trends[client.category]) || []
      );

    // image_url 우선순위: body > campaign 캐시 > null(=Slide1 placeholder)
    const image_url =
      typeof imageOverride === 'string' && imageOverride
        ? imageOverride
        : cachedItem && cachedItem.image_url
        ? cachedItem.image_url
        : null;

    const seasonalForClient =
      (campaign && campaign.seasonal_by_category && campaign.seasonal_by_category[client.category]) || null;

    const slides = await renderClientSlides(
      client,
      copy,
      image_url,
      month,
      seasonalForClient,
      (campaign && campaign.calendar) || null
    );

    await upsertCampaignItem(month, client.id, {
      client_name: client.name,
      category: client.category,
      copy,
      image_url: image_url || (cachedItem && cachedItem.image_url) || null,
      slide_paths: slides.map((s) => s.file),
      rendered_at: new Date().toISOString(),
    });

    res.json({
      client_id,
      client_name: client.name,
      month,
      slides,
    });
  } catch (err) {
    console.error('[POST /api/render-slides] failed:', err);
    res.status(500).json({ ok: false, message: 'failed to render slides' });
  }
});

// 7. Download zip — archiver로 5장 PNG 묶어서 stream
app.get('/api/download-zip/:client_id', async (req, res) => {
  try {
    const { client_id } = req.params;
    const month = (req.query.month || '').toString();

    if (!month) {
      return res.status(400).json({ ok: false, message: 'query param "month" is required' });
    }

    const clients = await readClients();
    const client = clients.find((c) => c.id === client_id);
    if (!client) {
      return res.status(404).json({ ok: false, message: 'client not found' });
    }

    const campaigns = await readCampaigns();
    const campaign = campaigns.find((c) => c.month === month);
    const item =
      campaign && Array.isArray(campaign.items)
        ? campaign.items.find((i) => i.client_id === client_id)
        : null;
    const slidePaths =
      item && Array.isArray(item.slide_paths) && item.slide_paths.length
        ? item.slide_paths
        : null;

    if (!slidePaths || slidePaths.length < 5) {
      return res
        .status(400)
        .json({ ok: false, message: '먼저 슬라이드를 합성하세요 (POST /api/render-slides).' });
    }

    // 모든 PNG 파일 존재 확인
    for (const f of slidePaths) {
      const p = path.join(SLIDES_DIR, f);
      if (!fsSync.existsSync(p)) {
        return res.status(400).json({
          ok: false,
          message: `누락된 PNG: ${f}. 슬라이드를 다시 합성하세요.`,
        });
      }
    }

    // Content-Disposition는 ASCII만 허용 — 한글 파일명은 RFC 5987의 filename*=UTF-8''로,
    // raw filename은 ASCII fallback으로 분리해서 보낸다.
    const safeName = String(client.name).replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ.\- ]+/g, '_');
    const zipName = `${safeName}_${month}.zip`;
    const asciiFallback = `campaign_${client.id}_${month}.zip`;
    const encoded = encodeURIComponent(zipName);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[archiver] error:', err);
      try {
        res.destroy(err);
      } catch (_) {
        /* noop */
      }
    });
    archive.pipe(res);
    for (const f of slidePaths) {
      archive.file(path.join(SLIDES_DIR, f), { name: f });
    }
    await archive.finalize();
  } catch (err) {
    console.error('[GET /api/download-zip/:client_id] failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: 'failed to download zip' });
    }
  }
});

// === Startup ===

async function bootstrap() {
  await ensureSlidesDir();
  // chromium 사전 로드 시도 (실패해도 서버는 뜸)
  try {
    await getBrowser();
    console.log('🎭  chromium ready');
  } catch (err) {
    console.warn('⚠️  chromium launch failed at boot — will retry on demand:', err.message);
    browserPromise = null;
  }
}

async function shutdown(signal) {
  console.log(`\n[${signal}] shutting down...`);
  try {
    if (browserPromise) {
      const b = await browserPromise.catch(() => null);
      if (b) await b.close();
    }
  } catch (err) {
    console.error('[shutdown] browser close failed:', err.message);
  }
  process.exit(0);
}

if (require.main === module) {
  bootstrap().finally(() => {
    app.listen(PORT, () => {
      console.log('🍽️  Menu campaign server running on port ' + PORT);
      console.log('    OpenAI:', openai ? 'enabled (gpt-4o-mini)' : 'disabled (mock fallback)');
      console.log('    fal.ai:', FAL_KEY ? 'enabled (z-image/turbo)' : 'disabled (placeholder)');
    });
  });

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;
