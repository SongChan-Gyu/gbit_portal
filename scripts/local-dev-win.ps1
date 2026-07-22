# 로컬 개발 서버 (Windows) — MySQL 실행 후 사용
# 사용: npm run local:win
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$env:TZ = if ($env:TZ) { $env:TZ } else { "Asia/Seoul" }

if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host "[local-dev-win] .env.example -> .env 복사함. DATABASE_URL·NEXTAUTH_* 를 확인하세요." -ForegroundColor Yellow
  } else {
    Write-Host "[local-dev-win] .env 파일이 없습니다. DATABASE_URL 등을 설정한 .env 를 만드세요." -ForegroundColor Red
    exit 1
  }
}

Write-Host "[local-dev-win] prisma generate ..." -ForegroundColor Cyan
npx prisma generate

Write-Host "[local-dev-win] prisma migrate deploy ..." -ForegroundColor Cyan
npx prisma migrate deploy

Write-Host "[local-dev-win] prisma db seed ..." -ForegroundColor Cyan
npx prisma db seed
if ($LASTEXITCODE -ne 0) {
  Write-Host "[local-dev-win] 시드 실패: MySQL 실행 여부와 .env 의 DATABASE_URL(127.0.0.1 권장)을 확인하세요." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "[local-dev-win] db:ensure-pm (실패해도 무시)" -ForegroundColor Cyan
cmd /c "npm run db:ensure-pm >nul 2>&1"

Write-Host "[local-dev-win] Next.js (Turbopack) http://localhost:3000 (Chrome/Edge 권장)" -ForegroundColor Green
npx next dev --turbo
