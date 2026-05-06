# Script PowerShell para corrigir tipos específicos
Write-Host "Corrigindo tipos específicos..."

# OvertimeService - corrigir tipos incorretos
(Get-Content src/services/OvertimeService.ts) -replace 'department: OvertimeType', 'department: string' | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'month: OvertimeType', 'month: string' | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'type: OvertimeType', 'type: string' | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'userId: OvertimeType', 'userId: string' | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'reason\?: OvertimeType', 'reason?: string' | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'department\?: OvertimeType', 'department?: string' | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'employeeName: OvertimeType', 'employeeName: string' | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'Map<OvertimeType,', 'Map<string,' | Set-Content src/services/OvertimeService.ts

Write-Host "Correções concluídas!"
