// Use puppeteer if available, fall back to playwright
const fs = require('fs');
const path = require('path');

(async () => {
  let chromium;
  try {
    chromium = require('playwright').chromium;
  } catch {
    try {
      chromium = require('puppeteer');
    } catch {
      console.error('Neither playwright nor puppeteer available');
      process.exit(1);
    }
  }
  const url = process.argv[2];
  const out = process.argv[3];
  const w = parseInt(process.argv[4] || '794');
  const h = parseInt(process.argv[5] || '1123');
  const scale = parseFloat(process.argv[6] || '2');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: scale,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  // strip body chrome
  await page.addStyleTag({ content: `
    html,body { background: transparent !important; margin:0 !important; }
    .page,.poster { margin: 0 !important; box-shadow: none !important; }
  ` });
  await page.waitForTimeout(500);
  await page.screenshot({ path: out, fullPage: false, clip: { x:0, y:0, width:w, height:h } });
  console.log('saved', out);
  await browser.close();
})();
