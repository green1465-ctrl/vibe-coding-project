# Render 배포 가이드

## 사전 준비
- GitHub 레포에 이 폴더(`week-6/menu`)가 푸시되어 있어야 합니다.
- `.env` 파일은 git에 올라가지 **않습니다** (`.gitignore`로 제외). 환경 변수는 Render Dashboard에서 직접 입력.

## 1. Git 푸시

```bash
git add week-6/menu/render.yaml week-6/menu/package.json week-6/menu/DEPLOY.md
git commit -m "Add Render deploy config"
git push origin main
```

## 2. Render 서비스 생성 (Blueprint 사용 — 권장)

1. [render.com](https://render.com) 가입·로그인 (GitHub 계정 연동)
2. Dashboard 우상단 **New +** → **Blueprint**
3. GitHub 레포 선택 → branch `main` → **Apply**
4. Render가 `week-6/menu/render.yaml`을 인식해 자동으로 서비스를 만듭니다.

## 3. 환경 변수 설정

서비스 생성 후 **Environment 탭** → **Add Environment Variable** 로 다음 7개 입력:

| Key | Value 예시 |
|---|---|
| `OPENAI_API_KEY` | `sk-proj-...` (platform.openai.com에서 새로 발급) |
| `FAL_KEY` | `xxxx-xxxx:xxxx` (fal.ai/dashboard/keys에서 새로 발급) |
| `IMAGEKIT_PUBLIC_KEY` | `public_...` |
| `IMAGEKIT_PRIVATE_KEY` | `private_...` |
| `IMAGEKIT_URL_ENDPOINT` | `https://ik.imagekit.io/your_id` |
| `SITE_PASSWORD` | 강한 비밀번호 (8자 이상 권장) |
| `AUTH_SECRET` | 32바이트 랜덤 base64 |

> ⚠️ 이전에 채팅에 노출된 키들은 모두 **재발급**해서 새 값으로 넣어주세요.
> AUTH_SECRET은 https://generate-secret.vercel.app/32 에서 발급해 그대로 붙여넣기.

## 4. 첫 배포 대기

- Render가 자동으로 빌드 시작 (`npm install` + `playwright install chromium`)
- chromium 다운로드 때문에 첫 빌드는 **5~8분** 소요
- 빌드 끝나면 자동으로 `https://menu-cardnews.onrender.com`(또는 비슷한 URL) 발급
- **Logs 탭**에서 "Server listening on :PORT" 확인

## 5. 접속 확인

```
https://<your-app>.onrender.com/api/health
```
→ `{"ok":true, "openai":true, "fal":true, "imagekit":true}` 가 나오면 성공.

브라우저로 `https://<your-app>.onrender.com` 접속 → LoginGate 화면 → 입력한 비밀번호 → 진입.

## 알려진 한계 (Render free plan)

- **15분 미사용 시 sleep** — 다시 접속하면 첫 호출이 30초 정도 걸림 (cold start). 발표 직전 한 번 ping 해두면 됨.
- **메모리 512MB / 빌드 시간 ~10분** — Playwright + Express 충분히 들어감
- **파일 시스템은 deploy 사이에 초기화** — `data/campaigns.json` 과 `slides/*.png`가 새 배포마다 사라짐. 발표용은 OK, 장기 사용이라면 Render Disk 또는 외부 스토리지(S3/Supabase) 필요

## 발표 직후

- 사용 끝나면 Render Dashboard에서 **Suspend** 또는 **Delete**해서 비용·키 노출 위험 줄이기
- API 키들은 사용 끝나면 폐기 권장
