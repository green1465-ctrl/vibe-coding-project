param(
  [Parameter(Mandatory=$true)][string]$Prompt,
  [Parameter(Mandatory=$true)][string]$Output,
  [int]$Width = 1280,
  [int]$Height = 720,
  [int]$Steps = 6
)

# .env 파일에서 FAL_KEY 로드 (week-7/poster/.env)
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

if (-not $env:FAL_KEY -or $env:FAL_KEY -like '*여기에*') {
  Write-Error "FAL_KEY가 .env에 설정되지 않았습니다."
  exit 1
}

$body = @{
  prompt = $Prompt
  image_size = @{ width = $Width; height = $Height }
  num_inference_steps = $Steps
  num_images = 1
  output_format = "png"
  enable_safety_checker = $true
} | ConvertTo-Json -Depth 5

$headers = @{
  "Content-Type"  = "application/json"
  "Authorization" = "Key $($env:FAL_KEY)"
}

try {
  $resp = Invoke-RestMethod -Uri "https://fal.run/fal-ai/z-image/turbo" -Method Post -Headers $headers -Body $body -TimeoutSec 180
  $imgUrl = $resp.images[0].url
  $dir = Split-Path -Parent $Output
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Invoke-WebRequest -Uri $imgUrl -OutFile $Output -TimeoutSec 120
  Write-Output "OK: $Output"
} catch {
  Write-Error "FAIL: $($_.Exception.Message)"
  exit 1
}
