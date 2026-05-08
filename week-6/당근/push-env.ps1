# .env -> Vercel 프로젝트 환경변수로 일괄 업로드
# 사용: pwsh push-env.ps1
$envPath = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envPath)) { Write-Error ".env not found"; exit 1 }

$keys = @(
  'DATABASE_URL',
  'JWT_SECRET',
  'IMAGEKIT_PUBLIC_KEY',
  'IMAGEKIT_PRIVATE_KEY',
  'IMAGEKIT_URL_ENDPOINT'
)

$envMap = @{}
Get-Content $envPath -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  $idx = $line.IndexOf('=')
  if ($idx -lt 0) { return }
  $k = $line.Substring(0, $idx).Trim()
  $v = $line.Substring($idx + 1).Trim()
  if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
  $envMap[$k] = $v
}

Push-Location $PSScriptRoot
try {
  foreach ($k in $keys) {
    if (-not $envMap.ContainsKey($k) -or [string]::IsNullOrEmpty($envMap[$k])) {
      Write-Host "[skip] $k (empty or missing)"
      continue
    }
    Write-Host "[remove old] $k"
    & vercel env rm $k production --yes 2>$null | Out-Null
    Write-Host "[add] $k production"
    $envMap[$k] | & vercel env add $k production | Out-Null
  }
} finally {
  Pop-Location
}

Write-Host "`nDone. Next:  vercel deploy --prod --yes"
