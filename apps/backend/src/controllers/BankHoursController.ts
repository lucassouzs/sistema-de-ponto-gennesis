import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class BankHoursController {
  async getBankHoursByEmployee(req: Request, res: Response) {
    try {
      const { startDate, endDate, department, status, costCenter, client } = req.query;
      
      // Usar as datas fornecidas ou calcular período padrão (mês atual)
      let startDateFilter: Date;
      let endDateFilter: Date;
      
      if (startDate && endDate) {
        // Criar datas no horário de Brasília
        const startDateStr = startDate as string;
        const endDateStr = endDate as string;
        
        // Parsear a data e criar no horário local
        const [startYear, startMonth, startDay] = startDateStr.split('T')[0].split('-').map(Number);
        const [endYear, endMonth, endDay] = endDateStr.split('T')[0].split('-').map(Number);
        
        startDateFilter = new Date(startYear, startMonth - 1, startDay, 1, 0, 0);
        endDateFilter = new Date(endYear, endMonth - 1, endDay, 23, 0, 0);
      } else {
        // Fallback para mês atual se não fornecido
        const now = new Date();
        startDateFilter = new Date(now.getFullYear(), now.getMonth(), 1, 1, 0, 0);
        endDateFilter = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 0, 0);
      }

      // Buscar funcionários com filtros
      const whereClause: any = {
        user: {
          isActive: true,
          role: 'EMPLOYEE'
        }
      };

      if (department && department !== 'all') {
        whereClause.department = {
          contains: department as string,
          mode: 'insensitive'
        };
      }

      if (costCenter && costCenter !== 'all') {
        whereClause.costCenter = {
          contains: costCenter as string,
          mode: 'insensitive'
        };
      }

      if (client && client !== 'all') {
        whereClause.client = {
          contains: client as string,
          mode: 'insensitive'
        };
      }

      const employees = await prisma.employee.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              cpf: true
            }
          }
        },
        orderBy: {
          user: {
            name: 'asc'
          }
        }
      });

      // Calcular banco de horas para cada funcionário
      const bankHoursData = await Promise.all(
        employees.map(async (employee) => {
          // Determinar data de início: data de admissão ou data inicial do filtro (o que for maior)
          const hireDate = new Date(employee.hireDate);
          let actualStartDate = hireDate > startDateFilter ? hireDate : startDateFilter;
          
          // Não ajustar datas de admissão - processar o período como está
          // A lógica correta de dias úteis será aplicada no cálculo
          
          // Buscar registros de ponto desde a data de admissão até a data final do filtro
          const timeRecords = await prisma.timeRecord.findMany({
            where: {
              userId: employee.userId,
              timestamp: {
                gte: actualStartDate,
                lte: endDateFilter
              }
            },
            orderBy: {
              timestamp: 'asc'
            }
          });

          // Calcular horas trabalhadas
          let totalWorkedHours = 0;
          let currentDay = '';
          let dayStart = null;
          let dayEnd = null;
          let lunchStart = null;
          let lunchEnd = null;

          for (const record of timeRecords) {
            const recordDate = record.timestamp.toISOString().split('T')[0];
            
            if (recordDate !== currentDay) {
              // Processar dia anterior se existir
              if (currentDay && dayStart && dayEnd) {
                let dayHours = 0;
                if (lunchStart && lunchEnd) {
                  const morningHours = (lunchStart.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
                  const afternoonHours = (dayEnd.getTime() - lunchEnd.getTime()) / (1000 * 60 * 60);
                  dayHours = morningHours + afternoonHours;
                } else {
                  dayHours = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
                }
                totalWorkedHours += dayHours;
              }
              
              // Iniciar novo dia
              currentDay = recordDate;
              dayStart = null;
              dayEnd = null;
              lunchStart = null;
              lunchEnd = null;
            }

            // Processar registro atual
            if (record.type === 'ENTRY') {
              dayStart = record.timestamp;
            } else if (record.type === 'EXIT') {
              dayEnd = record.timestamp;
            } else if (record.type === 'LUNCH_START') {
              lunchStart = record.timestamp;
            } else if (record.type === 'LUNCH_END') {
              lunchEnd = record.timestamp;
            }
          }

          // Processar último dia
          if (currentDay && dayStart && dayEnd) {
            let dayHours = 0;
            if (lunchStart && lunchEnd) {
              const morningHours = (lunchStart.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
              const afternoonHours = (dayEnd.getTime() - lunchEnd.getTime()) / (1000 * 60 * 60);
              dayHours = morningHours + afternoonHours;
            } else {
              dayHours = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
            }
            totalWorkedHours += dayHours;
          }

          // Calcular horas esperadas usando a mesma lógica do TimeRecordService
          let totalExpectedHours = 0;
          const currentDate = new Date(actualStartDate);
          
          while (currentDate <= endDateFilter) {
            const dayOfWeek = currentDate.getDay();
            
            // Usar a mesma lógica do TimeRecordService.getExpectedWorkHoursByRule
            if (dayOfWeek >= 1 && dayOfWeek <= 4) {
              totalExpectedHours += 9; // Segunda a quinta: 9h
            } else if (dayOfWeek === 5) {
              totalExpectedHours += 8; // Sexta: 8h
            }
            // Sábado (6) e domingo (0): 0 horas esperadas
            
            currentDate.setDate(currentDate.getDate() + 1);
          }
          const bankHours = totalWorkedHours - totalExpectedHours;
          const overtimeHours = Math.max(0, bankHours);
          const pendingHours = Math.max(0, -bankHours);

          return {
            employeeId: employee.employeeId,
            employeeName: employee.user.name,
            employeeCpf: employee.user.cpf,
            department: employee.department,
            position: employee.position,
            costCenter: employee.costCenter || null,
            client: employee.client || null,
            hireDate: employee.hireDate.toISOString().split('T')[0],
            actualStartDate: actualStartDate.toISOString().split('T')[0],
            totalWorkedHours: Math.round(totalWorkedHours * 10) / 10,
            totalExpectedHours: Math.round(totalExpectedHours * 10) / 10,
            bankHours: Math.round(bankHours * 10) / 10,
            overtimeHours: Math.round(overtimeHours * 10) / 10,
            pendingHours: Math.round(pendingHours * 10) / 10,
            lastUpdate: new Date().toISOString().split('T')[0]
          };
        })
      );

      // Aplicar filtro de status se especificado
      let filteredData = bankHoursData;
      if (status && status !== 'all') {
        if (status === 'positive') {
          filteredData = bankHoursData.filter(emp => emp.bankHours > 0);
        } else if (status === 'negative') {
          filteredData = bankHoursData.filter(emp => emp.bankHours < 0);
        } else if (status === 'neutral') {
          filteredData = bankHoursData.filter(emp => emp.bankHours === 0);
        }
      }

      return res.json({
        success: true,
        data: filteredData
      });
    } catch (error) {
      console.error('Erro ao buscar banco de horas:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Erro interno do servidor' 
      });
    }
  }
}
