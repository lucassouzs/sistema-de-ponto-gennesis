# Script PowerShell para corrigir todos os enums do TypeScript
# Substitui todas as referências aos enums por strings literais

Write-Host "Corrigindo enums nos controllers..."

# MedicalCertificateController
(Get-Content src/controllers/MedicalCertificateController.ts) -replace 'MedicalCertificateType\.PENDING', "'PENDING'" | Set-Content src/controllers/MedicalCertificateController.ts
(Get-Content src/controllers/MedicalCertificateController.ts) -replace 'MedicalCertificateType\.APPROVED', "'APPROVED'" | Set-Content src/controllers/MedicalCertificateController.ts
(Get-Content src/controllers/MedicalCertificateController.ts) -replace 'MedicalCertificateType\.REJECTED', "'REJECTED'" | Set-Content src/controllers/MedicalCertificateController.ts
(Get-Content src/controllers/MedicalCertificateController.ts) -replace 'MedicalCertificateType\.CANCELLED', "'CANCELLED'" | Set-Content src/controllers/MedicalCertificateController.ts
(Get-Content src/controllers/MedicalCertificateController.ts) -replace 'MedicalCertificateStatus\.PENDING', "'PENDING'" | Set-Content src/controllers/MedicalCertificateController.ts
(Get-Content src/controllers/MedicalCertificateController.ts) -replace 'MedicalCertificateStatus\.APPROVED', "'APPROVED'" | Set-Content src/controllers/MedicalCertificateController.ts
(Get-Content src/controllers/MedicalCertificateController.ts) -replace 'MedicalCertificateStatus\.REJECTED', "'REJECTED'" | Set-Content src/controllers/MedicalCertificateController.ts
(Get-Content src/controllers/MedicalCertificateController.ts) -replace 'MedicalCertificateStatus\.CANCELLED', "'CANCELLED'" | Set-Content src/controllers/MedicalCertificateController.ts
(Get-Content src/controllers/MedicalCertificateController.ts) -replace 'TimeRecordType\.ABSENCE_JUSTIFIED', "'ABSENCE_JUSTIFIED'" | Set-Content src/controllers/MedicalCertificateController.ts

# OvertimeController
(Get-Content src/controllers/OvertimeController.ts) -replace 'OvertimeStatus\.PENDING', "'PENDING'" | Set-Content src/controllers/OvertimeController.ts
(Get-Content src/controllers/OvertimeController.ts) -replace 'OvertimeStatus\.APPROVED', "'APPROVED'" | Set-Content src/controllers/OvertimeController.ts
(Get-Content src/controllers/OvertimeController.ts) -replace 'OvertimeStatus\.REJECTED', "'REJECTED'" | Set-Content src/controllers/OvertimeController.ts
(Get-Content src/controllers/OvertimeController.ts) -replace 'OvertimeType\.REGULAR', "'REGULAR'" | Set-Content src/controllers/OvertimeController.ts

# ReportController
(Get-Content src/controllers/ReportController.ts) -replace 'ReportType\.ATTENDANCE', "'ATTENDANCE'" | Set-Content src/controllers/ReportController.ts
(Get-Content src/controllers/ReportController.ts) -replace 'ReportType\.OVERTIME', "'OVERTIME'" | Set-Content src/controllers/ReportController.ts
(Get-Content src/controllers/ReportController.ts) -replace 'ReportType\.VACATION', "'VACATION'" | Set-Content src/controllers/ReportController.ts
(Get-Content src/controllers/ReportController.ts) -replace 'ReportType\.PRODUCTIVITY', "'PRODUCTIVITY'" | Set-Content src/controllers/ReportController.ts
(Get-Content src/controllers/ReportController.ts) -replace 'ReportStatus\.GENERATED', "'GENERATED'" | Set-Content src/controllers/ReportController.ts

