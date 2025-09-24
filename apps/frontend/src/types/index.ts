// Re-exportar tipos do pacote compartilhado
export * from '../../../../packages/types';

// Tipos específicos do frontend
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T = any> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DashboardStats {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  pendingVacations: number;
  pendingOvertime: number;
  averageAttendance: number;
  topDepartments: Array<{
    department: string;
    attendance: number;
  }>;
}

export interface TimeRecordFormData {
  type: string;
  latitude?: number;
  longitude?: number;
  photo?: string | File;
  observation?: string;
}

export interface VacationFormData {
  startDate: string;
  endDate: string;
  type: string;
  reason?: string;
  fraction?: number;
  aquisitiveStart?: string;
  aquisitiveEnd?: string;
}

export interface VacationBalance {
  totalDays: number;
  usedDays: number;
  availableDays: number;
  pendingDays: number;
  nextVacationDate?: string;
  expiresAt?: string;
  aquisitiveStart?: string;
  aquisitiveEnd?: string;
  concessiveEnd?: string;
}

export interface Vacation {
  id: string;
  userId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
  type: string;
  status: string;
  fraction?: number;
  aquisitiveStart?: string;
  aquisitiveEnd?: string;
  concessiveEnd?: string;
  noticeSentAt?: string;
  noticeReceivedAt?: string;
  paymentDate?: string;
  paymentAmount?: number;
  reason?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  user: {
    name: string;
    email: string;
  };
  employee: {
    employeeId: string;
    department: string;
    position: string;
  };
}

export interface ComplianceReport {
  totalEmployees: number;
  expiredVacations: Array<{
    userId: string;
    employeeName: string;
    department: string;
    expiresAt: string;
    availableDays: number;
  }>;
  pendingApprovals: number;
  upcomingExpirations: number;
  complianceRate: number;
  penalties: number;
}

export interface VacationPayment {
  salaryAmount: number;
  constitutionalThird: number;
  totalAmount: number;
}

export interface VacationValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface OvertimeFormData {
  date: string;
  hours: number;
  type: string;
  description?: string;
}

export interface MedicalCertificateFormData {
  type: string;
  startDate: string;
  endDate: string;
  description?: string;
  file?: File;
}

export interface MedicalCertificate {
  id: string;
  userId: string;
  employeeId: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  description?: string;
  fileName?: string;
  fileUrl?: string;
  fileKey?: string;
  status: string;
  reason?: string;
  approvedBy?: string;
  approvedAt?: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  user: {
    name: string;
    email: string;
  };
  employee: {
    employeeId: string;
    department: string;
    position: string;
  };
  approver?: {
    name: string;
    email: string;
  };
}

export interface MedicalCertificateDetails {
  startDate: string;
  endDate: string;
  days: number;
  submittedAt: string;
  description?: string;
  type: string;
}

export interface TimeRecordWithDetails {
  id: string;
  userId: string;
  employeeId: string;
  type: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  photoUrl?: string;
  observation?: string;
  isValid: boolean;
  createdAt: string;
  updatedAt: string;
  foodVoucherAmount?: number;
  transportVoucherAmount?: number;
  employee?: {
    employeeId: string;
    department: string;
  };
  medicalCertificateDetails?: MedicalCertificateDetails;
}

export interface UserFormData {
  email: string;
  name: string;
  cpf: string;
  role: string;
  employeeData?: {
    employeeId: string;
    department: string;
    position: string;
    hireDate: string;
    salary: number;
    workSchedule?: any;
    isRemote: boolean;
    allowedLocations?: any[];
    // Novos campos
    company?: string;
    currentContract?: string;
    bank?: string;
    accountType?: string;
    agency?: string;
    operation?: string;
    account?: string;
    digit?: string;
    pixKeyType?: string;
    pixKey?: string;
  };
}

