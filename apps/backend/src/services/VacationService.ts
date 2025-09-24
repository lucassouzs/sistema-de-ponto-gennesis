import { PrismaClient, VacationStatus, VacationType } from '@prisma/client';
import moment from 'moment';

const prisma = new PrismaClient();

export interface VacationBalance {
  totalDays: number;
  usedDays: number;
  availableDays: number;
  pendingDays: number;
  nextVacationDate?: Date;
  expiresAt?: Date;
  aquisitiveStart?: Date;
  aquisitiveEnd?: Date;
  concessiveEnd?: Date;
}

export interface VacationRequest {
  startDate: Date;
  endDate: Date;
  type: VacationType;
  reason?: string;
  fraction?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ComplianceReport {
  totalEmployees: number;
  expiredVacations: Array<{
    userId: string;
    employeeName: string;
    department: string;
    expiresAt: Date;
    availableDays: number;
  }>;
  pendingApprovals: number;
  upcomingExpirations: number;
  complianceRate: number;
  penalties: number;
}

export interface VacationSummary {
  totalEmployees: number;
  totalVacations: number;
  approvedVacations: number;
  pendingVacations: number;
  rejectedVacations: number;
  totalDaysUsed: number;
  totalDaysPending: number;
  averageDaysPerEmployee: number;
  byDepartment: Array<{
    department: string;
    totalEmployees: number;
    totalVacations: number;
    totalDays: number;
  }>;
  byMonth: Array<{
    month: string;
    totalVacations: number;
    totalDays: number;
  }>;
}

export class VacationService {
  /**
   * Calcula o saldo de férias de um funcionário
   */
  async getVacationBalance(userId: string): Promise<VacationBalance> {
    // Buscar dados do funcionário
    const employee = await prisma.employee.findUnique({
      where: { userId }
    });

    if (!employee) {
      throw new Error('Funcionário não encontrado');
    }

    // Buscar configurações da empresa
    const companySettings = await prisma.companySettings.findFirst();
    const vacationDaysPerYear = companySettings?.vacationDaysPerYear || 30;

    // Calcular período aquisitivo (12 meses a partir da data de contratação)
    const hireDate = moment(employee.hireDate);
    const currentDate = moment();
    
    // Calcular quantos períodos aquisitivos completos o funcionário tem
    const yearsWorked = currentDate.diff(hireDate, 'years');
    const totalDays = Math.min(yearsWorked * vacationDaysPerYear, vacationDaysPerYear * 2); // Máximo 2 anos

    // Buscar férias aprovadas e usadas
    const usedVacations = await prisma.vacation.findMany({
      where: {
        userId,
        status: VacationStatus.APPROVED,
        type: VacationType.ANNUAL
      }
    });

    const usedDays = usedVacations.reduce((total, vacation) => total + vacation.days, 0);

    // Buscar férias pendentes
    const pendingVacations = await prisma.vacation.findMany({
      where: {
        userId,
        status: VacationStatus.PENDING,
        type: VacationType.ANNUAL
      }
    });

    const pendingDays = pendingVacations.reduce((total, vacation) => total + vacation.days, 0);

    // Calcular próximo período de férias
    const nextVacationDate = this.calculateNextVacationDate(hireDate, currentDate);
    
    // Calcular data de vencimento das férias (período concessivo)
    const expiresAt = this.calculateVacationExpiration(hireDate, currentDate);

    // Calcular períodos aquisitivo e concessivo
    const aquisitiveStart = hireDate.clone().add(Math.floor(yearsWorked), 'years').toDate();
    const aquisitiveEnd = hireDate.clone().add(Math.floor(yearsWorked) + 1, 'years').toDate();
    const concessiveEnd = aquisitiveEnd;

    return {
      totalDays,
      usedDays,
      availableDays: Math.max(0, totalDays - usedDays),
      pendingDays,
      nextVacationDate: nextVacationDate.toDate(),
      expiresAt: expiresAt ? expiresAt.toDate() : undefined,
      aquisitiveStart,
      aquisitiveEnd,
      concessiveEnd: new Date(concessiveEnd.getTime() + (12 * 30 * 24 * 60 * 60 * 1000)) // +12 meses
    };
  }

  /**
   * Calcula o número de dias úteis entre duas datas
   */
  calculateVacationDays(startDate: Date, endDate: Date): number {
    const start = moment(startDate);
    const end = moment(endDate);
    let days = 0;

    while (start.isSameOrBefore(end, 'day')) {
      // Contar apenas dias úteis (segunda a sexta)
      if (start.day() >= 1 && start.day() <= 5) {
        days++;
      }
      start.add(1, 'day');
    }

    return days;
  }

