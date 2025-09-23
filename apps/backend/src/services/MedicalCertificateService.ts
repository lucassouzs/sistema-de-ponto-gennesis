import { PrismaClient, MedicalCertificateType, MedicalCertificateStatus } from '@prisma/client';
import moment from 'moment';

const prisma = new PrismaClient();

export class MedicalCertificateService {
  // Validar sobreposição de atestados
  async validateCertificateOverlap(
    userId: string, 
    startDate: Date, 
    endDate: Date, 
    excludeId?: string
  ): Promise<boolean> {
    const where: any = {
      userId,
      status: {
        in: [MedicalCertificateStatus.PENDING, MedicalCertificateStatus.APPROVED]
      },
      OR: [
        {
          AND: [
            { startDate: { lte: startDate } },
            { endDate: { gte: startDate } }
          ]
        },
        {
          AND: [
            { startDate: { lte: endDate } },
            { endDate: { gte: endDate } }
          ]
        },
        {
          AND: [
            { startDate: { gte: startDate } },
            { endDate: { lte: endDate } }
          ]
        }
      ]
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const overlappingCertificates = await prisma.medicalCertificate.findFirst({
      where
    });

    return !overlappingCertificates; // Retorna true se não há sobreposição
  }

  // Calcular estatísticas de atestados
  async getCertificateStats(userId?: string) {
    const where = userId ? { userId } : {};

    const [
      total,
      pending,
      approved,
      rejected,
      cancelled
    ] = await Promise.all([
      prisma.medicalCertificate.count({ where }),
      prisma.medicalCertificate.count({ 
        where: { ...where, status: MedicalCertificateStatus.PENDING } 
      }),
      prisma.medicalCertificate.count({ 
        where: { ...where, status: MedicalCertificateStatus.APPROVED } 
      }),
      prisma.medicalCertificate.count({ 
        where: { ...where, status: MedicalCertificateStatus.REJECTED } 
      }),
      prisma.medicalCertificate.count({ 
        where: { ...where, status: MedicalCertificateStatus.CANCELLED } 
      })
    ]);

    return {
      total,
      pending,
      approved,
      rejected,
      cancelled,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0
    };
  }

  // Buscar atestados por período
  async getCertificatesByPeriod(startDate: Date, endDate: Date, userId?: string) {
    const where: any = {
      OR: [
        {
          AND: [
            { startDate: { lte: endDate } },
            { endDate: { gte: startDate } }
          ]
        }
      ]
    };

    if (userId) {
      where.userId = userId;
    }

    return await prisma.medicalCertificate.findMany({
      where,
      include: {
        user: {
          select: { name: true, email: true }
        },
        employee: {
          select: { employeeId: true, department: true, position: true }
        },
        approver: {
          select: { name: true, email: true }
        }
      },
      orderBy: {
        startDate: 'asc'
      }
    });
  }

  // Gerar relatório de atestados
  async generateCertificateReport(startDate: Date, endDate: Date) {
    const certificates = await this.getCertificatesByPeriod(startDate, endDate);

    // Agrupar por tipo
    const byType = certificates.reduce((acc, cert) => {
      acc[cert.type] = (acc[cert.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Agrupar por status
    const byStatus = certificates.reduce((acc, cert) => {
      acc[cert.status] = (acc[cert.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Agrupar por funcionário
    const byEmployee = certificates.reduce((acc, cert) => {
      const employeeName = cert.user.name;
      if (!acc[employeeName]) {
        acc[employeeName] = {
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          days: 0
        };
      }
      acc[employeeName].total++;
      acc[employeeName][cert.status.toLowerCase()]++;
      acc[employeeName].days += cert.days;
      return acc;
    }, {} as Record<string, any>);

    // Calcular totais
    const totalDays = certificates.reduce((sum, cert) => sum + cert.days, 0);
    const averageDays = certificates.length > 0 ? Math.round(totalDays / certificates.length * 100) / 100 : 0;

    return {
      period: {
        startDate: moment(startDate).format('DD/MM/YYYY'),
        endDate: moment(endDate).format('DD/MM/YYYY')
      },
      summary: {
        totalCertificates: certificates.length,
        totalDays,
        averageDays,
        byType,
        byStatus
      },
      byEmployee,
      certificates
    };
  }

  // Verificar se funcionário tem atestado ativo em uma data
  async hasActiveCertificateOnDate(userId: string, date: Date): Promise<boolean> {
    const certificate = await prisma.medicalCertificate.findFirst({
      where: {
        userId,
        startDate: { lte: date },
        endDate: { gte: date },
        status: MedicalCertificateStatus.APPROVED
      }
    });

    return !!certificate;
  }

  // Buscar atestados próximos ao vencimento (para notificações)
  async getCertificatesExpiringSoon(days: number = 3) {
    const futureDate = moment().add(days, 'days').toDate();

    return await prisma.medicalCertificate.findMany({
      where: {
        endDate: {
          lte: futureDate,
          gte: new Date()
        },
        status: MedicalCertificateStatus.APPROVED
      },
      include: {
        user: {
          select: { name: true, email: true }
        },
        employee: {
          select: { employeeId: true, department: true }
        }
      }
    });
  }

  // Buscar atestados pendentes há muito tempo
  async getOldPendingCertificates(days: number = 7) {
    const oldDate = moment().subtract(days, 'days').toDate();

    return await prisma.medicalCertificate.findMany({
      where: {
        status: MedicalCertificateStatus.PENDING,
        submittedAt: {
          lte: oldDate
        }
      },
      include: {
        user: {
          select: { name: true, email: true }
        },
        employee: {
          select: { employeeId: true, department: true }
        }
      },
      orderBy: {
        submittedAt: 'asc'
      }
    });
  }

  // Obter tipos de atestado mais comuns
  async getMostCommonCertificateTypes(limit: number = 5) {
    const result = await prisma.medicalCertificate.groupBy({
      by: ['type'],
      _count: {
        type: true
      },
      orderBy: {
        _count: {
          type: 'desc'
        }
      },
      take: limit
    });

    return result.map(item => ({
      type: item.type,
      count: item._count.type
    }));
  }

  // Calcular tempo médio de aprovação
  async getAverageApprovalTime() {
    const approvedCertificates = await prisma.medicalCertificate.findMany({
      where: {
        status: MedicalCertificateStatus.APPROVED,
        approvedAt: { not: null }
      },
      select: {
        submittedAt: true,
        approvedAt: true
      }
    });

    if (approvedCertificates.length === 0) {
      return 0;
    }

    const totalHours = approvedCertificates.reduce((sum, cert) => {
      const submitted = moment(cert.submittedAt);
      const approved = moment(cert.approvedAt!);
      return sum + approved.diff(submitted, 'hours', true);
    }, 0);

    return Math.round((totalHours / approvedCertificates.length) * 100) / 100;
  }
}
