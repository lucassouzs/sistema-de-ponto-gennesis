# Correções TypeScript - Usar Strings Literais

## 1. Controllers - Remover imports de enums

### MedicalCertificateController.ts
```typescript
// REMOVER esta linha:
import { PrismaClient, MedicalCertificateType, MedicalCertificateStatus, TimeRecordType } from '@prisma/client';

// SUBSTITUIR por:
import { PrismaClient } from '@prisma/client';
```

### OvertimeController.ts
```typescript
// REMOVER esta linha:
import { PrismaClient, OvertimeType, OvertimeStatus } from '@prisma/client';

// SUBSTITUIR por:
import { PrismaClient } from '@prisma/client';
```

### ReportController.ts
```typescript
// REMOVER esta linha:
import { PrismaClient, ReportType, ReportStatus } from '@prisma/client';

// SUBSTITUIR por:
import { PrismaClient } from '@prisma/client';
```

### TimeRecordController.ts
```typescript
// REMOVER esta linha:
import { PrismaClient, TimeRecordType, MedicalCertificateStatus } from '@prisma/client';

// SUBSTITUIR por:
import { PrismaClient } from '@prisma/client';
```

### VacationController.ts
```typescript
// REMOVER esta linha:
import { PrismaClient, VacationType, VacationStatus } from '@prisma/client';

// SUBSTITUIR por:
import { PrismaClient } from '@prisma/client';
```

### UserController.ts
```typescript
// REMOVER esta linha:
import { UserRole } from '@prisma/client';

// SUBSTITUIR por:
// (não precisa importar nada)
```

## 2. Services - Remover imports de enums

### MedicalCertificateService.ts
```typescript
// REMOVER esta linha:
import { PrismaClient, MedicalCertificateType, MedicalCertificateStatus } from '@prisma/client';

// SUBSTITUIR por:
import { PrismaClient } from '@prisma/client';
```

### OvertimeService.ts
```typescript
// REMOVER esta linha:
import { PrismaClient, OvertimeStatus, OvertimeType } from '@prisma/client';

// SUBSTITUIR por:
import { PrismaClient } from '@prisma/client';
```

### SalaryAdjustmentService.ts
```typescript
// REMOVER esta linha:
import { PrismaClient, AdjustmentType } from '@prisma/client';

// SUBSTITUIR por:
import { PrismaClient } from '@prisma/client';
```

### TimeRecordService.ts
```typescript
// REMOVER esta linha:
import { PrismaClient, TimeRecordType } from '@prisma/client';

// SUBSTITUIR por:
import { PrismaClient } from '@prisma/client';
```

### VacationService.ts
```typescript
// REMOVER esta linha:
import { PrismaClient, VacationStatus, VacationType } from '@prisma/client';

// SUBSTITUIR por:
import { PrismaClient } from '@prisma/client';
```

## 3. Usar strings literais no código

Quando você usar os enums no código, use strings literais:

```typescript
// Em vez de:
status: MedicalCertificateStatus.PENDING

// Use:
status: 'PENDING'

// Em vez de:
type: TimeRecordType.ENTRY

// Use:
type: 'ENTRY'

// Em vez de:
role: UserRole.EMPLOYEE

// Use:
role: 'EMPLOYEE'
```

## 4. Adicionar tipos explícitos para parâmetros 'any'

Para todos os parâmetros que dão erro de tipo 'any' implícito, adicione `: any`:

```typescript
// Em vez de:
.map(employee => {

// Use:
.map((employee: any) => {

// Em vez de:
.filter(record => {

// Use:
.filter((record: any) => {

// Em vez de:
.reduce((sum, item) => {

// Use:
.reduce((sum: any, item: any) => {
```

## 5. Valores dos enums para referência

### TimeRecordType
- 'ENTRY'
- 'EXIT'
- 'LUNCH_START'
- 'LUNCH_END'
- 'BREAK_START'
- 'BREAK_END'
- 'ABSENCE_JUSTIFIED'

### MedicalCertificateStatus
- 'PENDING'
- 'APPROVED'
- 'REJECTED'
- 'CANCELLED'

### MedicalCertificateType
- 'MEDICAL'
- 'DENTAL'
- 'PREVENTIVE'
- 'ACCIDENT'
- 'COVID'
- 'MATERNITY'
- 'PATERNITY'
- 'OTHER'

### VacationStatus
- 'PENDING'
- 'APPROVED'
- 'NOTICE_SENT'
- 'NOTICE_CONFIRMED'
- 'IN_PROGRESS'
- 'COMPLETED'
- 'REJECTED'
- 'CANCELLED'
- 'EXPIRED'

### VacationType
- 'ANNUAL'
- 'FRACTIONED_1'
- 'FRACTIONED_2'
- 'FRACTIONED_3'
- 'SICK'
- 'MATERNITY'
- 'PATERNITY'
- 'EMERGENCY'
- 'COLLECTIVE'

### OvertimeStatus
- 'PENDING'
- 'APPROVED'
- 'REJECTED'
- 'CANCELLED'

### OvertimeType
- 'REGULAR'
- 'WEEKEND'
- 'HOLIDAY'
- 'NIGHT'

### ReportStatus
- 'GENERATED'
- 'PROCESSING'
- 'ERROR'

### ReportType
- 'ATTENDANCE'
- 'OVERTIME'
- 'VACATION'
- 'PRODUCTIVITY'
- 'CUSTOM'

### UserRole
- 'EMPLOYEE'

### AdjustmentType
- 'BONUS'
- 'OVERTIME'
- 'COMMISSION'
- 'OTHER'