  /**
   * Calcula a próxima data em que o funcionário pode tirar férias
   */
  private calculateNextVacationDate(hireDate: moment.Moment, currentDate: moment.Moment): moment.Moment {
    // Primeiro período aquisitivo: 12 meses após a contratação
    const firstPeriodEnd = hireDate.clone().add(12, 'months');
    
    if (currentDate.isBefore(firstPeriodEnd)) {
      return firstPeriodEnd;
    }

    // Períodos subsequentes: a cada 12 meses
    const yearsWorked = currentDate.diff(hireDate, 'years');
    return hireDate.clone().add(yearsWorked + 1, 'years');
  }

  /**
   * Calcula quando as férias vencem (período concessivo)
   */
  private calculateVacationExpiration(hireDate: moment.Moment, currentDate: moment.Moment): moment.Moment | null {
    // Verificar se o funcionário já completou o período aquisitivo
    const yearsWorked = currentDate.diff(hireDate, 'years');
    
    // Se não completou 1 ano, não tem férias para vencer
    if (yearsWorked < 1) {
      return null;
    }
    
    // Calcular o fim do período aquisitivo mais recente
    const completedYears = Math.floor(yearsWorked);
    const acquisitionPeriodEnd = hireDate.clone().add(completedYears, 'years');
    
    // Período concessivo: 12 meses após o período aquisitivo
    return acquisitionPeriodEnd.clone().add(12, 'months');
  }

  /**
   * Verifica se o funcionário pode tirar férias
   */
  async canTakeVacation(userId: string, startDate: Date, endDate: Date): Promise<{
    canTake: boolean;
    reason?: string;
    availableDays: number;
  }> {
    const balance = await this.getVacationBalance(userId);
    const requestedDays = this.calculateVacationDays(startDate, endDate);

    if (balance.availableDays < requestedDays) {
      return {
        canTake: false,
        reason: `Saldo insuficiente. Disponível: ${balance.availableDays} dias, solicitado: ${requestedDays} dias`,
        availableDays: balance.availableDays
      };
    }

    if (balance.expiresAt && new Date() > balance.expiresAt) {
      return {
        canTake: false,
        reason: 'Período concessivo vencido',
        availableDays: balance.availableDays
      };
    }

    return {
      canTake: true,
      availableDays: balance.availableDays
    };
  }