export interface CompanySettingsFormData {
  name: string;
  cnpj: string;
  address: string;
  phone?: string;
  email?: string;
  workStartTime: string;
  workEndTime: string;
  lunchStartTime: string;
  lunchEndTime: string;
  toleranceMinutes: number;
  maxOvertimeHours: number;
  maxDistanceMeters: number;
  defaultLatitude: number;
  defaultLongitude: number;
  vacationDaysPerYear: number;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
}

export interface PhotoData {
  file: File;
  preview: string;
  base64?: string;
}

export interface NotificationData {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  createdAt: string;
  data?: any;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }>;
}

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
}

export interface FilterOption {
  label: string;
  value: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'number' | 'date' | 'time' | 'select' | 'textarea' | 'file';
  required?: boolean;
  placeholder?: string;
  options?: SelectOption[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: RegExp;
    message?: string;
  };
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
}

export interface MenuItem {
  label: string;
  href: string;
  icon?: React.ComponentType;
  badge?: string | number;
  children?: MenuItem[];
  roles?: string[];
}

export interface Theme {
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };
}

// Tipos para Folha de Pagamento
export interface PayrollEmployee {
  id: string;
  name: string;
  position: string;
  department: string;
  employeeId: string;
  company: string | null;
  currentContract: string | null;
  costCenter: string | null;
  client: string | null;
  cpf: string;
  bank: string | null;
  accountType: string | null;
  agency: string | null;
  operation: string | null;
  account: string | null;
  digit: string | null;
  pixKeyType: string | null;
  pixKey: string | null;
  modality: string | null;
  familySalary: number;
  dangerPay: number; // Porcentagem (0, 30, 40)
  unhealthyPay: number; // Porcentagem (0, 10, 20, 40)
  salary: number;
  dailyFoodVoucher: number;
  dailyTransportVoucher: number;
  totalFoodVoucher: number;
  totalTransportVoucher: number;
  totalAdjustments: number;
  totalDiscounts: number;
  daysWorked: number;
  totalWorkingDays: number;
}

export interface MonthlyPayrollData {
  employees: PayrollEmployee[];
  period: {
    month: number;
    year: number;
    monthName: string;
  };
  totals: {
    totalEmployees: number;
    totalFoodVoucher: number;
    totalTransportVoucher: number;
    totalAdjustments: number;
    totalDiscounts: number;
  };
}

export interface PayrollFilters {
  search?: string;
  company?: string;
  department?: string;
  month: number;
  year: number;
}

export interface PayrollStats {
  company?: string;
  department?: string;
  totalEmployees: number;
  totalFoodVoucher: number;
  totalTransportVoucher: number;
}

export interface PayrollPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Tipos para Acréscimos Salariais
export type AdjustmentType = 'BONUS' | 'OVERTIME' | 'COMMISSION' | 'OTHER';

export interface SalaryAdjustment {
  id: string;
  employeeId: string;
  type: AdjustmentType;
  description: string;
  amount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    employeeId: string;
    position: string;
    department: string;
    user: {
      name: string;
    };
  };
  creator: {
    id: string;
    name: string;
  };
}

export interface CreateAdjustmentData {
  employeeId: string;
  type: AdjustmentType;
  description: string;
  amount: number;
}

export interface UpdateAdjustmentData {
  type?: AdjustmentType;
  description?: string;
  amount?: number;
}

export interface AdjustmentTypeOption {
  value: AdjustmentType;
  label: string;
  color: string;
}

// Tipos para Descontos Salariais
export type DiscountType = 'FINE' | 'CONSIGNED' | 'OTHER';

export interface SalaryDiscount {
  id: string;
  employeeId: string;
  type: DiscountType;
  description: string;
  amount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    employeeId: string;
    position: string;
    department: string;
    user: {
      name: string;
    };
  };
  creator: {
    id: string;
    name: string;
  };
}

export interface CreateDiscountData {
  employeeId: string;
  type: DiscountType;
  description: string;
  amount: number;
}

export interface UpdateDiscountData {
  type?: DiscountType;
  description?: string;
  amount?: number;
}

export interface DiscountTypeOption {
  value: DiscountType;
  label: string;
  color: string;
}