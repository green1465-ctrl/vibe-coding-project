/**
 * 행정사 업무 매칭 규칙
 *
 * 기업마당 공고(제목 + 사업개요 + 지원대상 + 첨부파일 본문)에서
 * 김성찬 행정사가 대리·대행할 수 있는 인허가·인증 항목을 탐지한다.
 *
 * 매칭 강도
 *   strong : 이 표현이 나오면 해당 인증이 필요하다고 봐도 되는 단서
 *            (제출서류 목록에 실제로 적히는 정식 명칭)
 *   weak   : 가능성 신호. 단독으로는 확정하지 않고 점수만 올린다
 *            (사업 성격상 그 인증을 가진 기업이 유리하거나 가점 대상)
 *
 * 판정
 *   strong 1개 이상            → confirmed (확정)
 *   weak 2개 이상              → likely    (가능성 높음)
 *   weak 1개                   → possible  (검토 필요)
 */

export const CERTIFICATIONS = [
  {
    id: "mainbiz",
    name: "메인비즈인증",
    formal: "경영혁신형 중소기업 확인서",
    category: "기업인증",
    strong: ["메인비즈", "MAIN-BIZ", "MAINBIZ", "경영혁신형 중소기업", "경영혁신형중소기업"],
    weak: ["경영혁신", "혁신형 중소기업", "혁신형중소기업"],
    note: "가점 항목으로 자주 등장. 이노비즈와 함께 묶여 나오는 경우가 많다",
  },
  {
    id: "innobiz",
    name: "이노비즈인증",
    formal: "기술혁신형 중소기업 확인서",
    category: "기업인증",
    strong: ["이노비즈", "INNO-BIZ", "INNOBIZ", "기술혁신형 중소기업", "기술혁신형중소기업"],
    weak: ["기술혁신", "혁신형 중소기업", "혁신형중소기업"],
    note: "기술 분야(searchLclasId=02) 공고에서 가점으로 빈번",
  },
  {
    id: "family_friendly",
    name: "가족친화인증",
    formal: "가족친화기업 인증",
    category: "기업인증",
    strong: ["가족친화인증", "가족친화 인증", "가족친화기업"],
    weak: ["일·가정 양립", "일가정 양립", "가족친화"],
    note: "여성가족부 인증. 인력 분야(03) 공고와 조달 가점에 등장",
  },
  {
    id: "gpass",
    name: "G-PASS인증",
    formal: "해외조달시장 진출 유망기업(G-PASS) 지정",
    category: "기업인증",
    strong: ["G-PASS", "G PASS", "지패스", "해외조달시장 진출 유망기업"],
    weak: ["해외조달", "조달청 해외", "해외 공공조달"],
    note: "수출 분야(04) 공고 핵심. 조달청 지정",
  },
  {
    id: "food_manufacture",
    name: "식품제조가공업",
    formal: "식품제조·가공업 영업등록",
    category: "인허가",
    strong: ["식품제조가공업", "식품제조·가공업", "식품제조 가공업", "영업등록증", "식품영업등록"],
    weak: ["식품 제조", "가공식품", "식품위생법"],
    note: "식품 관련 공고의 기본 자격요건. 등록 없으면 신청 자체가 불가",
  },
  {
    id: "haccp",
    name: "HACCP",
    formal: "식품안전관리인증(HACCP)",
    category: "인허가",
    strong: ["HACCP", "해썹", "식품안전관리인증"],
    weak: ["위해요소 중점관리", "안전관리인증"],
    note: "식품제조가공업과 세트로 요구되는 경우가 많다",
  },
  {
    id: "ppuri",
    name: "뿌리기업확인",
    formal: "뿌리기업 확인서",
    category: "기업인증",
    strong: ["뿌리기업", "뿌리산업", "뿌리기술"],
    weak: ["주조", "금형", "소성가공", "용접", "표면처리", "열처리"],
    note: "weak 키워드는 뿌리산업 6대 기술. 단독 등장 시 오탐 가능",
  },
  {
    id: "sobujang",
    name: "소부장확인서",
    formal: "소재·부품·장비 전문기업 확인서",
    category: "기업인증",
    strong: ["소부장 전문기업", "소부장전문기업", "소재·부품·장비 전문기업", "소부장 확인서"],
    weak: ["소부장", "소재부품장비", "소재·부품·장비", "공급망 안정"],
    note: "문서에 실린 실제 사례. 소부장넷에서 발급",
  },
  {
    id: "venture",
    name: "벤처기업확인서",
    formal: "벤처기업 확인서",
    category: "기업인증",
    strong: ["벤처기업 확인", "벤처기업확인", "벤처확인", "벤처기업 확인서"],
    weak: ["벤처인증", "벤처기업육성"],
    note: "실제 100건 검증 시 '벤처기업'만으로는 18건 과탐 — weak에서 제외함",
  },
  {
    id: "research_institute",
    name: "기업부설연구소",
    formal: "기업부설연구소 인정서",
    category: "기업인증",
    strong: ["기업부설연구소", "연구소 인정서", "부설연구소"],
    weak: ["연구개발 조직", "R&D 조직", "연구인력"],
    note: "R&D 과제 공고의 사실상 필수. KOITA 인정",
  },
  {
    id: "rnd_department",
    name: "연구개발전담부서",
    formal: "연구개발전담부서 인정서",
    category: "기업인증",
    strong: ["연구개발전담부서", "연구개발 전담부서", "전담부서 인정"],
    weak: ["전담부서", "연구전담"],
    note: "기업부설연구소보다 요건이 낮은 대안. 함께 검토",
  },
  {
    id: "woman_biz",
    name: "여성기업확인서",
    formal: "여성기업 확인서",
    category: "기업인증",
    strong: ["여성기업 확인", "여성기업확인"],
    weak: ["여성기업", "여성CEO", "여성 대표"],
    note: "여성기업 전용 공고 + 일반 공고 가점 양쪽에 등장",
  },
  {
    id: "factory_reg",
    name: "공장등록",
    formal: "공장등록증명서",
    category: "인허가",
    strong: ["공장등록증", "공장등록증명", "공장 등록증"],
    weak: ["공장등록", "제조시설", "생산시설 보유"],
    note: "제조업 대상 공고의 기본 증빙",
  },
  {
    id: "direct_production",
    name: "직접생산확인증명서",
    formal: "직접생산 확인증명서",
    category: "인허가",
    strong: ["직접생산확인증명", "직접생산 확인증명", "직접생산증명"],
    weak: ["직접생산", "직접 생산 확인"],
    note: "공공조달 참여의 필수 증빙. 중소기업유통센터 발급",
  },
  {
    id: "business_plan",
    name: "사업계획서 작성",
    formal: "사업계획서 작성 대행",
    category: "서류작성",
    strong: ["사업계획서", "사업계획 제출", "신청서 및 사업계획"],
    weak: ["계획서 제출", "추진계획", "사업 신청서"],
    note: "거의 모든 지원사업에 해당. 행정사 주력 업무",
  },
];