  /**
   * Gera relatório de férias
   */
  async getVacationSummary(params: {
    year: number;
    department?: string;
  }): Promise<VacationSummary> {
    const { year, department } = params;

    const startYear = new Date(year, 0, 1);
    const endYear = new Date(year, 11, 31);

    const where: any = {
      startDate: {
        gte: startYear,
        lte: endYear
      }
    };

    if (department) {
      where.employee = {
        department: { contains: department, mode: 'insensitive' }
      };
    }

    // Buscar todas as férias do período
    const vacations = await prisma.vacation.findMany({
      where,
      include: {
        employee: {
          select: { department: true }
        }
      }
    });

    // Buscar total de funcionários
    const employeeWhere: any = {};
    if (department) {
      employeeWhere.department = { contains: department, mode: 'insensitive' };
    }

    const totalEmployees = await prisma.employee.count({
      where: employeeWhere
    });

    // Calcular estatísticas
    const totalVacations = vacations.length;
    const approvedVacations = vacations.filter(v => v.status === VacationStatus.APPROVED).length;
    const pendingVacations = vacations.filter(v => v.status === VacationStatus.PENDING).length;
    const rejectedVacations = vacations.filter(v => v.status === VacationStatus.REJECTED).length;

    const totalDaysUsed = vacations
      .filter(v => v.status === VacationStatus.APPROVED)
      .reduce((total, v) => total + v.days, 0);

    const totalDaysPending = vacations
      .filter(v => v.status === VacationStatus.PENDING)
      .reduce((total, v) => total + v.days, 0);

    const averageDaysPerEmployee = totalEmployees > 0 ? totalDaysUsed / totalEmployees : 0;

    // Agrupar por departamento
    const byDepartment = new Map<string, {
      department: string;
      totalEmployees: number;
      totalVacations: number;
      totalDays: number;
    }>();

    vacations.forEach(vacation => {
      const dept = vacation.employee.department;
      if (!byDepartment.has(dept)) {
        byDepartment.set(dept, {
          department: dept,
          totalEmployees: 0,
          totalVacations: 0,
          totalDays: 0
        });
      }

      const deptData = byDepartment.get(dept)!;
      deptData.totalVacations++;
      deptData.totalDays += vacation.days;
    });

    // Contar funcionários por departamento
    const employeesByDept = await prisma.employee.groupBy({
      by: ['department'],
      where: employeeWhere,
      _count: { department: true }
    });

    employeesByDept.forEach(emp => {
      if (byDepartment.has(emp.department)) {
        byDepartment.get(emp.department)!.totalEmployees = emp._count.department;
      }
    });

    // Agrupar por mês
    const byMonth = new Map<string, {
      month: string;
      totalVacations: number;
      totalDays: number;
    }>();

    vacations.forEach(vacation => {
      const month = moment(vacation.startDate).format('YYYY-MM');
      if (!byMonth.has(month)) {
        byMonth.set(month, {
          month,
          totalVacations: 0,
          totalDays: 0
        });
      }

      const monthData = byMonth.get(month)!;
      monthData.totalVacations++;
      monthData.totalDays += vacation.days;
    });

    return {
      totalEmployees,
      totalVacations,
      approvedVacations,
      pendingVacations,
      rejectedVacations,
      totalDaysUsed,
      totalDaysPending,
      averageDaysPerEmployee,
      byDepartment: Array.from(byDepartment.values()),
      byMonth: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month))
    };
  }

  /**
   * Calcula o 1/3 constitucional das férias
   */
  calculateConstitutionalThird(vacationDays: number): number {
    return Math.ceil(vacationDays / 3);
  }

  /**
   * Verifica se as férias estão vencendo
   */
  async getExpiringVacations(daysBeforeExpiration: number = 30): Promise<Array<{
    userId: string;
    employeeName: string;
    department: string;
    expiresAt: Date;
    availableDays: number;
  }>> {
    const expirationDate = moment().add(daysBeforeExpiration, 'days').toDate();

    // Buscar funcionários com férias próximas do vencimento
    const employees = await prisma.employee.findMany({
      include: {
        user: {
          select: { name: true }
        }
      }
    });

    const expiringVacations = [];

    for (const employee of employees) {
      const balance = await this.getVacationBalance(employee.userId);
      
      if (balance.expiresAt && balance.expiresAt <= expirationDate && balance.availableDays > 0) {
        expiringVacations.push({
          userId: employee.userId,
          employeeName: employee.user.name,
          department: employee.department,
          expiresAt: balance.expiresAt,
          availableDays: balance.availableDays
        });
      }
    }

    return expiringVacations.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  }

  /**
   * Valida uma solicitação de férias conforme regras trabalhistas
   */
  async validateVacationRequest(userId: string, request: VacationRequest): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Buscar dados do funcionário
    const employee = await prisma.employee.findUnique({
      where: { userId }
    });

    if (!employee) {
      errors.push('Funcionário não encontrado');
      return { isValid: false, errors, warnings };
    }

    // Validar período aquisitivo
    const hireDate = moment(employee.hireDate);
    const currentDate = moment();
    const yearsWorked = currentDate.diff(hireDate, 'years');

    if (yearsWorked < 1) {
      errors.push('Funcionário deve trabalhar pelo menos 12 meses para ter direito a férias');
    }

    // Validar datas
    const startDate = moment(request.startDate);
    const endDate = moment(request.endDate);

    if (startDate.isBefore(currentDate)) {
      errors.push('Data de início deve ser futura');
    }

    if (endDate.isBefore(startDate)) {
      errors.push('Data de fim deve ser posterior à data de início');
    }

    // Validar aviso de 30 dias
    const noticeDays = startDate.diff(currentDate, 'days');
    if (noticeDays < 30) {
      warnings.push('Aviso de férias deve ser dado com pelo menos 30 dias de antecedência');
    }

    // Validar restrição de feriados
    const twoDaysBefore = startDate.clone().subtract(2, 'days');
    if (twoDaysBefore.day() === 0 || twoDaysBefore.day() === 6) { // Domingo ou sábado
      errors.push('Férias não podem iniciar 2 dias antes de feriados ou repousos semanais');
    }

    // Validar fracionamento
    if (request.fraction) {
      const validation = await this.validateFractioning(userId, request);
      if (!validation.isValid) {
        errors.push(...validation.errors);
        warnings.push(...validation.warnings);
      }
    }

    // Validar saldo
    const balance = await this.getVacationBalance(userId);
    const requestedDays = this.calculateVacationDays(request.startDate, request.endDate);

    if (balance.availableDays < requestedDays) {
      errors.push(`Saldo insuficiente. Disponível: ${balance.availableDays} dias, solicitado: ${requestedDays} dias`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Valida fracionamento de férias
   */
  private async validateFractioning(userId: string, request: VacationRequest): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!request.fraction || request.fraction < 1 || request.fraction > 3) {
      errors.push('Fracionamento deve ser entre 1 e 3 períodos');
      return { isValid: false, errors, warnings };
    }

    // Buscar férias fracionadas existentes
    const existingFractions = await prisma.vacation.findMany({
      where: {
        userId,
        type: {
          in: [VacationType.FRACTIONED_1, VacationType.FRACTIONED_2, VacationType.FRACTIONED_3]
        },
        status: {
          in: [VacationStatus.PENDING, VacationStatus.APPROVED, VacationStatus.IN_PROGRESS]
        }
      }
    });

    // Verificar se já existe o mesmo fracionamento
    const existingFraction = existingFractions.find(f => {
      const fractionType = this.getFractionType(f.type);
      return fractionType === request.fraction;
    });

    if (existingFraction) {
      errors.push(`Já existe uma solicitação para o ${request.fraction}º período fracionado`);
    }

    // Validar período mínimo
    const requestedDays = this.calculateVacationDays(request.startDate, request.endDate);

    if (request.fraction === 1) {
      if (requestedDays < 14) {
        errors.push('O 1º período fracionado deve ter pelo menos 14 dias corridos');
      }
    } else {
      if (requestedDays < 5) {
        errors.push('Os períodos fracionados (2º e 3º) devem ter pelo menos 5 dias corridos cada');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Obtém o número do fracionamento baseado no tipo
   */
  private getFractionType(type: VacationType): number | null {
    switch (type) {
      case VacationType.FRACTIONED_1: return 1;
      case VacationType.FRACTIONED_2: return 2;
      case VacationType.FRACTIONED_3: return 3;
      default: return null;
    }
  }

  /**
   * Envia aviso de férias
   */
  async sendVacationNotice(vacationId: string): Promise<void> {
    const vacation = await prisma.vacation.findUnique({
      where: { id: vacationId }
    });

    if (!vacation) {
      throw new Error('Solicitação de férias não encontrada');
    }

    if (vacation.status !== VacationStatus.APPROVED) {
      throw new Error('Apenas férias aprovadas podem ter aviso enviado');
    }

    await prisma.vacation.update({
      where: { id: vacationId },
      data: {
        status: VacationStatus.NOTICE_SENT,
        noticeSentAt: new Date()
      }
    });
  }

  /**
   * Confirma recebimento do aviso
   */
  async confirmVacationNotice(vacationId: string): Promise<void> {
    const vacation = await prisma.vacation.findUnique({
      where: { id: vacationId }
    });

    if (!vacation) {
      throw new Error('Solicitação de férias não encontrada');
    }

    if (vacation.status !== VacationStatus.NOTICE_SENT) {
      throw new Error('Aviso deve ter sido enviado primeiro');
    }

    await prisma.vacation.update({
      where: { id: vacationId },
      data: {
        status: VacationStatus.NOTICE_CONFIRMED,
        noticeReceivedAt: new Date()
      }
    });
  }

  /**
   * Gera relatório de conformidade trabalhista
   */
  async getComplianceReport(): Promise<ComplianceReport> {
    const totalEmployees = await prisma.employee.count();
    const expiredVacations = await this.getExpiringVacations(0); // Já vencidas
    const upcomingExpirations = (await this.getExpiringVacations(30)).length;
    const pendingApprovals = await prisma.vacation.count({
      where: { status: VacationStatus.PENDING }
    });

    const complianceRate = totalEmployees > 0 ? 
      ((totalEmployees - expiredVacations.length) / totalEmployees) * 100 : 100;

    const penalties = expiredVacations.length * 2; // Penalidade em dobro

    return {
      totalEmployees,
      expiredVacations,
      pendingApprovals,
      upcomingExpirations,
      complianceRate,
      penalties
    };
  }

  /**
   * Calcula o valor do pagamento das férias
   */
  async calculateVacationPayment(vacationId: string): Promise<{
    salaryAmount: number;
    constitutionalThird: number;
    totalAmount: number;
  }> {
    const vacation = await prisma.vacation.findUnique({
      where: { id: vacationId },
      include: {
        employee: true
      }
    });

    if (!vacation) {
      throw new Error('Solicitação de férias não encontrada');
    }

    const dailySalary = Number(vacation.employee.salary) / 30;
    const salaryAmount = dailySalary * vacation.days;
    const constitutionalThird = salaryAmount / 3;
    const totalAmount = salaryAmount + constitutionalThird;

    return {
      salaryAmount,
      constitutionalThird,
      totalAmount
    };
  }
}
