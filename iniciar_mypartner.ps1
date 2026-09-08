$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Iniciando o backend FastAPI..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "$root\backend\iniciar_backend.ps1"

Write-Host "Iniciando o frontend Next.js..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "$root\frontend\iniciar_frontend.ps1"

Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"
Write-Host "My Partner iniciado. Interface: http://localhost:3000" -ForegroundColor Green