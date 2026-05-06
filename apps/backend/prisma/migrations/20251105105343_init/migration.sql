-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE');

-- CreateEnum
CREATE TYPE "TimeRecordType" AS ENUM ('ENTRY', 'EXIT', 'LUNCH_START', 'LUNCH_END', 'BREAK_START', 'BREAK_END', 'ABSENCE_JUSTIFIED');

-- CreateEnum
CREATE TYPE "VacationType" AS ENUM ('ANNUAL', 'FRACTIONED_1', 'FRACTIONED_2', 'FRACTIONED_3', 'SICK', 'MATERNITY', 'PATERNITY', 'EMERGENCY', 'COLLECTIVE');

-- CreateEnum
CREATE TYPE "VacationStatus" AS ENUM ('PENDING', 'APPROVED', 'NOTICE_SENT', 'NOTICE_CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OvertimeType" AS ENUM ('REGULAR', 'WEEKEND', 'HOLIDAY', 'NIGHT');

-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('ATTENDANCE', 'OVERTIME', 'VACATION', 'PRODUCTIVITY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('GENERATED', 'PROCESSING', 'ERROR');

-- CreateEnum
CREATE TYPE "MedicalCertificateType" AS ENUM ('MEDICAL', 'DENTAL', 'PREVENTIVE', 'ACCIDENT', 'COVID', 'MATERNITY', 'PATERNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicalCertificateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Company" AS ENUM ('ABRASIL', 'GENNESIS', 'METRICA');

-- CreateEnum
CREATE TYPE "Bank" AS ENUM ('BANCO_DO_BRASIL', 'BRADESCO', 'C6', 'CAIXA_ECONOMICA', 'CEF', 'INTER', 'ITAU', 'NUBANK', 'PICPAY', 'SANTANDER');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CONTA_SALARIO', 'CONTA_CORRENTE', 'POUPANCA');

-- CreateEnum
CREATE TYPE "PixKeyType" AS ENUM ('ALEATORIA', 'CELULAR', 'CNPJ', 'CPF', 'EMAIL');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('BONUS', 'OVERTIME', 'COMMISSION', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FINE', 'CONSIGNED', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "birthDate" TIMESTAMP(3),
    "salary" DECIMAL(10,2) NOT NULL,
    "workSchedule" JSONB NOT NULL,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "allowedLocations" JSONB,
    "costCenter" TEXT,
    "client" TEXT,
    "dailyFoodVoucher" DOUBLE PRECISION DEFAULT 33.40,
    "dailyTransportVoucher" DOUBLE PRECISION DEFAULT 11.00,
    "company" TEXT,
    "bank" TEXT,
    "accountType" TEXT,
    "agency" TEXT,
    "operation" TEXT,
    "account" TEXT,
    "digit" TEXT,
    "pixKeyType" TEXT,
    "pixKey" TEXT,
    "modality" TEXT,
    "familySalary" DECIMAL(10,2),
    "dangerPay" DECIMAL(10,2),
    "unhealthyPay" DECIMAL(10,2),
    "polo" TEXT,
    "categoriaFinanceira" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "TimeRecordType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "photoUrl" TEXT,
    "photoKey" TEXT,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "observation" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "foodVoucherAmount" DOUBLE PRECISION DEFAULT 0,
    "transportVoucherAmount" DOUBLE PRECISION DEFAULT 0,
    "costCenter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "type" "VacationType" NOT NULL DEFAULT 'ANNUAL',
    "status" "VacationStatus" NOT NULL DEFAULT 'PENDING',
    "fraction" INTEGER,
    "aquisitiveStart" TIMESTAMP(3) NOT NULL,
    "aquisitiveEnd" TIMESTAMP(3) NOT NULL,
    "concessiveEnd" TIMESTAMP(3) NOT NULL,
    "noticeSentAt" TIMESTAMP(3),
    "noticeReceivedAt" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "paymentAmount" DECIMAL(10,2),
    "reason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "type" "OvertimeType" NOT NULL,
    "description" TEXT,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "data" JSONB NOT NULL,
    "period" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'GENERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "workStartTime" TEXT NOT NULL DEFAULT '07:00',
    "workEndTime" TEXT NOT NULL DEFAULT '17:00',
    "lunchStartTime" TEXT NOT NULL DEFAULT '12:00',
    "lunchEndTime" TEXT NOT NULL DEFAULT '13:00',
    "toleranceMinutes" INTEGER NOT NULL DEFAULT 10,
    "maxOvertimeHours" INTEGER NOT NULL DEFAULT 2,
    "maxDistanceMeters" INTEGER NOT NULL DEFAULT 1000,
    "defaultLatitude" DOUBLE PRECISION NOT NULL DEFAULT -23.5505,
    "defaultLongitude" DOUBLE PRECISION NOT NULL DEFAULT -46.6333,
    "vacationDaysPerYear" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_certificates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "MedicalCertificateType" NOT NULL DEFAULT 'MEDICAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "description" TEXT,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "fileKey" TEXT,
    "status" "MedicalCertificateStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_adjustments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_discounts" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_correction_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "originalDate" TIMESTAMP(3) NOT NULL,
    "originalTime" TEXT NOT NULL,
    "originalType" "TimeRecordType" NOT NULL,
    "correctedDate" TIMESTAMP(3) NOT NULL,
    "correctedTime" TEXT NOT NULL,
    "correctedType" "TimeRecordType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_correction_comments" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_correction_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_inss_values" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "inssRescisao" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "inss13" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_inss_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeId_key" ON "employees"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_cnpj_key" ON "company_settings"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "manual_inss_values_employeeId_month_year_key" ON "manual_inss_values"("employeeId", "month", "year");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_records" ADD CONSTRAINT "time_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_records" ADD CONSTRAINT "time_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime" ADD CONSTRAINT "overtime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime" ADD CONSTRAINT "overtime_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_adjustments" ADD CONSTRAINT "salary_adjustments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_adjustments" ADD CONSTRAINT "salary_adjustments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_discounts" ADD CONSTRAINT "salary_discounts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_discounts" ADD CONSTRAINT "salary_discounts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_correction_requests" ADD CONSTRAINT "point_correction_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_correction_requests" ADD CONSTRAINT "point_correction_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_correction_comments" ADD CONSTRAINT "point_correction_comments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "point_correction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_correction_comments" ADD CONSTRAINT "point_correction_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_inss_values" ADD CONSTRAINT "manual_inss_values_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
