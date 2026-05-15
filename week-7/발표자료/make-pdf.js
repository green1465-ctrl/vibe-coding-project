// 0.png, 0-1.png, 1.png ~ 4.png 를 순서대로 합쳐 발표자료.pdf 생성
const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/lrene/Downloads/0326/week-7/menu/node_modules/playwright');

const dir = __dirname;
const files = ['0.png', '0-1.png', '1.png', '2.png', '3.png', '4.png'];

// 이미지 실제 크기로 PDF 페이지 사이즈를 맞추기 위해 첫 이미지의 dimension 사용
// (모든 이미지가 같은 사이즈라고 가정. 다르면 각 페이지가 첫 이미지 기준으로 fit됨)
async function getImgSize(filePath) {
  // PNG 헤더에서 width/height 읽기 (16~23 byte)
  const buf = fs.readFileSync(filePath);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

(async () => {
  const sizes = files.map((f) => getImgSize(path.join(dir, f)));
  const first = await sizes[0];
  console.log('Using page size:', first);

  const imagesHtml = files
    .map((f) => {
      const absPath = path.join(dir, f).replace(/\\/g, '/');
      return `<div class="page"><img src="file:///${absPath}"/></div>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html><head><style>
  @page { size: ${first.width}px ${first.height}px; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; }
  .page {
    width: ${first.width}px;
    height: ${first.height}px;
    page-break-after: always;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .page:last-child { page-break-after: auto; }
  img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style></head>
<body>
${imagesHtml}
</body></html>`;

  const tmpHtml = path.join(dir, '_tmp.html');
  fs.writeFileSync(tmpHtml, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file:///' + tmpHtml.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');

  const out = path.join(dir, '발표자료.pdf');
  await page.pdf({
    path: out,
    width: `${first.width}px`,
    height: `${first.height}px`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
  });

  await browser.close();
  fs.unlinkSync(tmpHtml);
  console.log('PDF saved:', out);
})();
