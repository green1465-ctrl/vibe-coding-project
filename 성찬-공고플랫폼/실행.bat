@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 공고 스크리닝 - 기업마당 수집

echo.
echo  ========================================
echo   행정사사무소 성찬 - 공고 스크리닝
echo  ========================================
echo.
echo  기업마당에서 최신 공고를 받아옵니다.
echo  처음 실행하거나 새 공고가 많으면 몇 분 걸립니다.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [오류] Node.js 가 설치되어 있지 않습니다.
  echo         https://nodejs.org 에서 설치한 뒤 다시 실행해 주세요.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  최초 실행 - 필요한 패키지를 설치합니다...
  call npm install --silent
  echo.
)

call npm run collect
if errorlevel 1 (
  echo.
  echo  [수집 실패] 인터넷 연결 또는 인증키를 확인해 주세요.
  echo              인증키는 .dev.vars 파일에 들어 있습니다.
  echo.
  pause
  exit /b 1
)

echo.
echo  대시보드를 엽니다...
start "" "%~dp0public\index.html"
timeout /t 2 >nul
