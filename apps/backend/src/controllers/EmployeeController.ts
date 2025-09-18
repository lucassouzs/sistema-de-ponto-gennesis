import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const getAllEmployees = async (req: Request, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            cpf: true,
            role: true,
            isActive: true
          }
        }
      },
      orderBy: {
        user: {
          name: 'asc'
        }
      }
    });

    // Buscar a última foto de cada funcionário
    const employeesWithPhotos = await Promise.all(
      employees.map(async (employee) => {
        const lastTimeRecord = await prisma.timeRecord.findFirst({
          where: {
            userId: employee.userId,
            photoUrl: {
              not: null
            }
          },
          orderBy: {
            timestamp: 'desc'
          },
          select: {
            photoUrl: true
          }
        });

        return {
          ...employee,
          lastPhotoUrl: lastTimeRecord?.photoUrl || null
        };
      })
    );

    return res.json({
      success: true,
      data: employeesWithPhotos
    });
  } catch (error) {
    console.error('Erro ao buscar funcionários:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const getEmployeeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            cpf: true,
            role: true,
            isActive: true
          }
        }
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    return res.json(employee);
  } catch (error) {
    console.error('Erro ao buscar funcionário:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const createEmployee = async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      cpf,
      password,
      employeeId,
      department,
      position,
      hireDate,
      salary,
      isRemote = false,
      role = 'EMPLOYEE'
    } = req.body;

    // Verificar se email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Verificar se CPF já existe
    const existingCpf = await prisma.user.findUnique({
      where: { cpf }
    });

    if (existingCpf) {
      return res.status(400).json({ error: 'CPF já cadastrado' });
    }

    // Verificar se matrícula já existe
    const existingEmployeeId = await prisma.employee.findUnique({
      where: { employeeId }
    });

    if (existingEmployeeId) {
      return res.status(400).json({ error: 'Matrícula já cadastrada' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Criar usuário e funcionário em uma transação
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          cpf,
          password: hashedPassword,
          role
        }
      });

      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          employeeId,
          department,
          position,
          hireDate: new Date(hireDate + 'T00:00:00'),
          salary: parseFloat(salary),
          isRemote
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              cpf: true,
              role: true,
              isActive: true
            }
          }
        }
      });

      return employee;
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('Erro ao criar funcionário:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const updateEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      cpf,
      employeeId,
      department,
      position,
      hireDate,
      salary,
      isRemote,
      role,
      isActive
    } = req.body;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Verificar se email já existe (exceto para o próprio usuário)
    if (email && email !== employee.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Email já cadastrado' });
      }
    }

    // Verificar se CPF já existe (exceto para o próprio usuário)
    if (cpf && cpf !== employee.user.cpf) {
      const existingCpf = await prisma.user.findUnique({
        where: { cpf }
      });

      if (existingCpf) {
        return res.status(400).json({ error: 'CPF já cadastrado' });
      }
    }

    // Verificar se matrícula já existe (exceto para o próprio funcionário)
    if (employeeId && employeeId !== employee.employeeId) {
      const existingEmployeeId = await prisma.employee.findUnique({
        where: { employeeId }
      });

      if (existingEmployeeId) {
        return res.status(400).json({ error: 'Matrícula já cadastrada' });
      }
    }

    // Atualizar em uma transação
    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: employee.userId },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          ...(cpf && { cpf }),
          ...(role && { role }),
          ...(isActive !== undefined && { isActive })
        }
      });

      const updatedEmployee = await tx.employee.update({
        where: { id },
        data: {
          ...(employeeId && { employeeId }),
          ...(department && { department }),
          ...(position && { position }),
          ...(hireDate && { hireDate: new Date(hireDate + 'T00:00:00') }),
          ...(salary && { salary: parseFloat(salary) }),
          ...(isRemote !== undefined && { isRemote })
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              cpf: true,
              role: true,
              isActive: true
            }
          }
        }
      });

      return updatedEmployee;
    });

    return res.json(result);
  } catch (error) {
    console.error('Erro ao atualizar funcionário:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const deleteEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Deletar em uma transação (cascade delete)
    await prisma.$transaction(async (tx) => {
      await tx.employee.delete({
        where: { id }
      });

      await tx.user.delete({
        where: { id: employee.userId }
      });
    });

    return res.status(204).send();
  } catch (error) {
    console.error('Erro ao deletar funcionário:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
