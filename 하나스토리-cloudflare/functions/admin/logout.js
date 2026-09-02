import { json, clearCookieHeader } from '../_shared/auth.js';

export async function onRequestPost() {
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', clearCookieHeader('hs_admin'));
  return res;
}
