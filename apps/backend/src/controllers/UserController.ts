import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '@prisma/client';

const prisma = new PrismaClient();

export class UserController {
  async getAllUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, search, role, department, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      // Filtro de status (ativo/inativo)
      if (status === 'inactive') {
        where.isActive = false;
      } else if (status === 'all') {
        // Mostrar todos (ativos e inativos)
        // Não adiciona filtro de isActive
      } else {
        // Padrão: apenas ativos
        where.isActive = true;
      }

      // Se não especificar role, mostrar apenas funcionários por padrão
      if (!role) {
        where.role = 'EMPLOYEE';
      }

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { cpf: { contains: search as string } },
        ];
      }

      if (role) {
        where.role = role;
      }

      if (department) {
        where.employee = {
          department: { contains: department as string, mode: 'insensitive' }
        };
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            employee: {
              select: {
                id: true,
                employeeId: true,
                department: true,
                position: true,
                hireDate: true,
                costCenter: true,
                client: true,
                // Novos campos
                company: true,
                currentContract: true,
                bank: true,
                accountType: true,
                agency: true,
                operation: true,
                account: true,
                digit: true,
                pixKeyType: true,
                pixKey: true,
                dailyFoodVoucher: true,
                dailyTransportVoucher: true,
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);

      res.json({
        success: true,
        data: users,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          employee: true,
          timeRecords: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          },
          vacations: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          },
          overtime: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!user) {
        throw createError('Usuário não encontrado', 404);
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  async createUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, password, name, cpf, role, employeeData } = req.body;

      // Verificar se usuário já existe
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { cpf }]
        }
      });

      if (existingUser) {
        throw createError('Usuário já existe com este email ou CPF', 400);
      }

      // Criptografar senha
      const hashedPassword = await bcrypt.hash(password, 12);

      // Criar usuário e funcionário em transação
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name,
            cpf,
            role: role || UserRole.EMPLOYEE,
          }
        });

        if (employeeData) {
          // Validar se a data de contratação é válida
          // Se a data já vem com horário, usar diretamente, senão adicionar timezone
          let hireDate;
          if (employeeData.hireDate.includes('T')) {
            hireDate = new Date(employeeData.hireDate);
          } else {
            hireDate = new Date(employeeData.hireDate + 'T04:00:00');
          }
          
          if (isNaN(hireDate.getTime())) {
            throw new Error('Data de contratação inválida');
          }

          await tx.employee.create({
            data: {
              userId: user.id,
              employeeId: employeeData.employeeId,
              department: employeeData.department,
              position: employeeData.position,
              hireDate: hireDate,
              birthDate: employeeData.birthDate ? new Date(employeeData.birthDate + 'T04:00:00') : null,
              salary: employeeData.salary,
              workSchedule: employeeData.workSchedule || {
                startTime: '08:00',
                endTime: '17:00',
                lunchStartTime: '12:00',
                lunchEndTime: '13:00',
                workDays: [1, 2, 3, 4, 5],
                toleranceMinutes: 10
              },
              isRemote: employeeData.isRemote || false,
              allowedLocations: employeeData.allowedLocations || [],
              costCenter: employeeData.costCenter || null,
              client: employeeData.client || null,
              dailyFoodVoucher: employeeData.dailyFoodVoucher || 33.40,
              dailyTransportVoucher: employeeData.dailyTransportVoucher || 11.00,
              // Novos campos
              company: employeeData.company || null,
              currentContract: employeeData.currentContract || null,
              bank: employeeData.bank || null,
              accountType: employeeData.accountType || null,
              agency: employeeData.agency || null,
              operation: employeeData.operation || null,
              account: employeeData.account || null,
              digit: employeeData.digit || null,
              pixKeyType: employeeData.pixKeyType || null,
              pixKey: employeeData.pixKey || null,
              // Novos campos - Modalidade e Adicionais
              modality: employeeData.modality || null,
              familySalary: employeeData.familySalary !== undefined ? employeeData.familySalary : null,
              dangerPay: employeeData.dangerPay !== undefined ? employeeData.dangerPay : null,
              unhealthyPay: employeeData.unhealthyPay !== undefined ? employeeData.unhealthyPay : null
            }
          });
        }

        return user;
      });

      const newUser = await prisma.user.findUnique({
        where: { id: result.id },
        select: {
          id: true,
          email: true,
          name: true,
          cpf: true,
          role: true,
          isActive: true,
          createdAt: true,
          employee: true
        }
      });

      res.status(201).json({
        success: true,
        data: newUser,
        message: 'Usuário criado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, email, role, isActive, employeeData } = req.body;

      // Verificar se usuário existe
      const existingUser = await prisma.user.findUnique({
        where: { id },
        include: { employee: true }
      });

      if (!existingUser) {
        throw createError('Usuário não encontrado', 404);
      }

      // Verificar se email já existe em outro usuário
      if (email && email !== existingUser.email) {
        const emailExists = await prisma.user.findFirst({
          where: {
            email,
            id: { not: id }
          }
        });

        if (emailExists) {
          throw createError('Email já está em uso', 400);
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        // Atualizar usuário
        const user = await tx.user.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(email && { email }),
            ...(role && { role }),
            ...(isActive !== undefined && { isActive })
          }
        });

        // Atualizar dados do funcionário se fornecidos
        if (employeeData && existingUser.employee) {
          await tx.employee.update({
            where: { userId: id },
            data: {
              ...(employeeData.department && { department: employeeData.department }),
              ...(employeeData.position && { position: employeeData.position }),
              ...(employeeData.salary && { salary: employeeData.salary }),
              ...(employeeData.workSchedule && { workSchedule: employeeData.workSchedule }),
              ...(employeeData.isRemote !== undefined && { isRemote: employeeData.isRemote }),
              ...(employeeData.allowedLocations && { allowedLocations: employeeData.allowedLocations }),
              ...(employeeData.costCenter !== undefined && { costCenter: employeeData.costCenter }),
              ...(employeeData.client !== undefined && { client: employeeData.client }),
              ...(employeeData.birthDate && { birthDate: new Date(employeeData.birthDate + 'T04:00:00') })
            }
          });
        }

        return user;
      });

      const updatedUser = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          cpf: true,
          role: true,
          isActive: true,
          updatedAt: true,
          employee: true
        }
      });

      res.json({
        success: true,
        data: updatedUser,
        message: 'Usuário atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        throw createError('Usuário não encontrado', 404);
      }

      // Soft delete - apenas desativar
      await prisma.user.update({
        where: { id },
        data: { isActive: false }
      });

      res.json({
        success: true,
        message: 'Usuário desativado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyEmployeeData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const employee = await prisma.employee.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              cpf: true,
              role: true
            }
          }
        }
      });

      if (!employee) {
        throw createError('Dados de funcionário não encontrados', 404);
      }

      res.json({
        success: true,
        data: employee
      });
    } catch (error) {
      next(error);
    }
  }

  async updateMyEmployeeData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { department, position, workSchedule, allowedLocations } = req.body;

      const employee = await prisma.employee.findUnique({
        where: { userId }
      });

      if (!employee) {
        throw createError('Dados de funcionário não encontrados', 404);
      }

      const updatedEmployee = await prisma.employee.update({
        where: { userId },
        data: {
          ...(department && { department }),
          ...(position && { position }),
          ...(workSchedule && { workSchedule }),
          ...(allowedLocations && { allowedLocations })
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              cpf: true,
              role: true
            }
          }
        }
      });

      res.json({
        success: true,
        data: updatedEmployee,
        message: 'Dados atualizados com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getUsersByDepartment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { department } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: {
            isActive: true,
            employee: {
              department: { contains: department, mode: 'insensitive' }
            }
          },
          skip,
          take: Number(limit),
          include: {
            employee: {
              select: {
                employeeId: true,
                department: true,
                position: true,
                hireDate: true
              }
            }
          },
          orderBy: { name: 'asc' }
        }),
        prisma.user.count({
          where: {
            isActive: true,
            employee: {
              department: { contains: department, mode: 'insensitive' }
            }
          }
        })
      ]);

      res.json({
        success: true,
        data: users,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
        console.error(error); // Adicione esta linha
      next(error);
    }
  }
}