# TimeRecordController
(Get-Content src/controllers/TimeRecordController.ts) -replace 'TimeRecordType\.ENTRY', "'ENTRY'" | Set-Content src/controllers/TimeRecordController.ts
(Get-Content src/controllers/TimeRecordController.ts) -replace 'TimeRecordType\.EXIT', "'EXIT'" | Set-Content src/controllers/TimeRecordController.ts
(Get-Content src/controllers/TimeRecordController.ts) -replace 'TimeRecordType\.LUNCH_START', "'LUNCH_START'" | Set-Content src/controllers/TimeRecordController.ts
(Get-Content src/controllers/TimeRecordController.ts) -replace 'TimeRecordType\.LUNCH_END', "'LUNCH_END'" | Set-Content src/controllers/TimeRecordController.ts
(Get-Content src/controllers/TimeRecordController.ts) -replace 'TimeRecordType\.ABSENCE_JUSTIFIED', "'ABSENCE_JUSTIFIED'" | Set-Content src/controllers/TimeRecordController.ts
(Get-Content src/controllers/TimeRecordController.ts) -replace 'MedicalCertificateStatus\.APPROVED', "'APPROVED'" | Set-Content src/controllers/TimeRecordController.ts

# UserController
(Get-Content src/controllers/UserController.ts) -replace 'UserRole\.EMPLOYEE', "'EMPLOYEE'" | Set-Content src/controllers/UserController.ts

# VacationController
(Get-Content src/controllers/VacationController.ts) -replace 'VacationType\.ANNUAL', "'ANNUAL'" | Set-Content src/controllers/VacationController.ts
(Get-Content src/controllers/VacationController.ts) -replace 'VacationType\.FRACTIONED_1', "'FRACTIONED_1'" | Set-Content src/controllers/VacationController.ts
(Get-Content src/controllers/VacationController.ts) -replace 'VacationType\.FRACTIONED_2', "'FRACTIONED_2'" | Set-Content src/controllers/VacationController.ts
(Get-Content src/controllers/VacationController.ts) -replace 'VacationType\.FRACTIONED_3', "'FRACTIONED_3'" | Set-Content src/controllers/VacationController.ts
(Get-Content src/controllers/VacationController.ts) -replace 'VacationStatus\.PENDING', "'PENDING'" | Set-Content src/controllers/VacationController.ts
(Get-Content src/controllers/VacationController.ts) -replace 'VacationStatus\.APPROVED', "'APPROVED'" | Set-Content src/controllers/VacationController.ts
(Get-Content src/controllers/VacationController.ts) -replace 'VacationStatus\.REJECTED', "'REJECTED'" | Set-Content src/controllers/VacationController.ts
(Get-Content src/controllers/VacationController.ts) -replace 'VacationStatus\.CANCELLED', "'CANCELLED'" | Set-Content src/controllers/VacationController.ts

Write-Host "Corrigindo enums nos services..."

# MedicalCertificateService
(Get-Content src/services/MedicalCertificateService.ts) -replace 'MedicalCertificateStatus\.PENDING', "'PENDING'" | Set-Content src/services/MedicalCertificateService.ts
(Get-Content src/services/MedicalCertificateService.ts) -replace 'MedicalCertificateStatus\.APPROVED', "'APPROVED'" | Set-Content src/services/MedicalCertificateService.ts
(Get-Content src/services/MedicalCertificateService.ts) -replace 'MedicalCertificateStatus\.REJECTED', "'REJECTED'" | Set-Content src/services/MedicalCertificateService.ts
(Get-Content src/services/MedicalCertificateService.ts) -replace 'MedicalCertificateStatus\.CANCELLED', "'CANCELLED'" | Set-Content src/services/MedicalCertificateService.ts

# OvertimeService
(Get-Content src/services/OvertimeService.ts) -replace 'OvertimeType\.REGULAR', "'REGULAR'" | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'OvertimeType\.WEEKEND', "'WEEKEND'" | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'OvertimeType\.HOLIDAY', "'HOLIDAY'" | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'OvertimeType\.NIGHT', "'NIGHT'" | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'OvertimeStatus\.PENDING', "'PENDING'" | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'OvertimeStatus\.APPROVED', "'APPROVED'" | Set-Content src/services/OvertimeService.ts
(Get-Content src/services/OvertimeService.ts) -replace 'OvertimeStatus\.REJECTED', "'REJECTED'" | Set-Content src/services/OvertimeService.ts

