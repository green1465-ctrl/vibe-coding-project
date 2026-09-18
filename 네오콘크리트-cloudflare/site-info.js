/* ═══════════════════════════════════════════════════════════
   (주)네오콘크리트 — 회사 연락처 상수 (유일한 수정 지점)
   - 전 페이지의 [data-site="키"] 텍스트, [data-site-href="키"] 링크를 main.js가 이 값으로 채운다.
   - HTML에도 같은 값이 기본 텍스트로 적혀 있음(SEO·JS 미동작 대비). 값이 바뀌면 여기부터 고치고,
     검색엔진용 원문까지 맞추려면 14개 HTML에서 옛 값을 일괄 치환.
   - 사업장은 원주공장 1곳만 표기 (다른 주소 추가 금지).
═══════════════════════════════════════════════════════════ */
window.SITE_INFO = {
  name:       '(주)네오콘크리트',
  name_en:    'NEO CONCRETE Co., Ltd.',
  ceo:        '김주용',
  ceo_en:     'Kim Ju-yong',
  address:    '강원도 원주시 신림면 갈곡길 29-9',
  address_en: '29-9, Galgok-gil, Sillim-myeon, Wonju-si, Gangwon-do, Republic of Korea',
  tel:        '033-763-5990',
  /* 휴대폰번호는 넣지 않는다 — 이 파일은 누구나 주소로 열어볼 수 있다 (대표 지시로 전 페이지에서 제외) */
  fax:        '033-763-5991',
  email:      'kj6680@naver.com',
  bizNo:      '310-87-00548',   /* 사업자등록번호 — 인증서 원본에서 확인됨 (2026-09 코디네이터 전달) */
  slogan:     '새로운 도로문화를 선도하는 전문기업',
  slogan_en:  'A specialist company leading a new road culture'
};

/* ═══════════════════════════════════════════════════════════
   인증서 · 특허 — 번호 / 등록일 (인증현황 2개 페이지 카드와 라이트박스 캡션에 반영)
   - 유효기간은 화면에 표시하지 않음(대표 지시).
     인증서 이미지를 새로 받으면 images/certs/ 의 같은 파일명(이름.jpg · 이름-thumb.jpg)으로 교체.
   - HTML에도 같은 값이 기본 텍스트로 적혀 있음(SEO · JS 미동작 대비). 검색엔진용 원문까지 맞추려면 HTML도 수정.
═══════════════════════════════════════════════════════════ */
window.CERT_INFO = {
  'cert-ks': { no: '제KCL-17-578호', no_en: 'No. KCL-17-578' },
  'cert-group-std-retaining': { no: '제488호', no_en: 'No. 488' },
  'cert-group-std-permeable': { no: '제2023-7549-002호', no_en: 'No. 2023-7549-002' },
  'cert-venture': {},
  'cert-innobiz': {},
  'cert-mainbiz': {},
  'cert-rnd-dept': { no: '제2024154355호', no_en: 'No. 2024154355' },
  'cert-sme': {},
  'patent-10-2198755': { date: '2020.12.29' },
  'patent-10-2412152': { date: '2022.06.17' },
  'patent-10-2546629': { date: '2023.06.19' },
  'patent-10-2671034': { date: '2024.05.27' },
  'patent-10-2742644': { date: '2024.12.10' },
  'patent-10-2804766': { date: '2025.05.01' }
};
