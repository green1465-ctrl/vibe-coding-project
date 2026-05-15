param(
  [string]$PromptFile = (Join-Path $PSScriptRoot "prompt-keyvisual.txt"),
  [string]$Output = (Join-Path $PSScriptRoot "v3_gptimage_keyvisual\01_main_base.png"),
  [ValidateSet("1024x1024","1024x1536","1536x1024")][string]$Size = "1024x1536",
  [ValidateSet("low","medium","high","auto")][string]$Quality = "high"
)

# week-7/poster/.env 에서 OPENAI_API_KEY 로드
$envPath = Join-Path $PSScriptRoot "..\..\.env"
if (-not (Test-Path $envPath)) {
  Write-Error ".env 파일이 없습니다: $envPath  (.env.example 참고하여 생성하세요)"
  exit 1
}
Get-Content $envPath | ForEach-Object {
  if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$') {
    Set-Item "env:$($Matches[1])" $Matches[2]
  }
}
if (-not $env:OPENAI_API_KEY -or $env:OPENAI_API_KEY -like '*여기에*') {
  Write-Error "OPENAI_API_KEY가 .env에 설정되지 않았습니다."
  exit 1
}

if (-not (Test-Path $PromptFile)) {
  Write-Error "프롬프트 파일이 없습니다: $PromptFile"
  exit 1
}
$prompt = (Get-Content $PromptFile -Raw -Encoding UTF8).Trim()

$payload = @{
  model         = "gpt-image-1"
  prompt        = $prompt
  n             = 1
  size          = $Size
  quality       = $Quality
  output_format = "png"
} | ConvertTo-Json -Depth 5 -Compress

$bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)

$headers = @{
  "Authorization" = "Bearer $($env:OPENAI_API_KEY)"
}

Write-Output "Calling gpt-image-1 (size=$Size, quality=$Quality)..."
$started = Get-Date

try {
  $resp = Invoke-RestMethod `
    -Uri "https://api.openai.com/v1/images/generations" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json; charset=utf-8" `
    -Body $bytes `
    -TimeoutSec 300

  $b64 = $resp.data[0].b64_json
  if (-not $b64) {
    Write-Error "응답에 b64_json이 없습니다."
    $resp | ConvertTo-Json -Depth 4 | Write-Error
    exit 1
  }

  $dir = Split-Path -Parent $Output
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

  $imgBytes = [Convert]::FromBase64String($b64)
  [System.IO.File]::WriteAllBytes($Output, $imgBytes)

  $elapsed = (Get-Date) - $started
  Write-Output "OK: $Output  ($([int]$elapsed.TotalSeconds)s, $([int]($imgBytes.Length / 1024)) KB)"
} catch {
  Write-Error "FAIL: $($_.Exception.Message)"
  if ($_.ErrorDetails.Message) { Write-Error $_.ErrorDetails.Message }
  exit 1
}
