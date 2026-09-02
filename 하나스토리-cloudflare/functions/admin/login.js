import jwt from '@tsndr/cloudflare-worker-jwt';
import { json, setCookieHeader } from '../_shared/auth.js';

export async function onRequestPost({ request, env }) {
  const { password } = await request.json();
  if (!env.ADMIN_PW || password !== env.ADMIN_PW) {
    return json({ error: '비밀번호가 틀렸습니다' }, { status: 401 });
  }
  const token = await jwt.sign(
    { role: 'admin', exp: Math.floor(Date.now() / 1000) + 86400 },
    env.JWT_SECRET
  );
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', setCookieHeader('hs_admin', token, { secure: true, maxAge: 86400 }));
  return res;
}
