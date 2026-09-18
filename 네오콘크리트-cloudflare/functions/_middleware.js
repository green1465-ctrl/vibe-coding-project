/* ═══════════════════════════════════════════════════════════
   공개하면 안 되는 파일 차단
   · Cloudflare Pages 는 폴더를 통째로 올리기 때문에, 설정 파일까지 주소로 열린다.
     (.assetsignore 는 Pages 배포에서는 동작하지 않음 — Workers Assets 전용)
   · Pages Functions 는 정적 파일보다 먼저 실행되므로, 여기서 막으면 확실하다.
   · 새 파일을 프로젝트에 넣을 때 공개용이 아니면 BLOCKED 에 추가할 것.
═══════════════════════════════════════════════════════════ */
const BLOCKED = [
  '/wrangler.toml', '/wrangler.json', '/wrangler.jsonc',
  '/schema.sql',
  '/package.json', '/package-lock.json',
  '/.assetsignore', '/.gitignore', '/.env', '/.dev.vars',
];

/* 확장자만으로도 막는다 — 문서·설정·스크립트는 공개 대상이 아니다 */
const BLOCKED_EXT = /\.(md|toml|sql|py|bak|log|env|vars|pem|key|yml|yaml|ini|sh|bat|ps1)$/i;

/* 인증서·특허는 썸네일(-thumb.jpg)만 공개한다.
   고해상도 원본은 폴더에서 뺐지만, 예전에 올라간 파일이 엣지 캐시(최대 7일)에 남아 있을 수 있어
   주소로도 열리지 않도록 여기서 막는다. 원본을 내려받아 합성하는 것을 막기 위함. */
const CERT_FULL = /^\/images\/certs\/.+\.jpe?g$/i;
function isCertFull(p) { return CERT_FULL.test(p) && !/-thumb\.jpe?g$/i.test(p); }

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  const lower = path.toLowerCase();

  if (BLOCKED.indexOf(lower) >= 0 || BLOCKED_EXT.test(lower) || isCertFull(lower)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return context.next();
}
