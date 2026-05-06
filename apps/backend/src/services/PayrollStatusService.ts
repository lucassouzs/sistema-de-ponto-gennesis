import { prisma } from '../lib/prisma';

export class PayrollStatusService {
  /**
   * Verifica se a folha está finalizada
   */
  async isPayrollFinalized(month: number, year: number): Promise<boolean> {
    try {
      const status = await prisma.payrollStatus.findUnique({
        where: {
          month_year: {
            month,
            year
          }
        }
      });

      return status?.isFinalized || false;
    } catch (error: any) {
      // Se a tabela não existir, retorna false (folha não finalizada)
      if (error?.message?.includes('does not exist') || error?.code === 'P2021' || error?.code === '42P01') {
        console.warn('⚠️  Tabela payroll_status não existe ainda. Retornando false.');
        return false;
      }
      // Para outros erros, loga e retorna false
      console.error('Erro ao verificar status da folha:', error);
      return false;
    }
  }

  /**
   * Finaliza a folha de pagamento
   */
  async finalizePayroll(month: number, year: number, userId: string): Promise<void> {
    try {
      await prisma.payrollStatus.upsert({
        where: {
          month_year: {
            month,
            year
          }
        },
        update: {
          isFinalized: true,
          finalizedBy: userId,
          finalizedAt: new Date()
        },
        create: {
          month,
          year,
          isFinalized: true,
          finalizedBy: userId,
          finalizedAt: new Date()
        }
      });
    } catch (error: any) {
      // Se a tabela não existir, loga o erro mas não quebra
      if (error?.message?.includes('does not exist') || error?.code === 'P2021' || error?.code === '42P01') {
        console.warn('⚠️  Tabela payroll_status não existe ainda. Não é possível finalizar a folha.');
        throw new Error('Tabela payroll_status não existe. Execute as migrations do banco de dados.');
      }
      throw error;
    }
  }

  /**
   * Reabre a folha de pagamento (se necessário)
   */
  async reopenPayroll(month: number, year: number): Promise<void> {
    try {
      await prisma.payrollStatus.update({
        where: {
          month_year: {
            month,
            year
          }
        },
        data: {
          isFinalized: false,
          finalizedBy: null,
          finalizedAt: null
        }
      });
    } catch (error: any) {
      // Se a tabela não existir, loga o erro mas não quebra
      if (error?.message?.includes('does not exist') || error?.code === 'P2021' || error?.code === '42P01') {
        console.warn('⚠️  Tabela payroll_status não existe ainda. Não é possível reabrir a folha.');
        throw new Error('Tabela payroll_status não existe. Execute as migrations do banco de dados.');
      }
      throw error;
    }
  }

  /**
   * Obtém o status da folha
   */
  async getPayrollStatus(month: number, year: number) {
    try {
      return await prisma.payrollStatus.findUnique({
        where: {
          month_year: {
            month,
            year
          }
        },
        include: {
          finalizedByUser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
    } catch (error: any) {
      // Se a tabela não existir, retorna null
      if (error?.message?.includes('does not exist') || error?.code === 'P2021' || error?.code === '42P01') {
        console.warn('⚠️  Tabela payroll_status não existe ainda. Retornando null.');
        return null;
      }
      // Para outros erros, loga e retorna null
      console.error('Erro ao obter status da folha:', error);
      return null;
    }
  }
}
