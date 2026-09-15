import { verifyAuth, json } from '../../_shared/auth.js';

export async function onRequestDelete({ request, env, params }) {
  const ok = await verifyAuth(request, env);
  if (!ok) return json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!env.IMAGES) return json({ error: '이미지 저장소가 아직 설정되지 않았습니다' }, { status: 503 });

  // params.filename의 URL 디코딩 상태가 한글 등 비-ASCII 파일명에서 실제 R2 키와 어긋나는 경우가 확인돼서
  // (예: "스크린샷_....png" 같은 파일은 삭제가 항상 "파일 없음"으로 실패했음),
  // 원본 요청 경로에서 직접 디코딩한 값도 같이 후보로 넣어 맞는 쪽을 찾는다.
  const pathname = new URL(request.url).pathname;
  const rawSegment = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1));
  const candidates = [...new Set([params.filename, rawSegment])];

  let filename = null;
  for (const candidate of candidates) {
    if (candidate && (await env.IMAGES.head(candidate))) { filename = candidate; break; }
  }
  if (!filename) return json({ error: '파일 없음' }, { status: 404 });

  await env.IMAGES.delete(filename);
  return json({ ok: true });
}
