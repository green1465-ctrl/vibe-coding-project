#!/usr/bin/env node
// 재료 폴더를 스캔해 요약 출력
// 사용: node list-ingredients.js <폴더경로>

const fs = require('fs');
const path = require('path');

const folder = process.argv[2] || 'week-4/냉장고재료json폴더';

if (!fs.existsSync(folder)) {
  console.error(`폴더를 찾을 수 없습니다: ${folder}`);
  process.exit(1);
}

const files = fs.readdirSync(folder).filter(f => f.endsWith('.json'));

if (files.length === 0) {
  console.log(`${folder}에 .json 파일이 없습니다.`);
  process.exit(0);
}

const items = files.map(f => {
  const data = JSON.parse(fs.readFileSync(path.join(folder, f), 'utf-8'));
  return data;
});

// 유통기한 기준으로 정렬 (짧은 것이 위)
items.sort((a, b) => (a.storage?.shelfLife ?? 999) - (b.storage?.shelfLife ?? 999));

console.log(`재료 ${items.length}개 발견:\n`);
for (const item of items) {
  const shelf = item.storage?.shelfLife;
  const shelfUnit = item.storage?.shelfLifeUnit ?? '일';
  const warn = shelf && shelf <= 7 ? ' ← 유통기한 짧음' : '';
  const weight = item.averageWeight ? `, ${item.averageWeight}${item.weightUnit ?? 'g'}` : '';
  console.log(`- ${item.name} (${item.category}${weight}, ${shelf}${shelfUnit})${warn}`);
}

// 카테고리별 집계
const byCategory = items.reduce((acc, it) => {
  acc[it.category] = (acc[it.category] ?? 0) + 1;
  return acc;
}, {});

console.log('\n카테고리별 분포:');
for (const [cat, n] of Object.entries(byCategory)) {
  console.log(`  ${cat}: ${n}개`);
}
