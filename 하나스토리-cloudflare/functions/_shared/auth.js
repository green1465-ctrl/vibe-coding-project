import jwt from '@tsndr/cloudflare-worker-jwt';

export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCookieHeader(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (opts.secure) parts.push('Secure');
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join('; ');
}

export function clearCookieHeader(name) {
  return `${name}=; Path=/; Max-Age=0`;
}

export async function verifyAuth(request, env) {
  const token = getCookie(request, 'hs_admin');
  if (!token) return false;
  try {
    return !!(await jwt.verify(token, env.JWT_SECRET));
  } catch {
    return false;
  }
}