/** 공고 유형 분류 — 문서의 “지원사업 / 정책자금 / 지원금” 구분 */
export const PROGRAM_TYPES = [
  { id: "policy_fund", name: "정책자금", keywords: ["융자", "대출", "정책자금", "이차보전", "보증", "운전자금", "시설자금"] },
  { id: "subsidy",     name: "지원금",   keywords: ["보조금", "지원금", "바우처", "지급", "장려금", "환급"] },
  { id: "rnd",         name: "R&D과제",  keywords: ["연구개발", "R&D", "기술개발", "과제", "실증"] },
  { id: "support",     name: "지원사업",  keywords: ["지원사업", "육성", "컨설팅", "교육", "멘토링", "판로"] },
];

const norm = (s) => String(s || "").replace(/\s+/g, " ").toLowerCase();

/**
 * 인증서 이름이 나왔다고 다 업무 기회는 아니다.
 * 아래 문맥에서 나오면 "소재지·자격을 확인하는 수단"으로 쓰인 것이라 제외한다.
 *
 * 실제 오탐 사례:
 *   "사업자등록증 또는 공장등록증 중 하나라도 경기도에 소재한 기업"
 *   → 사업자등록증만 있어도 되므로 공장등록 대행 수요가 아니다
 */
const NEGATIVE_CONTEXT = [
  /또는[^.]{0,20}중\s*하나/,      // "A 또는 B 중 하나"
  /소재(지|한|하는)?/,             // 소재지 요건
  /주소(지)?[가를]/,
  /본사[가를]/,
  /이전\s*시/,
  /기\s*보유/,                     // "이미 보유한 기업" — 신규 발급 수요 아님
];

