// Vercel Serverless Function entry
// 루트의 server.js (Express ESM) 를 그대로 핸들러로 재사용한다.
// vercel.json 의 rewrite 가 /api/:path* 를 모두 이 함수로 보냄.
export { default } from '../server.js';
