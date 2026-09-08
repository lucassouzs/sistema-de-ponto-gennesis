# Aplica migration e regenera o Prisma Client para o módulo de Licitações.
# Pare o npm run dev antes de executar (Ctrl+C no terminal).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Aplicando migrations..." -ForegroundColor Cyan
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Regenerando Prisma Client..." -ForegroundColor Cyan
npx prisma generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Concluido. Reinicie: npm run dev" -ForegroundColor Green
