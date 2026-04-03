# Docker MySQL 기동 후 DB 마이그레이션·시드·Next 개발 서버 (Windows)
# Docker Desktop 필요. MySQL 직접 설치 시에는 npm run local:win 만 쓰면 됩니다.
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

Write-Host "[local-full-win] docker compose up -d (MySQL)..." -ForegroundColor Cyan
docker compose up -d
if ($LASTEXITCODE -ne 0) {
  Write-Host "[local-full-win] docker compose 실패. Docker Desktop 실행 여부를 확인하세요." -ForegroundColor Red
  exit 1
}

Write-Host "[local-full-win] MySQL 준비 대기(약 10초)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

& (Join-Path $PSScriptRoot "local-dev-win.ps1")