/** 매칭된 키워드 주변 문맥을 잘라낸다 */
function windows(hay, keyword, span = 70) {
  const k = norm(keyword);
  const out = [];
  let i = hay.indexOf(k);
  while (i >= 0 && out.length < 5) {
    out.push(hay.slice(Math.max(0, i - span), i + k.length + span));
    i = hay.indexOf(k, i + 1);
  }
  return out;
}

/** 해당 키워드가 전부 부정 문맥에서만 등장했는가 */
function onlyNegative(hay, keywords) {
  let sawAny = false;
  for (const k of keywords) {
    for (const w of windows(hay, k)) {
      sawAny = true;
      if (!NEGATIVE_CONTEXT.some((re) => re.test(w))) return false; // 긍정 문맥이 하나라도 있으면 통과
    }
  }
  return sawAny;
}

/** 본문에서 인증 단서를 찾아 점수와 함께 돌려준다 */
export function matchCertifications(text) {
  const hay = norm(text);
  const hits = [];

  for (const cert of CERTIFICATIONS) {
    const strong = cert.strong.filter((k) => hay.includes(norm(k)));
    const weak = cert.weak.filter((k) => hay.includes(norm(k)));
    if (!strong.length && !weak.length) continue;

    let confidence = "possible";
    if (strong.length) confidence = "confirmed";
    else if (weak.length >= 2) confidence = "likely";

    /* 자격·소재지 확인용으로만 언급됐다면 확정에서 내린다 */
    let demoted = false;
    if (confidence === "confirmed" && onlyNegative(hay, strong)) {
      confidence = "possible";
      demoted = true;
    }

    hits.push({
      id: cert.id,
      name: cert.name,
      formal: cert.formal,
      category: cert.category,
      confidence,
      score: (demoted ? 1 : strong.length * 10) + weak.length * 2,
      matched: [...strong, ...weak],
      note: demoted ? "자격·소재지 확인용으로만 언급됨 — 발급 수요 아닐 수 있음" : cert.note,
      demoted,
    });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** 공고 유형 분류 */
export function classifyProgram(text) {
  const hay = norm(text);
  const scored = PROGRAM_TYPES
    .map((t) => ({ ...t, score: t.keywords.filter((k) => hay.includes(norm(k))).length }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.length ? scored[0] : { id: "etc", name: "기타", score: 0 };
}

/** 공고 하나를 종합 분석 */
export function analyze(announcement) {
  const text = [
    announcement.title,
    announcement.description,
    announcement.trgetNm,
    announcement.attachmentText, // 첨부파일에서 추출한 본문 (있을 때)
  ].filter(Boolean).join("\n");

  const certs = matchCertifications(text);
  const program = classifyProgram(text);
  const confirmed = certs.filter((c) => c.confidence === "confirmed");

  return {
    programType: program.name,
    certifications: certs,
    /** 행정사 업무 기회가 있는 공고인가 */
    actionable: confirmed.length > 0,
    /** 우선순위: 확정 단서가 많고 사업계획서까지 필요하면 높다 */
    priority: confirmed.length >= 2 ? "high" : confirmed.length === 1 ? "medium" : "low",
  };
}
