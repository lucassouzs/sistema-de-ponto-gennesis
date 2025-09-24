# Script para limpar cache do Next.js e resolver problemas do OneDrive
Write-Host "🧹 Limpando cache do Next.js..." -ForegroundColor Yellow

# Remover pasta .next
if (Test-Path ".next") {
    Write-Host "Removendo pasta .next..." -ForegroundColor Cyan
    try {
        Remove-Item -Recurse -Force ".next" -ErrorAction Stop
        Write-Host "✅ Pasta .next removida com sucesso!" -ForegroundColor Green
    }
    catch {
        Write-Host "⚠️ Erro ao remover .next: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Tentando método alternativo..." -ForegroundColor Yellow
        
        # Método alternativo para Windows/OneDrive
        Get-ChildItem ".next" -Recurse | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        Remove-Item ".next" -Force -ErrorAction SilentlyContinue
        Write-Host "✅ Limpeza alternativa concluída!" -ForegroundColor Green
    }
} else {
    Write-Host "📁 Pasta .next não encontrada" -ForegroundColor Gray
}

# Remover node_modules/.cache se existir
if (Test-Path "node_modules/.cache") {
    Write-Host "Removendo cache do node_modules..." -ForegroundColor Cyan
    Remove-Item -Recurse -Force "node_modules/.cache" -ErrorAction SilentlyContinue
    Write-Host "✅ Cache do node_modules removido!" -ForegroundColor Green
}

# Limpar cache do npm
Write-Host "Limpando cache do npm..." -ForegroundColor Cyan
npm cache clean --force 2>$null
Write-Host "✅ Cache do npm limpo!" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 Limpeza concluída! Agora você pode executar:" -ForegroundColor Green
Write-Host "   npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Se o problema persistir, considere:" -ForegroundColor Yellow
Write-Host "   1. Mover o projeto para fora do OneDrive" -ForegroundColor White
Write-Host "   2. Desabilitar sincronização do OneDrive para esta pasta" -ForegroundColor White
Write-Host "   3. Usar WSL2 para desenvolvimento" -ForegroundColor White
