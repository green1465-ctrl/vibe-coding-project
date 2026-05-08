// === Imports ===
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

// Week 2/3/5 실제 구현용
const { OpenAI } = require('openai');
const { chromium } = require('playwright');
const archiver = require('archiver');

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

// === Middleware ===
app.use(express.json({ limit: '2mb' }));
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

  if (client.category === '한식') {
    copy = {
      headline: `${client.name}, 정성으로 차린 이번 봄의 한 상`,
      slide2: `이번 시즌은 "${trendTitle}"이 화두입니다. ${trendSummary} ${client.name}은 이 흐름을 정중하고 따뜻하게 풀어냈습니다.`,
      slide3: `추천 메뉴 ① ${menu1} — 재료 본연의 맛을 살린, 매일 정성껏 끓여내는 한 그릇.`,
      slide4: `추천 메뉴 ② ${menu2} — 시즌 한정으로 준비한 우리 가게만의 깊은 손맛.`,
      cta: `오늘, ${client.name}에서 따뜻한 한 끼 어떠세요?`,
      source: sourceUrl || `${sourceName}.com`,
    };
  } else if (client.category === '분식') {
    copy = {
      headline: `${client.name} — 이번 시즌, 진심 맛있다`,
      slide2: `요즘 핫한 "${trendTitle}" 흐름! ${trendSummary} ${client.name}이 이 트렌드를 발랄하게 잡아왔어요.`,
      slide3: `추천 메뉴 ① ${menu1} — 한 입이면 행복각, 가격은 착하고 양은 푸짐!`,
      slide4: `추천 메뉴 ② ${menu2} — SNS 인증샷 필수, 친구랑 같이 먹으면 두 배 맛있는 시즌 픽.`,
      cta: `지금 바로 ${client.name}으로 직진!`,
      source: sourceUrl || `${sourceName}.com`,
    };
  } else if (client.category === '카페') {
    copy = {
      headline: `${client.name}, 이 계절을 한 잔에 담다`,
      slide2: `이번 시즌의 키워드 "${trendTitle}". ${trendSummary} ${client.name}은 이 무드를 잔잔하고 트렌디하게 담아냈습니다.`,
      slide3: `시그니처 ① ${menu1} — 향이 먼저 인사하는, 오늘의 무드를 위한 한 잔.`,
      slide4: `시그니처 ② ${menu2} — 사진보다 먼저 마음에 남는 시즌 한정 디저트.`,
      cta: `${client.name}에서, 오늘의 한 잔을 만나보세요.`,
      source: sourceUrl || `${sourceName}.com`,
    };
  } else {
    copy = {
      headline: `${client.name} — 이번 시즌의 새로운 제안`,
      slide2: `이번 달의 흐름: ${trendTitle}. ${trendSummary}`,
      slide3: `추천 ① ${menu1} — 시즌의 무드를 살린 한 메뉴.`,
      slide4: `추천 ② ${menu2} — 함께 즐기면 더 좋은 페어링.`,
      cta: `${client.name}에서 만나보세요.`,
      source: sourceUrl || `${sourceName}.com`,
    };
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
 * 한식·분식·카페 카테고리에 대해 실제 스크래핑 시도 + mock 보강.
 * 카테고리당 timeout은 scrapeFoodbank 내부에서 처리. 전체는 Promise.all.
 */
async function scrapeRealTrends(month) {
  const categories = ['한식', '분식', '카페'];
  // 60초 안전망 — Promise.race로 전체 cap
  const scrapePromise = Promise.all(categories.map((c) => scrapeFoodbank(c)));
  const cap = new Promise((resolve) =>
    setTimeout(() => resolve(categories.map(() => [])), 60000)
  );
  const scraped = await Promise.race([scrapePromise, cap]);

  const mock = generateMockTrends(month);

  const trends = {};
  let liveCount = 0;
  categories.forEach((c, i) => {
    const real = (scraped && scraped[i]) || [];
    liveCount += real.length;
    const mockForC = mock[c] || [];
    // real 우선 + mock 보강해서 최대 3개
    trends[c] = [...real, ...mockForC].slice(0, 3);
  });

  const sources_used =
    liveCount > 0 ? ['foodbank (live)', 'mock'] : ['mock only'];

  return { trends, sources_used, liveCount };
}

// === Real implementations (Week 2/3/5) ===

/**
 * OpenAI gpt-4o-mini로 카드뉴스 5섹션 카피 재창조.
 * 실패 시 generateMockCopy로 fallback.
 */
function buildCopyPrompt(client, categoryTrends) {
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

  return `[클라이언트 정보]
- 매장명: ${client.name}
- 업종: ${client.category}
- 톤앤매너: ${client.tone || '자연스럽고 친근한'}
- 대표 메뉴 키워드: ${menuList}

[이번 시즌 외식 트렌드 (영감용)]
${trendsBlock || '(트렌드 정보 없음)'}

[작업 지시]
위 트렌드를 "복붙하지 말고", ${client.name}의 업종/톤/메뉴 키워드에 맞춰 완전히 재창조한
인스타그램 카드뉴스 5장 분량의 한국어 카피를 작성하세요.
- headline: 1번 슬라이드용. 강력한 한 문장. 30자 이내.
- slide2: 2번 시즌 인사이트. 80~120자.
- slide3: 3번 추천 메뉴 ①. 메뉴 키워드 중 하나를 골라 매력적으로 묘사. 80~120자.
- slide4: 4번 추천 메뉴 ② 또는 마케팅 포인트. 다른 메뉴 키워드 또는 시즌 셀링포인트. 80~120자.
- cta: 5번 마지막 슬라이드 CTA. 1~2문장, 행동 유도형.
- source: 위 트렌드 중 가장 영향을 준 1개의 source_url을 그대로 그 URL 문자열로 적기.

반드시 다음 JSON 스키마로만 응답:
{"headline":"...","slide2":"...","slide3":"...","slide4":"...","cta":"...","source":"https://..."}`;
}

async function generateRealCopy(client, categoryTrends) {
  if (!openai) return generateMockCopy(client, categoryTrends);

  try {
    const prompt = buildCopyPrompt(client, categoryTrends);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            '당신은 외식 프랜차이즈 마케팅 전문 카피라이터입니다. 한국어로, 매장의 톤앤매너에 정확히 맞춰, 트렌드를 복사하지 않고 매장만의 언어로 재창조한 카피를 씁니다. 항상 지정된 JSON 스키마로만 응답하세요.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    // 필수 필드 검증 — 누락 시 fallback
    const required = ['headline', 'slide2', 'slide3', 'slide4', 'cta'];
    for (const k of required) {
      if (typeof parsed[k] !== 'string' || !parsed[k].trim()) {
        console.warn('[generateRealCopy] missing field:', k, '— falling back to mock');
        return generateMockCopy(client, categoryTrends);
      }
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

/**
 * fal.ai Z-Image Turbo로 음식 이미지 생성.
 * 실패 시 null 반환 (Slide 1은 회색 placeholder fallback).
 */
async function generateFoodImage(client, copy) {
  if (!FAL_KEY) {
    console.warn('[generateFoodImage] FAL_KEY missing — skip image generation');
    return null;
  }

  const menuKeywords =
    Array.isArray(client.menu_keywords) && client.menu_keywords.length
      ? client.menu_keywords.slice(0, 3).join(', ')
      : '';
  const headlineHint = copy && copy.headline ? copy.headline.slice(0, 40) : '';

  const prompt = `Korean ${client.category} food photography, ${menuKeywords}${
    headlineHint ? ', mood: ' + headlineHint : ''
  }, professional restaurant menu shot, top-down or 45-degree angle, appetizing, vivid natural colors, soft warm lighting, clean composition, no text, no watermark, 1:1 square aspect ratio`;

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
        num_inference_steps: 4,
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

async function renderClientSlides(client, copy, image_url, month) {
  await ensureSlidesDir();

  const baseParams = {
    category: client.category,
    client_name: client.name,
    headline: copy.headline || '',
    slide2: copy.slide2 || '',
    slide3: copy.slide3 || '',
    slide4: copy.slide4 || '',
    cta: copy.cta || '',
    source: copy.source || '',
    image_url: image_url || '',
  };

  const results = [];
  for (let n = 1; n <= 5; n++) {
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
  });
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

    if (useLive) {
      try {
        const result = await scrapeRealTrends(month);
        trends = result.trends;
        sources_used = result.sources_used;
      } catch (err) {
        console.error('[collect-trends] live scrape failed, fallback to mock:', err.message);
        trends = generateMockTrends(month);
        sources_used = ['mock only (scrape error)'];
      }
    } else {
      trends = generateMockTrends(month);
      sources_used = ['mock only (forced)'];
    }

    const campaigns = await readCampaigns();
    const idx = campaigns.findIndex((c) => c.month === month);

    const next = {
      id: month,
      month,
      collected_at: new Date().toISOString(),
      trends,
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

    const copy = await generateRealCopy(client, categoryTrends);

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

    const image_url = await generateFoodImage(client, copy);

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

    const slides = await renderClientSlides(client, copy, image_url, month);

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
