// Tipos compartilhados entre frontend, mobile e backend

export interface User {
  id: string;
  email: string;
  name: string;
  cpf: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  employee?: Employee;
}

export interface Employee {
  id: string;
  userId: string;
  employeeId: string; // Matrícula
  department: string;
  position: string;
  hireDate: string;
  salary: number;
  workSchedule: WorkSchedule;
  isRemote: boolean;
  allowedLocations?: Location[];
  costCenter?: string; // Centro de custo
  client?: string; // Tomador
  dailyFoodVoucher?: number; // Vale Alimentação diário
  dailyTransportVoucher?: number; // Vale Transporte diário
  
  // Novos campos - Dados da Empresa e Contrato
  company?: string; // EMPRESA
  currentContract?: string; // CONTRATO ATUAL
  
  // Novos campos - Dados Bancários
  bank?: string; // BANCO
  accountType?: string; // TIPO DE CONTA
  agency?: string; // AGÊNCIA
  operation?: string; // OP.
  account?: string; // CONTA
  digit?: string; // DIGITO
  
  // Novos campos - Dados PIX
  pixKeyType?: string; // TIPO DE CHAVE
  pixKey?: string; // CHAVE PIX
  
  // Novos campos - Modalidade e Adicionais
  modality?: string; // MODALIDADE (MEI, CLT, ESTAGIARIO)
  familySalary?: number; // SALÁRIO FAMÍLIA
  dangerPay?: number; // PERICULOSIDADE
  unhealthyPay?: number; // INSALUBRIDADE
  
  createdAt: string;
  updatedAt: string;
}

export interface WorkSchedule {
  startTime: string; // "08:00"
  endTime: string; // "17:00"
  lunchStartTime: string; // "12:00"
  lunchEndTime: string; // "13:00"
  workDays: number[]; // [1,2,3,4,5] - Segunda a Sexta
  toleranceMinutes: number; // 10
}

export interface Location {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // em metros
}

export interface TimeRecord {
  id: string;
  userId: string;
  employeeId: string;
  type: TimeRecordType;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  photoUrl?: string;
  photoKey?: string;
  isValid: boolean;
  reason?: string;
  observation?: string;
  approvedBy?: string;
  approvedAt?: string;
  foodVoucherAmount?: number; // Valor do VA no dia
  transportVoucherAmount?: number; // Valor do VT no dia
  createdAt: string;
  updatedAt: string;
}

export interface Vacation {
  id: string;
  userId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
  type: VacationType;
  status: VacationStatus;
  reason?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Overtime {
  id: string;
  userId: string;
  employeeId: string;
  date: string;
  hours: number;
  type: OvertimeType;
  description?: string;
  status: OvertimeStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  userId: string;
  type: ReportType;
  title: string;
  description?: string;
  data: any; // JSON
  period: ReportPeriod;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettings {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldData?: any;
  newData?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

// Enums
export enum UserRole {
  ADMIN = 'ADMIN',
  HR = 'HR',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE'
}

export enum TimeRecordType {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
  LUNCH_START = 'LUNCH_START',
  LUNCH_END = 'LUNCH_END',
  BREAK_START = 'BREAK_START',
  BREAK_END = 'BREAK_END',
  ABSENCE_JUSTIFIED = 'ABSENCE_JUSTIFIED'
}

export enum VacationType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  MATERNITY = 'MATERNITY',
  PATERNITY = 'PATERNITY',
  EMERGENCY = 'EMERGENCY'
}

export enum VacationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export enum OvertimeType {
  REGULAR = 'REGULAR',
  WEEKEND = 'WEEKEND',
  HOLIDAY = 'HOLIDAY',
  NIGHT = 'NIGHT'
}

export enum OvertimeStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export enum ReportType {
  ATTENDANCE = 'ATTENDANCE',
  OVERTIME = 'OVERTIME',
  VACATION = 'VACATION',
  PRODUCTIVITY = 'PRODUCTIVITY',
  CUSTOM = 'CUSTOM'
}

export enum ReportStatus {
  GENERATED = 'GENERATED',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR'
}

// Novos enums para os campos adicionados
export enum Company {
  ABRASIL = 'ABRASIL',
  GENNESIS = 'GÊNNESIS',
  METRICA = 'MÉTRICA'
}

export enum Bank {
  BANCO_DO_BRASIL = 'BANCO DO BRASIL',
  BRADESCO = 'BRADESCO',
  C6 = 'C6',
  CAIXA_ECONOMICA = 'CAIXA ECONÔMICA',
  CEF = 'CEF',
  INTER = 'INTER',
  ITAU = 'ITAÚ',
  NUBANK = 'NUBANK',
  PICPAY = 'PICPAY',
  SANTANDER = 'SANTANDER'
}

export enum AccountType {
  CONTA_SALARIO = 'CONTA SALÁRIO',
  CONTA_CORRENTE = 'CONTA CORRENTE',
  POUPANCA = 'POUPANÇA'
}

export enum PixKeyType {
  ALEATORIA = 'ALEATÓRIA',
  CELULAR = 'CELULAR',
  CNPJ = 'CNPJ',
  CPF = 'CPF',
  EMAIL = 'E-MAIL'
}

// Interfaces para API
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

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  cpf: string;
  role?: UserRole;
}

export interface PunchRequest {
  type: TimeRecordType;
  latitude?: number;
  longitude?: number;
  photo?: File | string; // File para web, string (base64) para mobile
  observation?: string;
}

export interface VacationRequest {
  startDate: string;
  endDate: string;
  type: VacationType;
  reason?: string;
}

export interface OvertimeRequest {
  date: string;
  hours: number;
  type: OvertimeType;
  description?: string;
}

export interface ReportPeriod {
  startDate: string;
  endDate: string;
}

// Interfaces para cálculos
export interface WorkHoursCalculation {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  lunchHours: number;
  breakHours: number;
  isValid: boolean;
  issues: string[];
}

export interface VacationBalance {
  totalDays: number;
  usedDays: number;
  availableDays: number;
  pendingDays: number;
  nextVacationDate?: string;
}

export interface OvertimeBalance {
  totalHours: number;
  usedHours: number;
  availableHours: number;
  pendingHours: number;
  compensationDeadline?: string;
}

// Interfaces para relatórios
export interface AttendanceReport {
  employeeId: string;
  employeeName: string;
  period: ReportPeriod;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateArrivals: number;
  earlyDepartures: number;
  averageHoursPerDay: number;
  totalOvertime: number;
}

export interface ProductivityReport {
  employeeId: string;
  employeeName: string;
  department: string;
  period: ReportPeriod;
  totalHours: number;
  productiveHours: number;
  efficiency: number; // porcentagem
  punctuality: number; // porcentagem
  overtimeRate: number; // porcentagem
}

// Interfaces para dashboard
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

// Interfaces para notificações
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  createdAt: string;
  data?: any;
}

// Interfaces para configurações
export interface AppConfig {
  apiUrl: string;
  companyName: string;
  companyLogo?: string;
  features: {
    cameraRequired: boolean;
    locationRequired: boolean;
    biometricAuth: boolean;
    offlineMode: boolean;
  };
  limits: {
    maxPhotoSize: number;
    maxDistanceMeters: number;
    maxOvertimeHours: number;
  };
}
