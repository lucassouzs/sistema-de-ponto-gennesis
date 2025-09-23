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
      role = 'EMPLOYEE',
      // Novos campos
      company,
      currentContract,
      bank,
      accountType,
      agency,
      operation,
      account,
      digit,
      pixKeyType,
      pixKey
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
          hireDate: hireDate.includes('T') ? new Date(hireDate) : new Date(hireDate + 'T04:00:00'),
          salary: parseFloat(salary),
          workSchedule: {
            startTime: "08:00",
            endTime: "17:00",
            lunchStartTime: "12:00",
            lunchEndTime: "13:00",
            workDays: [1, 2, 3, 4, 5] // Segunda a sexta
          },
          isRemote,
          // Novos campos
          company,
          currentContract,
          bank,
          accountType,
          agency,
          operation,
          account,
          digit,
          pixKeyType,
          pixKey
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
      isActive,
      // Novos campos
      company,
      currentContract,
      bank,
      accountType,
      agency,
      operation,
      account,
      digit,
      pixKeyType,
      pixKey
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
          ...(hireDate && { hireDate: hireDate.includes('T') ? new Date(hireDate) : new Date(hireDate + 'T04:00:00') }),
          ...(salary && { salary: parseFloat(salary) }),
          ...(isRemote !== undefined && { isRemote }),
          // Novos campos
          ...(company !== undefined && { company }),
          ...(currentContract !== undefined && { currentContract }),
          ...(bank !== undefined && { bank }),
          ...(accountType !== undefined && { accountType }),
          ...(agency !== undefined && { agency }),
          ...(operation !== undefined && { operation }),
          ...(account !== undefined && { account }),
          ...(digit !== undefined && { digit }),
          ...(pixKeyType !== undefined && { pixKeyType }),
          ...(pixKey !== undefined && { pixKey })
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

// Buscar aniversariantes do mês
export const getBirthdayEmployees = async (req: Request, res: Response) => {
  try {
    const { month, year, department, search, showAll } = req.query;
    
    // Usar mês e ano atual se não fornecidos
    const currentDate = new Date();
    const targetMonth = month ? parseInt(month as string) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year as string) : currentDate.getFullYear();
    
    // Construir filtros
    const whereClause: any = {
      birthDate: {
        not: null // Apenas funcionários com data de nascimento
      },
      user: {
        isActive: true // Apenas usuários ativos
      }
    };
    
    // Filtro por departamento
    if (department && department !== '') {
      whereClause.department = department as string;
    }
    
    // Filtro por nome (busca)
    if (search && search !== '') {
      whereClause.user = {
        ...whereClause.user,
        name: {
          contains: search as string,
          mode: 'insensitive'
        }
      };
    }
    
    // Buscar funcionários com aniversário no mês especificado
    const employees = await prisma.employee.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        birthDate: 'asc'
      }
    });
    
    // Filtrar apenas os que fazem aniversário no mês/ano especificado
    const birthdayEmployees = employees.filter(employee => {
      if (!employee.birthDate) return false;
      
      const birthDate = new Date(employee.birthDate);
      const birthMonth = birthDate.getMonth() + 1; // getMonth() retorna 0-11
      const birthDay = birthDate.getDate();
      
      // Verificar se é do mês correto
      if (birthMonth !== targetMonth) return false;
      
      // Se o usuário não solicitou mostrar todos os aniversários
      if (showAll !== 'true') {
        // Se estivermos vendo o mês atual, filtrar apenas aniversários que ainda não passaram
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        
        if (targetMonth === currentMonth && targetYear === currentYear) {
          const today = currentDate.getDate();
          return birthDay >= today; // Só mostrar aniversários de hoje em diante
        }
      }
      
      // Para meses futuros, passados ou quando showAll=true, mostrar todos os aniversários do mês
      return true;
    }).map(employee => {
      const birthDate = new Date(employee.birthDate!);
      const birthDay = birthDate.getDate();
      
      // Calcular idade que fará
      const currentYear = targetYear;
      const age = currentYear - birthDate.getFullYear();
      
      // Calcular dias restantes até o aniversário
      const today = new Date();
      const thisYearBirthday = new Date(currentYear, targetMonth - 1, birthDay);
      
      // Se o aniversário já passou este ano, usar próximo ano
      if (thisYearBirthday < today) {
        thisYearBirthday.setFullYear(currentYear + 1);
      }
      
      const timeDiff = thisYearBirthday.getTime() - today.getTime();
      const daysUntilBirthday = Math.ceil(timeDiff / (1000 * 3600 * 24));
      
      return {
        id: employee.id,
        userId: employee.userId,
        employeeId: employee.employeeId,
        name: employee.user.name,
        email: employee.user.email,
        department: employee.department,
        position: employee.position,
        birthDate: employee.birthDate,
        birthDay,
        age,
        daysUntilBirthday,
        isTodayBirthday: daysUntilBirthday === 0
      };
    }).sort((a, b) => a.birthDay - b.birthDay); // Ordenar por dia do mês
    
    // Estatísticas
    const stats = {
      total: birthdayEmployees.length,
      todayBirthdays: birthdayEmployees.filter(emp => emp.isTodayBirthday).length,
      byDepartment: {} as Record<string, number>
    };
    
    // Contar por departamento
    birthdayEmployees.forEach(employee => {
      stats.byDepartment[employee.department] = (stats.byDepartment[employee.department] || 0) + 1;
    });
    
    res.json({
      success: true,
      data: {
        employees: birthdayEmployees,
        stats,
        month: targetMonth,
        year: targetYear
      }
    });
    
  } catch (error) {
    console.error('Erro ao buscar aniversariantes:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
};
