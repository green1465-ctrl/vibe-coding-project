// 1920×1080 PNG 캡처 — `node capture.js index.html thumbnail.png` 형태로 사용
// 인자 없으면 index.html → thumbnail.png 기본
const { chromium } = require('C:/Users/lrene/Downloads/0326/week-6/menu/node_modules/playwright');
const path = require('path');

const inFile = process.argv[2] || 'index.html';
const outFile = process.argv[3] || inFile.replace(/\.html$/, '.png');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2, // retina 품질
  });
  const page = await ctx.newPage();
  const file = path.resolve(__dirname, inFile).replace(/\\/g, '/');
  await page.goto('file:///' + file, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const out = path.resolve(__dirname, outFile);
  const el = await page.$('#thumbnail');
  if (el) {
    // animations: 'disabled' — CSS animation·transition 중단 후 첫 프레임으로 리셋
    await el.screenshot({ path: out, omitBackground: false, animations: 'disabled' });
  } else {
    await page.screenshot({
      path: out,
      fullPage: false,
      clip: { x: 0, y: 0, width: 1920, height: 1080 },
      omitBackground: false,
      animations: 'disabled',
    });
  }
  await ctx.close();
  await browser.close();
  console.log('saved:', out);
})();
