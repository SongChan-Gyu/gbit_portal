# 기본 브라우저에서 개발 서버 열기 (포트: npm 인자 > 환경변수 DEV_PORT > 3000)
# 예: npm run open:dev -- 3002
param([string]$Port = "")
if ($args.Count -gt 0 -and $args[0] -match "^\d+$") { $Port = $args[0] }
if (-not $Port -and $env:DEV_PORT) { $Port = $env:DEV_PORT }
if (-not $Port) { $Port = "3000" }
$url = "http://localhost:$Port"
Write-Host "[open-dev] $url" -ForegroundColor Green
Start-Process $url
