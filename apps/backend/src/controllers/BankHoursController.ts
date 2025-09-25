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
        endDateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0, 0);
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


          // Função para calcular multiplicador de horas extras
          const calculateOvertimeMultiplier = (timestamp: Date, dayOfWeek: number) => {
            const hour = timestamp.getHours();
            const isSunday = dayOfWeek === 0;
            const isSaturday = dayOfWeek === 6;
            const isAfter22h = hour >= 22;
            
            if (isSunday) {
              // Domingo: 100% adicional (1h extra = 2h)
              return 2.0;
            } else if (isSaturday) {
              // Sábado: 50% adicional (1h extra = 1h30)
              return 1.5;
            } else if (isAfter22h) {
              // Depois das 22h: 100% adicional (1h extra = 2h)
              return 2.0;
            } else {
              // Segunda a sexta, após jornada normal: 50% adicional (1h extra = 1h30)
              return 1.5;
            }
          };

          // Calcular horas trabalhadas agrupando por dia
          let totalWorkedHours = 0;
          let totalOvertimeHours = 0;
          
          // Agrupar registros por dia
          const recordsByDay = new Map();
          
          for (const record of timeRecords) {
            const recordDate = record.timestamp.toISOString().split('T')[0];
            
            if (!recordsByDay.has(recordDate)) {
              recordsByDay.set(recordDate, []);
            }
            recordsByDay.get(recordDate).push(record);
          }

          // Processar cada dia
          for (const [date, dayRecords] of recordsByDay) {
            const dayOfWeek = new Date(date).getDay();
            
            // Verificar se há ausência justificada para este dia
            const hasAbsenceJustified = dayRecords.some((r: any) => r.type === 'ABSENCE_JUSTIFIED');
            
            // Encontrar registros específicos do dia
            const entryRecord = dayRecords.find((r: any) => r.type === 'ENTRY');
            const exitRecord = dayRecords.find((r: any) => r.type === 'EXIT');
            const lunchStartRecord = dayRecords.find((r: any) => r.type === 'LUNCH_START');
            const lunchEndRecord = dayRecords.find((r: any) => r.type === 'LUNCH_END');
            
            if (hasAbsenceJustified) {
              // Ausência justificada - não trabalhou, não conta horas
              // Não adicionar horas trabalhadas nem horas extras
            } else if (entryRecord && exitRecord) {
              // Só calcular se tiver pelo menos entrada e saída
              let dayHours = 0;
              let overtimeHours = 0;
              let regularHours = 0;
              
              // Usar a mesma lógica do TimeRecordService
              const entryTime = new Date(entryRecord.timestamp);
              const exitTime = new Date(exitRecord.timestamp);
              
              // Usar moment.js para cálculos precisos (igual ao TimeRecordService)
              const moment = require('moment');
              
              // Calcular horas totais (entrada até saída)
              const totalHours = moment(exitTime).diff(moment(entryTime), 'hours', true);
              
              // Calcular horas de almoço
              let lunchHours = 0;
              if (lunchStartRecord && lunchEndRecord) {
                const lunchStart = moment(lunchStartRecord.timestamp);
                const lunchEnd = moment(lunchEndRecord.timestamp);
                lunchHours = lunchEnd.diff(lunchStart, 'hours', true);
              } else {
                // Assumir 1 hora de almoço se não registrado
                lunchHours = 1;
              }
              
              // Calcular horas efetivas de trabalho
              dayHours = Math.max(0, totalHours - lunchHours);
              
              // Determinar jornada esperada para o dia
              let expectedHours = 0;
              if (dayOfWeek >= 1 && dayOfWeek <= 4) {
                expectedHours = 9; // Segunda a quinta: 9h
              } else if (dayOfWeek === 5) {
                expectedHours = 8; // Sexta: 8h
              }
              // Sábado e domingo: 0h esperadas (toda hora trabalhada é extra)
              
              // Calcular horas extras
              if (dayOfWeek === 0 || dayOfWeek === 6) {
                // Fim de semana: todas as horas são extras
                regularHours = 0;
                overtimeHours = dayHours;
              } else {
                // Dia útil: separar horas normais das extras
                if (dayHours > expectedHours) {
                  regularHours = expectedHours;
                  overtimeHours = dayHours - expectedHours;
                } else {
                  regularHours = dayHours;
                  overtimeHours = 0;
                }
              }
              
              // Aplicar multiplicador apenas sobre as horas extras
              if (overtimeHours > 0) {
                const multiplier = calculateOvertimeMultiplier(entryTime, dayOfWeek);
                const multipliedOvertimeHours = overtimeHours * multiplier;
                totalOvertimeHours += multipliedOvertimeHours;
              }
              
              totalWorkedHours += dayHours;
            }
          }

          // Calcular horas esperadas usando a mesma lógica do TimeRecordService
          let totalExpectedHours = 0;
          const currentDate = new Date(actualStartDate);
          
          while (currentDate <= endDateFilter) {
            const dayOfWeek = currentDate.getDay();
            const dateStr = currentDate.toISOString().split('T')[0];
            
            // Verificar se há ausência justificada para este dia
            const dayRecords = recordsByDay.get(dateStr) || [];
            const hasAbsenceJustified = dayRecords.some((r: any) => r.type === 'ABSENCE_JUSTIFIED');
            
            // Se não tem ausência justificada, contar as horas esperadas
            if (!hasAbsenceJustified) {
              // Usar a mesma lógica do TimeRecordService.getExpectedWorkHoursByRule
              if (dayOfWeek >= 1 && dayOfWeek <= 4) {
                totalExpectedHours += 9; // Segunda a quinta: 9h
              } else if (dayOfWeek === 5) {
                totalExpectedHours += 8; // Sexta: 8h
              }
              // Sábado (6) e domingo (0): 0 horas esperadas
            }
            
            currentDate.setDate(currentDate.getDate() + 1);
          }
          const bankHours = totalWorkedHours - totalExpectedHours;
          const regularOvertimeHours = Math.max(0, bankHours);
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
            totalWorkedHours: Math.round(totalWorkedHours * 100) / 100,
            totalExpectedHours: Math.round(totalExpectedHours * 100) / 100,
            bankHours: Math.round(bankHours * 100) / 100,
            overtimeHours: Math.round(regularOvertimeHours * 100) / 100,
            overtimeMultipliedHours: Math.round(totalOvertimeHours * 100) / 100,
            pendingHours: Math.round(pendingHours * 100) / 100,
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
