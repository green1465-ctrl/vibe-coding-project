import { json, isAdmin, unauthorized } from '../../_shared/auth.js';

/* 관리자 화면에서 "이미 올린 파일"을 고르거나 지울 수 있도록 목록을 준다 */
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return unauthorized();
  if (!env.FILES) return json([]);

  const prefix = new URL(request.url).searchParams.get('kind');
  const listed = await env.FILES.list({
    limit: 1000,
    prefix: ['files', 'gallery', 'notices', 'certs'].indexOf(prefix) >= 0 ? prefix + '/' : undefined,
  });
  const base = (env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return json(listed.objects
    .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded))
    .map(o => ({ key: o.key, url: `${base}/${o.key}`, size: o.size, uploaded: o.uploaded })));
}

/* 파일 삭제 — 한글 파일명도 확실히 지워지도록 요청 주소에서 직접 디코딩한 값을 함께 확인한다 */
export async function onRequestDelete({ request, env }) {
  if (!(await isAdmin(request, env))) return unauthorized();
  if (!env.FILES) return json({ error: '파일 저장소가 연결되지 않았습니다' }, { status: 503 });

  const url = new URL(request.url);
  const raw = url.searchParams.get('key') || '';
  const candidates = [...new Set([raw, decodeURIComponent(raw)])].filter(Boolean);

  for (const key of candidates) {
    if (await env.FILES.head(key)) {
      await env.FILES.delete(key);
      return json({ ok: true });
    }
  }
  return json({ ok: true, missing: true });   /* 이미 없는 파일은 성공으로 본다 */
}
