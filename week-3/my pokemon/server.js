// ========================================
// Pokemon REST API Server (zero-dependency)
// ========================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;

// ========================================
// Pokemon Data (mirrors index.html shape)
// ========================================
const POKEMONS = [
  {
    id: 25,
    nameKo: '피카츄',
    nameEn: 'Pikachu',
    types: ['전기'],
    description: '쥐 포켓몬. 볼에 있는 주머니에 전기를 모아두며, 놀라거나 화가 나면 방전한다.',
    stats: { HP: 35, 공격: 55, 방어: 40, 스피드: 90 },
    imageUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
  },
  {
    id: 6,
    nameKo: '리자몽',
    nameEn: 'Charizard',
    types: ['불꽃', '비행'],
    description: '화염 포켓몬. 화산처럼 뜨거운 불꽃을 뿜어내며 하늘을 우아하게 비행한다.',
    stats: { HP: 78, 공격: 84, 방어: 78, 스피드: 100 },
    imageUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png',
  },
  {
    id: 1,
    nameKo: '이상해씨',
    nameEn: 'Bulbasaur',
    types: ['풀', '독'],
    description: '씨앗 포켓몬. 태어났을 때부터 등에 식물의 씨앗이 있으며 조금씩 자라난다.',
    stats: { HP: 45, 공격: 49, 방어: 49, 스피드: 45 },
    imageUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
  },
  {
    id: 7,
    nameKo: '꼬부기',
    nameEn: 'Squirtle',
    types: ['물'],
    description: '꼬마거북 포켓몬. 단단한 등껍질로 몸을 보호하며 입에서 강력한 물을 뿜는다.',
    stats: { HP: 44, 공격: 48, 방어: 65, 스피드: 43 },
    imageUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png',
  },
  {
    id: 150,
    nameKo: '뮤츠',
    nameEn: 'Mewtwo',
    types: ['에스퍼'],
    description: '유전자 포켓몬. 유전자 조작으로 탄생했으며, 가장 잔인한 마음을 가진 포켓몬으로 전해진다.',
    stats: { HP: 106, 공격: 110, 방어: 90, 스피드: 130 },
    imageUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/150.png',
  },
];

// ========================================
// Helpers
// ========================================
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function sendJson(res, status, payload) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
  return status;
}

function sendNotFound(res, message = 'Not found') {
  return sendJson(res, 404, { error: message });
}

function serveIndexHtml(res) {
  const filePath = path.join(__dirname, 'index.html');
  try {
    const html = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return 200;
  } catch (err) {
    res.writeHead(500, JSON_HEADERS);
    res.end(JSON.stringify({ error: 'Failed to read index.html' }));
    return 500;
  }
}

// ========================================
// Router
// ========================================
function route(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';
  const method = req.method || 'GET';

  // Only GET supported
  if (method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // Root → index.html
  if (pathname === '/' || pathname === '/index.html') {
    return serveIndexHtml(res);
  }

  // GET /api/pokemon/search?q=...
  if (pathname === '/api/pokemon/search') {
    const q = (parsed.query.q || '').toString().trim().toLowerCase();
    if (!q) return sendJson(res, 200, POKEMONS);
    const results = POKEMONS.filter(
      (p) =>
        p.nameKo.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q)
    );
    return sendJson(res, 200, results);
  }

  // GET /api/pokemon
  if (pathname === '/api/pokemon') {
    return sendJson(res, 200, POKEMONS);
  }

  // GET /api/pokemon/:id
  const idMatch = pathname.match(/^\/api\/pokemon\/(\d+)$/);
  if (idMatch) {
    const id = Number(idMatch[1]);
    const pokemon = POKEMONS.find((p) => p.id === id);
    if (!pokemon) return sendJson(res, 404, { error: 'Pokemon not found' });
    return sendJson(res, 200, pokemon);
  }

  // Fallback 404
  return sendNotFound(res, 'Route not found');
}

// ========================================
// Server
// ========================================
const server = http.createServer((req, res) => {
  let status = 200;
  try {
    status = route(req, res) || res.statusCode || 200;
  } catch (err) {
    status = 500;
    if (!res.headersSent) {
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
  console.log(`[${req.method}] ${req.url} ${status}`);
});

server.listen(PORT, () => {
  console.log(`Pokemon server running on http://localhost:${PORT}`);
});
