$ErrorActionPreference = "Stop"

Set-Location "C:\Users\Corsair\Desktop\smm-dev"

$logDir = Join-Path (Get-Location) ".tmp"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stdout = Join-Path $logDir "next-start.out.log"
$stderr = Join-Path $logDir "next-start.err.log"

if (Test-Path $stdout) {
  Remove-Item -LiteralPath $stdout -Force
}

if (Test-Path $stderr) {
  Remove-Item -LiteralPath $stderr -Force
}

& "C:\Program Files\nodejs\node.exe" ".\node_modules\next\dist\bin\next" "start" "--port" "3196" 1>> $stdout 2>> $stderr
