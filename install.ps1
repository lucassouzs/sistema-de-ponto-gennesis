# Script de instalação para Windows PowerShell
# Sistema de Controle de Ponto - Empresa de Engenharia

Write-Host "🚀 Iniciando instalação do Sistema de Controle de Ponto..." -ForegroundColor Green

# Verificar se Node.js está instalado
Write-Host "📋 Verificando dependências..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js encontrado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js não encontrado. Por favor, instale o Node.js 18+ primeiro." -ForegroundColor Red
    Write-Host "📥 Download: https://nodejs.org/" -ForegroundColor Blue
    exit 1
}

# Verificar se npm está instalado
try {
    $npmVersion = npm --version
    Write-Host "✅ npm encontrado: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm não encontrado." -ForegroundColor Red
    exit 1
}

# Instalar dependências do projeto raiz
Write-Host "📦 Instalando dependências do projeto raiz..." -ForegroundColor Yellow
npm install

# Instalar dependências do backend
Write-Host "🔧 Instalando dependências do backend..." -ForegroundColor Yellow
Set-Location "apps/backend"
npm install
Set-Location "../.."

# Instalar dependências do frontend
Write-Host "🎨 Instalando dependências do frontend..." -ForegroundColor Yellow
Set-Location "apps/frontend"
npm install
Set-Location "../.."

# Instalar dependências do mobile
Write-Host "📱 Instalando dependências do mobile..." -ForegroundColor Yellow
Set-Location "apps/mobile"
npm install
Set-Location "../.."

Write-Host "✅ Instalação concluída com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos passos:" -ForegroundColor Cyan
Write-Host "1. Configure o banco de dados PostgreSQL" -ForegroundColor White
Write-Host "2. Copie o arquivo apps/backend/env.example para apps/backend/.env" -ForegroundColor White
Write-Host "3. Configure as variáveis de ambiente no arquivo .env" -ForegroundColor White
Write-Host "4. Execute: npm run db:migrate (no diretório apps/backend)" -ForegroundColor White
Write-Host "5. Execute: npm run dev (no diretório raiz)" -ForegroundColor White
Write-Host ""
Write-Host "🔗 URLs de desenvolvimento:" -ForegroundColor Cyan
Write-Host "• Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "• Backend: http://localhost:5000" -ForegroundColor White
Write-Host "• Mobile: Expo Dev Tools" -ForegroundColor White
Write-Host ""
Write-Host "📚 Documentação completa no arquivo README.md" -ForegroundColor Blue