# SalaryAdjustmentService
(Get-Content src/services/SalaryAdjustmentService.ts) -replace 'AdjustmentType\.BONUS', "'BONUS'" | Set-Content src/services/SalaryAdjustmentService.ts
(Get-Content src/services/SalaryAdjustmentService.ts) -replace 'AdjustmentType\.OVERTIME', "'OVERTIME'" | Set-Content src/services/SalaryAdjustmentService.ts
(Get-Content src/services/SalaryAdjustmentService.ts) -replace 'AdjustmentType\.COMMISSION', "'COMMISSION'" | Set-Content src/services/SalaryAdjustmentService.ts
(Get-Content src/services/SalaryAdjustmentService.ts) -replace 'AdjustmentType\.OTHER', "'OTHER'" | Set-Content src/services/SalaryAdjustmentService.ts

# TimeRecordService
(Get-Content src/services/TimeRecordService.ts) -replace 'TimeRecordType\.ENTRY', "'ENTRY'" | Set-Content src/services/TimeRecordService.ts
(Get-Content src/services/TimeRecordService.ts) -replace 'TimeRecordType\.EXIT', "'EXIT'" | Set-Content src/services/TimeRecordService.ts
(Get-Content src/services/TimeRecordService.ts) -replace 'TimeRecordType\.LUNCH_START', "'LUNCH_START'" | Set-Content src/services/TimeRecordService.ts
(Get-Content src/services/TimeRecordService.ts) -replace 'TimeRecordType\.LUNCH_END', "'LUNCH_END'" | Set-Content src/services/TimeRecordService.ts
(Get-Content src/services/TimeRecordService.ts) -replace 'TimeRecordType\.ABSENCE_JUSTIFIED', "'ABSENCE_JUSTIFIED'" | Set-Content src/services/TimeRecordService.ts

# VacationService
(Get-Content src/services/VacationService.ts) -replace 'VacationType\.ANNUAL', "'ANNUAL'" | Set-Content src/services/VacationService.ts
(Get-Content src/services/VacationService.ts) -replace 'VacationType\.FRACTIONED_1', "'FRACTIONED_1'" | Set-Content src/services/VacationService.ts
(Get-Content src/services/VacationService.ts) -replace 'VacationType\.FRACTIONED_2', "'FRACTIONED_2'" | Set-Content src/services/VacationService.ts
(Get-Content src/services/VacationService.ts) -replace 'VacationType\.FRACTIONED_3', "'FRACTIONED_3'" | Set-Content src/services/VacationService.ts
(Get-Content src/services/VacationService.ts) -replace 'VacationStatus\.PENDING', "'PENDING'" | Set-Content src/services/VacationService.ts
(Get-Content src/services/VacationService.ts) -replace 'VacationStatus\.APPROVED', "'APPROVED'" | Set-Content src/services/VacationService.ts
(Get-Content src/services/VacationService.ts) -replace 'VacationStatus\.REJECTED', "'REJECTED'" | Set-Content src/services/VacationService.ts
(Get-Content src/services/VacationService.ts) -replace 'VacationStatus\.IN_PROGRESS', "'IN_PROGRESS'" | Set-Content src/services/VacationService.ts
(Get-Content src/services/VacationService.ts) -replace 'VacationStatus\.NOTICE_SENT', "'NOTICE_SENT'" | Set-Content src/services/VacationService.ts
(Get-Content src/services/VacationService.ts) -replace 'VacationStatus\.NOTICE_CONFIRMED', "'NOTICE_CONFIRMED'" | Set-Content src/services/VacationService.ts

Write-Host "Correções concluídas!"
