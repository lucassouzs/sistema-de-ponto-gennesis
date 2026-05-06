# Script para limpar processos Node.js e liberar portas

Write-Host "🔍 Verificando processos Node.js..." -ForegroundColor Yellow

# Listar processos Node.js
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host "`n📋 Processos Node.js encontrados:" -ForegroundColor Cyan
    $nodeProcesses | Format-Table Id, ProcessName, StartTime -AutoSize
    
    Write-Host "`n🛑 Encerrando processos Node.js..." -ForegroundColor Yellow
    
    foreach ($process in $nodeProcesses) {
        try {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Write-Host "   Processo $($process.Id) encerrado" -ForegroundColor Green
        }
        catch {
            Write-Host "   Erro ao encerrar processo $($process.Id)" -ForegroundColor Red
        }
    }
    
    Start-Sleep -Seconds 2
    
    # Verificar se ainda há processos
    $remaining = Get-Process node -ErrorAction SilentlyContinue
    if ($remaining) {
        Write-Host "`n⚠️  Ainda há processos Node.js rodando. Tente executar como Administrador." -ForegroundColor Red
    } else {
        Write-Host "`n✅ Todos os processos Node.js foram encerrados!" -ForegroundColor Green
    }
} else {
    Write-Host "✅ Nenhum processo Node.js encontrado." -ForegroundColor Green
}

# Verificar portas
Write-Host "`n🔍 Verificando portas 3000 e 5000..." -ForegroundColor Yellow

$port3000 = netstat -ano | findstr ":3000" | findstr "LISTENING"
$port5000 = netstat -ano | findstr ":5000" | findstr "LISTENING"

if ($port3000 -or $port5000) {
    Write-Host "⚠️  Portas ainda em uso:" -ForegroundColor Yellow
    if ($port3000) { Write-Host "   - Porta 3000: $port3000" -ForegroundColor Yellow }
    if ($port5000) { Write-Host "   - Porta 5000: $port5000" -ForegroundColor Yellow }
    Write-Host "`n💡 Aguarde alguns segundos ou reinicie o terminal." -ForegroundColor Cyan
} else {
    Write-Host "✅ Portas 3000 e 5000 estão livres!" -ForegroundColor Green
}

Write-Host "`n✨ Terminal liberado! Você pode digitar novamente." -ForegroundColor Green
