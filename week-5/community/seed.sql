-- =====================================================
-- W5 Community — Seed Data
-- 다양한 카테고리/시간/좋아요 분포로 12개 글 + 댓글 약간
-- =====================================================

INSERT INTO "W5_community_posts" (nickname, category, content, likes, created_at) VALUES
  ('익명1',     'free',  '익명 게시판 첫 글입니다! 다들 반가워요 👋',                                  3,  NOW() - INTERVAL '5 days'),
  ('카페인중독', 'food',  '오늘 점심 뭐 먹지... 추천 좀',                                              7,  NOW() - INTERVAL '3 days 4 hours'),
  ('react뉴비', 'study', 'useEffect 의존성 배열 진짜 어렵네요 ㅠㅠ 빈 배열이랑 생략이랑 차이가 뭐예요?',  12, NOW() - INTERVAL '2 days'),
  ('익명2',     'vent',  '월요일 너무 싫다',                                                          5,  NOW() - INTERVAL '1 day 8 hours'),
  ('디자이너K', 'free',  '바우하우스 디자인 철학 너무 멋있다. 100년 전인데 지금 봐도 모던함',           21, NOW() - INTERVAL '1 day 2 hours'),
  ('닉네임',    'study', 'Express + Supabase로 게시판 만드는 중. 배포까지 가면 진짜 뿌듯할 듯',         9,  NOW() - INTERVAL '20 hours'),
  ('밥순이',    'food',  '오늘 떡볶이에 김말이 추가했는데 신세계임',                                    15, NOW() - INTERVAL '8 hours'),
  ('익명3',     'vent',  '코드는 도는데 왜 도는지 모르겠다',                                            18, NOW() - INTERVAL '4 hours'),
  ('야행성',    'free',  '새벽 3시에 가장 집중 잘 됨. 나만 그런가?',                                    6,  NOW() - INTERVAL '2 hours'),
  ('익명4',     'study', 'JWT랑 세션 차이 누가 한 줄로 정리해줄 사람',                                  4,  NOW() - INTERVAL '50 minutes'),
  ('얼리버드',  'food',  '아침 빵 먹는 거 좋아하는 사람 손',                                            2,  NOW() - INTERVAL '20 minutes'),
  ('익명5',     'free',  '방금 가입했는데 UI 너무 예뻐요. 만든 사람 누구야',                            8,  NOW() - INTERVAL '3 minutes');


INSERT INTO "W5_community_comments" (post_id, nickname, content, created_at) VALUES
  (3, '졸업생',   '빈 배열은 처음 마운트 1회만, 생략은 매 렌더마다 실행됩니다.', NOW() - INTERVAL '1 day 22 hours'),
  (3, '익명',     '저도 그거 헷갈렸어요',                                       NOW() - INTERVAL '1 day 20 hours'),
  (5, '익명',     '동의합니다. 폰트랑 색감이 엄청 강함',                         NOW() - INTERVAL '1 day'),
  (7, '익명',     '김말이는 진리',                                              NOW() - INTERVAL '7 hours'),
  (10,'멘토',     '간단히: JWT는 무상태(stateless), 세션은 서버 상태 보관.',     NOW() - INTERVAL '40 minutes');
