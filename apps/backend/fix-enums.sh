#!/bin/bash

# Script para corrigir todos os enums do TypeScript
# Substitui todas as referências aos enums por strings literais

echo "Corrigindo enums nos controllers..."

# MedicalCertificateController
sed -i 's/MedicalCertificateType\.PENDING/'\''PENDING'\''/g' src/controllers/MedicalCertificateController.ts
sed -i 's/MedicalCertificateType\.APPROVED/'\''APPROVED'\''/g' src/controllers/MedicalCertificateController.ts
sed -i 's/MedicalCertificateType\.REJECTED/'\''REJECTED'\''/g' src/controllers/MedicalCertificateController.ts
sed -i 's/MedicalCertificateType\.CANCELLED/'\''CANCELLED'\''/g' src/controllers/MedicalCertificateController.ts
sed -i 's/MedicalCertificateStatus\.PENDING/'\''PENDING'\''/g' src/controllers/MedicalCertificateController.ts
sed -i 's/MedicalCertificateStatus\.APPROVED/'\''APPROVED'\''/g' src/controllers/MedicalCertificateController.ts
sed -i 's/MedicalCertificateStatus\.REJECTED/'\''REJECTED'\''/g' src/controllers/MedicalCertificateController.ts
sed -i 's/MedicalCertificateStatus\.CANCELLED/'\''CANCELLED'\''/g' src/controllers/MedicalCertificateController.ts
sed -i 's/TimeRecordType\.ABSENCE_JUSTIFIED/'\''ABSENCE_JUSTIFIED'\''/g' src/controllers/MedicalCertificateController.ts

# OvertimeController
sed -i 's/OvertimeStatus\.PENDING/'\''PENDING'\''/g' src/controllers/OvertimeController.ts
sed -i 's/OvertimeStatus\.APPROVED/'\''APPROVED'\''/g' src/controllers/OvertimeController.ts
sed -i 's/OvertimeStatus\.REJECTED/'\''REJECTED'\''/g' src/controllers/OvertimeController.ts
sed -i 's/OvertimeType\.REGULAR/'\''REGULAR'\''/g' src/controllers/OvertimeController.ts

# ReportController
sed -i 's/ReportType\.ATTENDANCE/'\''ATTENDANCE'\''/g' src/controllers/ReportController.ts
sed -i 's/ReportType\.OVERTIME/'\''OVERTIME'\''/g' src/controllers/ReportController.ts
sed -i 's/ReportType\.VACATION/'\''VACATION'\''/g' src/controllers/ReportController.ts
sed -i 's/ReportType\.PRODUCTIVITY/'\''PRODUCTIVITY'\''/g' src/controllers/ReportController.ts
sed -i 's/ReportStatus\.GENERATED/'\''GENERATED'\''/g' src/controllers/ReportController.ts

# TimeRecordController
sed -i 's/TimeRecordType\.ENTRY/'\''ENTRY'\''/g' src/controllers/TimeRecordController.ts
sed -i 's/TimeRecordType\.EXIT/'\''EXIT'\''/g' src/controllers/TimeRecordController.ts
sed -i 's/TimeRecordType\.LUNCH_START/'\''LUNCH_START'\''/g' src/controllers/TimeRecordController.ts
sed -i 's/TimeRecordType\.LUNCH_END/'\''LUNCH_END'\''/g' src/controllers/TimeRecordController.ts
sed -i 's/TimeRecordType\.ABSENCE_JUSTIFIED/'\''ABSENCE_JUSTIFIED'\''/g' src/controllers/TimeRecordController.ts
sed -i 's/MedicalCertificateStatus\.APPROVED/'\''APPROVED'\''/g' src/controllers/TimeRecordController.ts

# UserController
sed -i 's/UserRole\.EMPLOYEE/'\''EMPLOYEE'\''/g' src/controllers/UserController.ts

# VacationController
sed -i 's/VacationType\.ANNUAL/'\''ANNUAL'\''/g' src/controllers/VacationController.ts
sed -i 's/VacationType\.FRACTIONED_1/'\''FRACTIONED_1'\''/g' src/controllers/VacationController.ts
sed -i 's/VacationType\.FRACTIONED_2/'\''FRACTIONED_2'\''/g' src/controllers/VacationController.ts
sed -i 's/VacationType\.FRACTIONED_3/'\''FRACTIONED_3'\''/g' src/controllers/VacationController.ts
sed -i 's/VacationStatus\.PENDING/'\''PENDING'\''/g' src/controllers/VacationController.ts
sed -i 's/VacationStatus\.APPROVED/'\''APPROVED'\''/g' src/controllers/VacationController.ts
sed -i 's/VacationStatus\.REJECTED/'\''REJECTED'\''/g' src/controllers/VacationController.ts
sed -i 's/VacationStatus\.CANCELLED/'\''CANCELLED'\''/g' src/controllers/VacationController.ts

