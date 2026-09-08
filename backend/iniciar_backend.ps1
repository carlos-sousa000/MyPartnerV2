$ErrorActionPreference = "Stop"
$backend = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backend

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Ambiente Python não encontrado. Execute primeiro:" -ForegroundColor Red
    Write-Host "python -m venv .venv"
    Write-Host "python -m pip install -r requirements.txt"
    Read-Host "Pressione Enter para fechar"
    exit 1
}

Write-Host "Backend: http://localhost:8000" -ForegroundColor Green
& ".venv\Scripts\python.exe" -m uvicorn main:app --reload --host 0.0.0.0 --port 8000