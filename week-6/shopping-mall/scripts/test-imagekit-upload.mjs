// ImageKit 업로드 E2E 테스트
// 1) 우리 서버 /api/imagekit/auth 에서 token/expire/signature 받기
// 2) ImageKit Upload API에 1×1 PNG 직접 업로드
// 3) 어떤 응답이 오는지 그대로 출력

const URL = process.argv[2] || 'http://localhost:3300';
const EMAIL = 'test@example.com';
const PASSWORD = 'password123';

// 1×1 transparent PNG
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  console.log('Target:', URL);

  // 1) 로그인
  const loginRes = await fetch(`${URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) throw new Error('login failed: ' + JSON.stringify(loginData));
  const TOKEN = loginData.token;
  console.log('Logged in as:', loginData.user.email, '| role:', loginData.user.role);

  // 2) ImageKit auth params
  const authRes = await fetch(`${URL}/api/imagekit/auth`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const authData = await authRes.json();
  if (!authRes.ok) throw new Error('auth fetch failed: ' + JSON.stringify(authData));
  console.log('\n=== /api/imagekit/auth ===');
  console.log(authData);

  const { token, expire, signature, publicKey, urlEndpoint } = authData;
  console.log('\nDiagnostics:');
  console.log('  token len      =', token?.length, '| token =', token);
  console.log('  expire         =', expire, '| now =', Math.floor(Date.now() / 1000), '| diff(s) =', expire - Math.floor(Date.now() / 1000));
  console.log('  signature len  =', signature?.length);
  console.log('  publicKey      =', publicKey);
  console.log('  urlEndpoint    =', urlEndpoint);

  // 3) Upload (browser와 동일한 방식)
  const fd = new FormData();
  const blob = new Blob([Buffer.from(PNG_BASE64, 'base64')], { type: 'image/png' });
  fd.append('file', blob, 'test.png');
  fd.append('fileName', `test-upload-${Date.now()}.png`);
  fd.append('publicKey', publicKey);
  fd.append('signature', signature);
  fd.append('expire', String(expire));
  fd.append('token', token);
  fd.append('folder', '/products');
  fd.append('useUniqueFileName', 'true');

  console.log('\n=== POST https://upload.imagekit.io/api/v1/files/upload ===');
  const r = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    body: fd,
  });
  console.log('status:', r.status);
  const text = await r.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  console.log('body:', parsed);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
