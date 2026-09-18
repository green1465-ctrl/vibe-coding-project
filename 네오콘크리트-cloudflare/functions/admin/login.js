import { json, signToken, setCookieHeader } from '../_shared/auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PW || !env.JWT_SECRET) {
    return json({ error: '서버에 관리자 비밀번호가 설정되지 않았습니다' }, { status: 503 });
  }
  let password = '';
  try { password = (await request.json()).password || ''; } catch { /* 빈 요청 */ }

  if (password !== env.ADMIN_PW) {
    return json({ error: '비밀번호가 올바르지 않습니다' }, { status: 401 });
  }
  const token = await signToken(
    { role: 'admin', exp: Math.floor(Date.now() / 1000) + 86400 },   /* 24시간 */
    env.JWT_SECRET
  );
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', setCookieHeader(token));
  return res;
}
