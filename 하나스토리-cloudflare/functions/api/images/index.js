import { verifyAuth, json } from '../../_shared/auth.js';

export async function onRequestGet({ request, env }) {
  const ok = await verifyAuth(request, env);
  if (!ok) return json({ error: '로그인이 필요합니다' }, { status: 401 });

  if (!env.IMAGES) return json([]);

  const listed = await env.IMAGES.list({ limit: 200 });
  const files = listed.objects
    .sort((a, b) => b.uploaded - a.uploaded)
    .map(o => ({
      filename: o.key,
      path: `${env.R2_PUBLIC_URL}/${o.key}`,
      size: o.size,
      mtime: new Date(o.uploaded).getTime(),
    }));
  return json(files);
}
