import { prisma } from '../lib/prisma';

export interface CreateAdjustmentData {
  employeeId: string;
  type: string;
  description: string;
  amount: number;
  isFixed?: boolean;
  createdBy: string;
}

export interface UpdateAdjustmentData {
  type?: string;
  description?: string;
  amount?: number;
  isFixed?: boolean;
}

export interface SalaryAdjustment {
  id: string;
  employeeId: string;
  type: string;
  description: string;
  amount: number;
  isFixed: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
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

export class SalaryAdjustmentService {
  /**
   * Criar acréscimo salarial
   */
  async createAdjustment(data: CreateAdjustmentData): Promise<SalaryAdjustment> {
    // Validar se o funcionário existe
    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId }
    });

    if (!employee) {
      throw new Error('Funcionário não encontrado');
    }

    // Validar se o usuário que está criando existe
    const creator = await prisma.user.findUnique({
      where: { id: data.createdBy }
    });

    if (!creator) {
      throw new Error('Usuário não encontrado');
    }

    // Criar acréscimo
    const adjustment = await prisma.salaryAdjustment.create({
      data: {
        employeeId: data.employeeId,
        type: data.type as any,
        description: data.description,
        amount: data.amount,
        isFixed: data.isFixed || false,
        createdBy: data.createdBy
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            position: true,
            department: true,
            user: {
              select: {
                name: true
              }
            }
          }
        },
        creator: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return {
      ...adjustment,
      amount: Number(adjustment.amount)
    } as SalaryAdjustment;
  }

  /**
   * Listar acréscimos por funcionário
   */
  async getAdjustmentsByEmployee(employeeId: string): Promise<SalaryAdjustment[]> {
    const adjustments = await prisma.salaryAdjustment.findMany({
      where: {
        employeeId
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            position: true,
            department: true,
            user: {
              select: {
                name: true
              }
            }
          }
        },
        creator: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return adjustments.map((adjustment: any) => ({
      ...adjustment,
      amount: Number(adjustment.amount)
    })) as SalaryAdjustment[];
  }

  /**
   * Atualizar acréscimo
   */
  async updateAdjustment(id: string, data: UpdateAdjustmentData): Promise<SalaryAdjustment> {
    // Verificar se o acréscimo existe
    const existingAdjustment = await prisma.salaryAdjustment.findUnique({
      where: { id }
    });

    if (!existingAdjustment) {
      throw new Error('Acréscimo não encontrado');
    }

    // Atualizar acréscimo
    const adjustment = await prisma.salaryAdjustment.update({
      where: { id },
      data: {
        ...data,
        type: data.type as any,
        updatedAt: new Date()
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            position: true,
            department: true,
            user: {
              select: {
                name: true
              }
            }
          }
        },
        creator: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return {
      ...adjustment,
      amount: Number(adjustment.amount)
    } as SalaryAdjustment;
  }

  /**
   * Deletar acréscimo
   */
  async deleteAdjustment(id: string): Promise<void> {
    // Verificar se o acréscimo existe
    const existingAdjustment = await prisma.salaryAdjustment.findUnique({
      where: { id }
    });

    if (!existingAdjustment) {
      throw new Error('Acréscimo não encontrado');
    }

    await prisma.salaryAdjustment.delete({
      where: { id }
    });
  }

  /**
   * Calcular total de acréscimos por funcionário
   */
  async getTotalAdjustments(employeeId: string): Promise<number> {
    const result = await prisma.salaryAdjustment.aggregate({
      where: {
        employeeId
      },
      _sum: {
        amount: true
      }
    });

    return Number(result._sum.amount) || 0;
  }

  /**
   * Calcular total de acréscimos fixos por funcionário
   */
  async getTotalFixedAdjustments(employeeId: string): Promise<number> {
    const result = await prisma.salaryAdjustment.aggregate({
      where: {
        employeeId,
        isFixed: true
      },
      _sum: {
        amount: true
      }
    });

    return Number(result._sum.amount) || 0;
  }

  /**
   * Calcular total de acréscimos não fixos por funcionário em um período específico
   */
  async getTotalNonFixedAdjustments(employeeId: string, month: number, year: number): Promise<number> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const result = await prisma.salaryAdjustment.aggregate({
      where: {
        employeeId,
        isFixed: false,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        amount: true
      }
    });

    return Number(result._sum.amount) || 0;
  }

  /**
   * Obter acréscimo por ID
   */
  async getAdjustmentById(id: string): Promise<SalaryAdjustment | null> {
    const adjustment = await prisma.salaryAdjustment.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            position: true,
            department: true,
            user: {
              select: {
                name: true
              }
            }
          }
        },
        creator: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return adjustment ? {
      ...adjustment,
      amount: Number(adjustment.amount)
    } as SalaryAdjustment : null;
  }
}
