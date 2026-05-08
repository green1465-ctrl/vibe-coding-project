-- 콘텐츠 카탈로그 시드 (멱등)
-- 본문은 클라이언트(index.html)에 그대로 두고, 서버는 메타와 가격만 관리

INSERT INTO "W6_unlock_contents" (id, title, category, author, price, is_premium, published_at)
VALUES
  ('a1', '작은 팀일수록 ‘기능 추가’보다 ‘기능 삭제’를 잘해야 한다',
        '프로덕트', '김지원',     0, false, now() - interval '7 days'),
  ('a2', '다크모드는 정말 사용자의 눈에 더 좋을까',
        '디자인',   '이서연',  2900, true,  now() - interval '6 days'),
  ('a3', '시리즈 A를 받기 전에 반드시 정리해야 할 5가지',
        '스타트업', '박민호',  4900, true,  now() - interval '5 days'),
  ('a4', '왜 우리는 AI 코딩 도구를 ‘페어’가 아닌 ‘부하’로 다루게 되었는가',
        '테크',     '최도윤',  3900, true,  now() - interval '4 days'),
  ('a5', '아이콘은 ‘예쁘게’보다 ‘읽히게’ 그려라',
        '디자인',   '정하늘',     0, false, now() - interval '3 days'),
  ('a6', '“우리 회사의 진짜 고객”을 찾는 4가지 질문',
        '스타트업', '한은지',  3900, true,  now() - interval '2 days'),
  ('a7', '코드 리뷰가 팀의 속도를 늦추는 가장 흔한 4가지 패턴',
        '테크',     '윤상혁',     0, false, now() - interval '1 day'),
  ('a8', '온보딩 화면을 줄였더니 전환율이 오른 이유',
        '프로덕트', '김지원',  2900, true,  now())
ON CONFLICT (id) DO UPDATE SET
  title        = EXCLUDED.title,
  category     = EXCLUDED.category,
  author       = EXCLUDED.author,
  price        = EXCLUDED.price,
  is_premium   = EXCLUDED.is_premium,
  published_at = EXCLUDED.published_at;
