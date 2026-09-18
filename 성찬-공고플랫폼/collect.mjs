/**
 * 기업마당 공고 수집 · 분석 · 분류
 *
 *   npm run collect
 *
 * 1) 기업마당 API로 공고 목록을 받는다
 * 2) 본문 PDF를 내려받아 제출서류 구간의 텍스트를 추출한다
 *    (API는 제출서류를 주지 않는다 — 인증 단서 대부분이 PDF 안에 있다)
 * 3) 인증 매칭 규칙을 돌려 public/data.json 으로 저장한다
 *
 * PDF는 pdf-cache/ 에 캐시하므로 두 번째 실행부터는 새 공고만 내려받는다.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchCertifications } from "./src/certifications.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dir, "pdf-cache");
const OUT = path.join(__dir, "public", "data.json");

/* ---------- 설정 ---------- */
const COUNT = Number(process.env.COUNT || 300); // 한 번에 받아올 공고 수
/* 새로 내려받을 문서 수 상한. 이미 캐시된 문서는 여기에 포함되지 않는다
   (캐시 읽기는 비용이 없으므로 항상 전부 처리한다) */
const MAX_PDF = Number(process.env.MAX_PDF || 250);
const PDF_PAGES = 25; // PDF 앞에서 몇 페이지까지 읽을지

function loadKey() {
  if (process.env.BIZINFO_KEY) return process.env.BIZINFO_KEY;
  const f = path.join(__dir, ".dev.vars");
  if (fs.existsSync(f)) {
    const m = fs.readFileSync(f, "utf-8").match(/^\s*BIZINFO_KEY\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim();
  }
  console.error("인증키가 없습니다. .dev.vars 에 BIZINFO_KEY=... 를 넣어주세요.");
  process.exit(1);
}

const strip = (s) =>
  String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

/* 신청기간 → 종료일. "예산 소진시까지" 같은 자유 텍스트는 상시로 본다 */
function parsePeriod(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/(\d{4})[-.]?(\d{2})[-.]?(\d{2})\s*~\s*(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
  if (m) {
    return {
      start: `${m[1]}-${m[2]}-${m[3]}`,
      end: `${m[4]}-${m[5]}-${m[6]}`,
      rolling: false,
      raw: s,
    };
  }
  return { start: null, end: null, rolling: true, raw: s || "상시" };
}

/**
 * PDF를 읽을 가치가 있는 공고인지 판단한다.
 *
 * 실측 근거(PDF 60건 분석):
 *   지원대상 중소기업 60% / 창업벤처 67% / 소상공인 18%
 *   분야    창업 100% / 수출 71% / 기술 64% / 내수 14%
 *
 * 소상공인은 애초에 기업인증 대상이 아니라서 읽어도 대부분 허탕이다.
 * 반환값이 0이면 건너뛴다.
 */
const HIGH_FIELDS = ["기술", "수출", "창업", "금융"];
function pdfPriority(r, closed) {
  if (closed || !r.printFlpthNm) return 0;

  const target = String(r.trgetNm || "");
  const field = String(r.pldirSportRealmLclasCodeNm || "");
  const isBiz = /중소기업|중견기업|창업|벤처|기업/.test(target);
  const onlyMicro = /소상공인/.test(target) && !/중소기업|중견기업/.test(target);

  if (onlyMicro) return 0;            // 소상공인 전용 — 적중률 18%
  if (!isBiz) return 1;               // 대상이 애매하면 후순위로만
  if (HIGH_FIELDS.includes(field)) return 3;
  return 2;
}

/* ---------- 공고 본문 추출 (PDF / HWPX) ----------
   기업마당 본문파일은 PDF 65% · HWPX 23% · HWP 13% 로 섞여 있다.
   HWPX 는 ZIP + XML 이라 그대로 읽을 수 있다.
   구형 HWP(바이너리)는 아직 미지원 — 전체의 13% 정도다. */
let pdfjs = null, fflate = null;

async function extractPdf(buf) {
  pdfjs ||= await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: buf, useSystemFonts: true, verbosity: 0 }).promise;
  let txt = "";
  for (let i = 1; i <= Math.min(PDF_PAGES, doc.numPages); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    txt += c.items.map((x) => x.str).join(" ") + "\n";
  }
  return txt;
}

async function extractHwpx(buf) {
  fflate ||= await import("fflate");
  const files = fflate.unzipSync(buf);
  const dec = new TextDecoder("utf-8");
  let txt = "";
  /* Contents/section0.xml, section1.xml ... 순서대로 */
  const names = Object.keys(files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => (a.match(/\d+/)?.[0] | 0) - (b.match(/\d+/)?.[0] | 0));
  for (const n of names) {
    const xml = dec.decode(files[n]);
    /* <hp:t> 안의 글자만 뽑는다 */
    for (const m of xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)) {
      txt += m[1].replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&").replace(/&quot;/g, '"') + " ";
    }
    txt += "\n";
  }
  return txt;
}

/** 확장자·매직넘버로 형식을 판별해 텍스트를 뽑는다 */
async function docText(url, id, fileName) {
  if (!url) return "";
  fs.mkdirSync(CACHE, { recursive: true });
  const cached = path.join(CACHE, `${id}.txt`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf-8");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 1000) throw new Error("파일이 너무 작음");

    const isPdf = buf[0] === 0x25 && buf[1] === 0x50; // %P
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // PK (hwpx/docx)
    let txt = "";
    if (isPdf) txt = await extractPdf(buf);
    else if (isZip) txt = await extractHwpx(buf);
    else throw new Error("지원하지 않는 형식(구형 HWP 등): " + (fileName || ""));

    fs.writeFileSync(cached, txt, "utf-8");
    return txt;
  } catch (e) {
    fs.writeFileSync(cached, "", "utf-8"); // 실패도 캐시해서 매번 재시도하지 않는다
    return "";
  }
}

