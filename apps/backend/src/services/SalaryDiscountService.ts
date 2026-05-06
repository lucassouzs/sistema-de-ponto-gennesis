import { prisma } from '../lib/prisma';

export interface SalaryDiscount {
  id: string;
  employeeId: string;
  type: 'FINE' | 'CONSIGNED' | 'OTHER';
  description: string;
  amount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  employee: {
    id: string;
    user: {
      name: string;
    };
    department: string;
    employeeId: string;
    position: string;
  };
  creator: {
    id: string;
    name: string;
  };
}

export interface CreateDiscountData {
  employeeId: string;
  type: 'FINE' | 'CONSIGNED' | 'OTHER';
  description: string;
  amount: number;
  createdBy: string;
}

export interface UpdateDiscountData {
  type?: 'FINE' | 'CONSIGNED' | 'OTHER';
  description?: string;
  amount?: number;
}

export class SalaryDiscountService {
  /**
   * Cria um novo desconto salarial
   */
  async createDiscount(data: CreateDiscountData): Promise<SalaryDiscount> {
    const discount = await prisma.salaryDiscount.create({
      data: {
        employeeId: data.employeeId,
        type: data.type,
        description: data.description,
        amount: data.amount,
        createdBy: data.createdBy,
      },
      include: {
        employee: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      ...discount,
      amount: Number(discount.amount)
    } as SalaryDiscount;
  }

  /**
   * Obtém todos os descontos de um funcionário
   */
  async getDiscountsByEmployee(employeeId: string): Promise<SalaryDiscount[]> {
    const discounts = await prisma.salaryDiscount.findMany({
      where: {
        employeeId,
      },
      include: {
        employee: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return discounts.map((discount: any) => ({
      ...discount,
      amount: Number(discount.amount)
    })) as SalaryDiscount[];
  }

  /**
   * Atualiza um desconto salarial
   */
  async updateDiscount(id: string, data: UpdateDiscountData): Promise<SalaryDiscount> {
    const discount = await prisma.salaryDiscount.update({
      where: { id },
      data: {
        ...data,
        amount: data.amount,
      },
      include: {
        employee: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      ...discount,
      amount: Number(discount.amount)
    } as SalaryDiscount;
  }

  /**
   * Remove um desconto salarial
   */
  async deleteDiscount(id: string): Promise<void> {
    await prisma.salaryDiscount.delete({
      where: { id },
    });
  }

  /**
   * Obtém um desconto por ID
   */
  async getDiscountById(id: string): Promise<SalaryDiscount | null> {
    const discount = await prisma.salaryDiscount.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!discount) {
      return null;
    }

    return {
      ...discount,
      amount: Number(discount.amount)
    } as SalaryDiscount;
  }
}
