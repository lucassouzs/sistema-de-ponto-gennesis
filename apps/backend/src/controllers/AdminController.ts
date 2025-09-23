import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import moment from 'moment';

const prisma = new PrismaClient();

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const today = moment().startOf('day');
    const tomorrow = moment().add(1, 'day').startOf('day');

    // Total de funcionários
    const totalEmployees = await prisma.employee.count({
      where: {
        user: {
          isActive: true
        }
      }
    });

    // Funcionários presentes hoje (que bateram ponto de entrada)
    const presentToday = await prisma.timeRecord.count({
      where: {
        type: 'ENTRY',
        timestamp: {
          gte: today.toDate(),
          lt: tomorrow.toDate()
        }
      }
    });

    // Funcionários ausentes hoje
    const absentToday = totalEmployees - presentToday;

    // Funcionários atrasados hoje (entrada após 7:15)
    const lateToday = await prisma.timeRecord.count({
      where: {
        type: 'ENTRY',
        timestamp: {
          gte: moment().set({ hour: 7, minute: 15, second: 0 }).toDate(),
          lt: tomorrow.toDate()
        }
      }
    });

    // Taxa de frequência (presentes / total)
    const attendanceRate = totalEmployees > 0 ? (presentToday / totalEmployees) * 100 : 0;

    return res.json({
      totalEmployees,
      presentToday,
      absentToday,
      lateToday,
      attendanceRate: Math.round(attendanceRate * 100) / 100
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas do dashboard:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const getAttendanceReport = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const targetDate = date ? moment(date as string).startOf('day') : moment().startOf('day');
    const nextDay = moment(targetDate).add(1, 'day').startOf('day');

    // Buscar todos os funcionários
    const employees = await prisma.employee.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            cpf: true,
            isActive: true
          }
        }
      },
      where: {
        user: {
          isActive: true
        }
      }
    });

    // Buscar registros de ponto do dia
    const timeRecords = await prisma.timeRecord.findMany({
      where: {
        timestamp: {
          gte: targetDate.toDate(),
          lt: nextDay.toDate()
        }
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            cpf: true
          }
        }
      }
    });

    // Processar dados
    const report = employees.map(employee => {
      const employeeRecords = timeRecords.filter(record => record.userId === employee.userId);
      
      const entryRecord = employeeRecords.find(record => record.type === 'ENTRY');
      const lunchStartRecord = employeeRecords.find(record => record.type === 'LUNCH_START');
      const lunchEndRecord = employeeRecords.find(record => record.type === 'LUNCH_END');
      const exitRecord = employeeRecords.find(record => record.type === 'EXIT');

      const isPresent = !!entryRecord;
      const isLate = entryRecord ? moment(entryRecord.timestamp).isAfter(moment().set({ hour: 7, minute: 15, second: 0 })) : false;

      return {
        employeeId: employee.employeeId,
        name: employee.user.name,
        email: employee.user.email,
        cpf: employee.user.cpf,
        department: employee.department,
        position: employee.position,
        isPresent,
        isLate,
        entryTime: entryRecord ? moment(entryRecord.timestamp).format('HH:mm') : null,
        lunchStartTime: lunchStartRecord ? moment(lunchStartRecord.timestamp).format('HH:mm') : null,
        lunchEndTime: lunchEndRecord ? moment(lunchEndRecord.timestamp).format('HH:mm') : null,
        exitTime: exitRecord ? moment(exitRecord.timestamp).format('HH:mm') : null,
        records: employeeRecords.map(record => ({
          type: record.type,
          timestamp: moment(record.timestamp).format('HH:mm:ss'),
          latitude: record.latitude,
          longitude: record.longitude
        }))
      };
    });

    return res.json({
      date: targetDate.format('YYYY-MM-DD'),
      totalEmployees: employees.length,
      presentCount: report.filter(emp => emp.isPresent).length,
      absentCount: report.filter(emp => !emp.isPresent).length,
      lateCount: report.filter(emp => emp.isLate).length,
      employees: report
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de frequência:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