/* ---------- 실행 ---------- */
const key = loadKey();
const api = `https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=${encodeURIComponent(key)}&dataType=json&searchCnt=${COUNT}`;

console.log(`기업마당 공고 ${COUNT}건 요청 중...`);
const res = await fetch(api, { signal: AbortSignal.timeout(60000) });
if (!res.ok) { console.error("API 호출 실패: HTTP " + res.status); process.exit(1); }
const json = await res.json();
if (json.reqErr) { console.error("API 오류: " + json.reqErr); process.exit(1); }

const raw = json.jsonArray || [];
console.log(`받은 공고: ${raw.length}건 (기업마당 전체 ${raw[0]?.totCnt ?? "?"}건)`);

const today = new Date(); today.setHours(0, 0, 0, 0);

/* 1차: API 텍스트만으로 전부 매칭하고, PDF를 읽을 대상만 골라둔다 */
const prepared = raw.map((r) => {
  const period = parsePeriod(r.reqstBeginEndDe);
  const closed = !!(period.end && new Date(period.end) < today);
  const baseText = [r.pblancNm, strip(r.bsnsSumryCn), r.trgetNm, r.hashtags, r.reqstMthPapersCn].join("\n");
  return {
    r, period, closed,
    certs: matchCertifications(baseText).map((c) => ({ ...c, source: "공고 본문" })),
    prio: pdfPriority(r, closed),
  };
});

/* 캐시된 문서는 비용이 없으니 전부 읽고, 새로 내려받는 건만 MAX_PDF 로 제한한다 */
const isCached = (id) => fs.existsSync(path.join(CACHE, `${id}.txt`));
const candidates = prepared.filter((p) => p.prio > 0).sort((a, b) => b.prio - a.prio);
const cachedOnes = candidates.filter((p) => isCached(p.r.pblancId));
const freshOnes = candidates.filter((p) => !isCached(p.r.pblancId)).slice(0, MAX_PDF);
const queue = [...cachedOnes, ...freshOnes];
const skipped = prepared.filter((p) => p.prio === 0).length;
console.log(
  `문서 분석 대상 ${queue.length}건 (캐시 ${cachedOnes.length} + 신규 다운로드 ${freshOnes.length})` +
  ` / 건너뜀 ${skipped}건(소상공인 전용·마감·첨부없음)`
);

let pdfUsed = 0, pdfHit = 0;
for (const [i, p] of queue.entries()) {
  const txt = await docText(p.r.printFlpthNm, p.r.pblancId, p.r.printFileNm);
  if (!txt) continue;
  pdfUsed++; p.usedPdf = true;
  const pdfCerts = matchCertifications(txt).map((c) => ({ ...c, source: "첨부파일 제출서류" }));
  const seen = new Map(p.certs.map((c) => [c.id, c]));
  for (const c of pdfCerts) {
    const prev = seen.get(c.id);
    if (!prev || c.score > prev.score) seen.set(c.id, c); /* PDF 단서가 더 강하면 교체 */
  }
  const merged = [...seen.values()];
  if (merged.length > p.certs.length) pdfHit++;
  p.certs = merged.sort((a, b) => b.score - a.score);
  if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${queue.length} 분석`);
}

const out = [];
for (const { r, period, closed, certs, usedPdf } of prepared) {
  out.push({
    pblancId: r.pblancId,
    title: r.pblancNm,
    author: r.jrsdInsttNm || "-",
    excInsttNm: r.excInsttNm || "-",
    lcategory: r.pldirSportRealmLclasCodeNm || "기타",
    programType: r.pldirSportRealmMlsfcCodeNm || "기타",
    reqstDt: period.raw,
    periodStart: period.start,
    periodEnd: period.end,
    rolling: period.rolling,
    closed: !!closed,
    trgetNm: r.trgetNm || "-",
    description: strip(r.bsnsSumryCn).slice(0, 600),
    applyMethod: strip(r.reqstMthPapersCn),
    contact: r.refrncNm || "",
    link: r.pblancUrl,
    hasAttachment: !!r.flpthNm,
    pdfScanned: !!usedPdf,
    regDate: (r.creatPnttm || "").slice(0, 10),
    certifications: certs,
  });
}

const payload = { collectedAt: new Date().toISOString(), items: out };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 1), "utf-8");
/* index.html 을 서버 없이 더블클릭으로 열 수 있도록 스크립트 형태로도 내보낸다
   (file:// 에서는 fetch 가 막힌다) */
fs.writeFileSync(
  path.join(__dir, "public", "data.js"),
  "window.COLLECTED = " + JSON.stringify(payload) + ";\n",
  "utf-8"
);

const confirmed = out.filter((a) => a.certifications.some((c) => c.confidence === "confirmed"));
const anyHit = out.filter((a) => a.certifications.length);
console.log(`
저장 완료: public/data.json
  전체 공고        ${out.length}건
  단서 탐지        ${anyHit.length}건 (${Math.round(anyHit.length / out.length * 100)}%)
  확정(●) 포함     ${confirmed.length}건 (${Math.round(confirmed.length / out.length * 100)}%)
  PDF 확인         ${pdfUsed}건, 그중 ${pdfHit}건에서 추가 단서 발견`);
