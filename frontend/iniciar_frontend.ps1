$ErrorActionPreference = "Stop"
$frontend = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $frontend

if (-not (Test-Path "node_modules")) {
    Write-Host "Dependências do frontend não encontradas. Execute primeiro: npm install" -ForegroundColor Red
    Read-Host "Pressione Enter para fechar"
    exit 1
}

Write-Host "Frontend: http://localhost:3000" -ForegroundColor Green
npm run dev -- -H 0.0.0.0