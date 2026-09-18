/* ═══════════════════════════════════════════════════════════
   (주)네오콘크리트 — 관리자 인증 공통 (Cloudflare Pages Functions)
   · 회원가입·유저 테이블 없음. 관리자 1명, 비밀번호는 환경변수 ADMIN_PW
   · 로그인 성공 시 JWT 를 httpOnly 쿠키(neo_admin)에 담아 24시간 유지
   · 외부 패키지 없이 Workers 내장 Web Crypto 로 서명/검증 (npm 설치 불필요)
═══════════════════════════════════════════════════════════ */
const COOKIE = 'neo_admin';
const ALG = { name: 'HMAC', hash: 'SHA-256' };

export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function b64url(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function key(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), ALG, false, ['sign', 'verify']);
}

export async function signToken(payload, secret) {
  const head = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = `${head}.${body}`;
  const sig = await crypto.subtle.sign(ALG, await key(secret), new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

export async function verifyToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const ok = await crypto.subtle.verify(ALG, await key(secret), b64urlToBytes(sig),
    new TextEncoder().encode(`${head}.${body}`));
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;   /* 만료 */
    return payload;
  } catch {
    return null;
  }
}

export function getCookie(request, name = COOKIE) {
  const raw = request.headers.get('Cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setCookieHeader(value, maxAge = 86400) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

export function clearCookieHeader() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

/* 관리자인지 확인 — 아니면 false */
export async function isAdmin(request, env) {
  if (!env.JWT_SECRET) return false;
  const token = getCookie(request);
  if (!token) return false;
  const payload = await verifyToken(token, env.JWT_SECRET);
  return !!(payload && payload.role === 'admin');
}

export function unauthorized() {
  return json({ error: '로그인이 필요합니다' }, { status: 401 });
}