echo "Corrigindo enums nos services..."

# MedicalCertificateService
sed -i 's/MedicalCertificateStatus\.PENDING/'\''PENDING'\''/g' src/services/MedicalCertificateService.ts
sed -i 's/MedicalCertificateStatus\.APPROVED/'\''APPROVED'\''/g' src/services/MedicalCertificateService.ts
sed -i 's/MedicalCertificateStatus\.REJECTED/'\''REJECTED'\''/g' src/services/MedicalCertificateService.ts
sed -i 's/MedicalCertificateStatus\.CANCELLED/'\''CANCELLED'\''/g' src/services/MedicalCertificateService.ts

# OvertimeService
sed -i 's/OvertimeType\.REGULAR/'\''REGULAR'\''/g' src/services/OvertimeService.ts
sed -i 's/OvertimeType\.WEEKEND/'\''WEEKEND'\''/g' src/services/OvertimeService.ts
sed -i 's/OvertimeType\.HOLIDAY/'\''HOLIDAY'\''/g' src/services/OvertimeService.ts
sed -i 's/OvertimeType\.NIGHT/'\''NIGHT'\''/g' src/services/OvertimeService.ts
sed -i 's/OvertimeStatus\.PENDING/'\''PENDING'\''/g' src/services/OvertimeService.ts
sed -i 's/OvertimeStatus\.APPROVED/'\''APPROVED'\''/g' src/services/OvertimeService.ts
sed -i 's/OvertimeStatus\.REJECTED/'\''REJECTED'\''/g' src/services/OvertimeService.ts

# SalaryAdjustmentService
sed -i 's/AdjustmentType\.BONUS/'\''BONUS'\''/g' src/services/SalaryAdjustmentService.ts
sed -i 's/AdjustmentType\.OVERTIME/'\''OVERTIME'\''/g' src/services/SalaryAdjustmentService.ts
sed -i 's/AdjustmentType\.COMMISSION/'\''COMMISSION'\''/g' src/services/SalaryAdjustmentService.ts
sed -i 's/AdjustmentType\.OTHER/'\''OTHER'\''/g' src/services/SalaryAdjustmentService.ts

# TimeRecordService
sed -i 's/TimeRecordType\.ENTRY/'\''ENTRY'\''/g' src/services/TimeRecordService.ts
sed -i 's/TimeRecordType\.EXIT/'\''EXIT'\''/g' src/services/TimeRecordService.ts
sed -i 's/TimeRecordType\.LUNCH_START/'\''LUNCH_START'\''/g' src/services/TimeRecordService.ts
sed -i 's/TimeRecordType\.LUNCH_END/'\''LUNCH_END'\''/g' src/services/TimeRecordService.ts
sed -i 's/TimeRecordType\.ABSENCE_JUSTIFIED/'\''ABSENCE_JUSTIFIED'\''/g' src/services/TimeRecordService.ts

# VacationService
sed -i 's/VacationType\.ANNUAL/'\''ANNUAL'\''/g' src/services/VacationService.ts
sed -i 's/VacationType\.FRACTIONED_1/'\''FRACTIONED_1'\''/g' src/services/VacationService.ts
sed -i 's/VacationType\.FRACTIONED_2/'\''FRACTIONED_2'\''/g' src/services/VacationService.ts
sed -i 's/VacationType\.FRACTIONED_3/'\''FRACTIONED_3'\''/g' src/services/VacationService.ts
sed -i 's/VacationStatus\.PENDING/'\''PENDING'\''/g' src/services/VacationService.ts
sed -i 's/VacationStatus\.APPROVED/'\''APPROVED'\''/g' src/services/VacationService.ts
sed -i 's/VacationStatus\.REJECTED/'\''REJECTED'\''/g' src/services/VacationService.ts
sed -i 's/VacationStatus\.IN_PROGRESS/'\''IN_PROGRESS'\''/g' src/services/VacationService.ts
sed -i 's/VacationStatus\.NOTICE_SENT/'\''NOTICE_SENT'\''/g' src/services/VacationService.ts
sed -i 's/VacationStatus\.NOTICE_CONFIRMED/'\''NOTICE_CONFIRMED'\''/g' src/services/VacationService.ts

echo "Correções concluídas!"
