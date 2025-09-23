import express from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// Endpoint para métricas administrativas - apenas RH e Admin
router.get('/admin', authorize('HR', 'ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { department, position, costCenter, client } = req.query;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Construir filtros para funcionários
    const employeeWhere: any = {
      isNot: null
    };

    if (department && department !== 'all') {
      employeeWhere.department = { contains: department as string, mode: 'insensitive' };
    }
    if (position && position !== 'all') {
      employeeWhere.position = { contains: position as string, mode: 'insensitive' };
    }
    if (costCenter && costCenter !== 'all') {
      employeeWhere.costCenter = { contains: costCenter as string, mode: 'insensitive' };
    }
    if (client && client !== 'all') {
      employeeWhere.client = { contains: client as string, mode: 'insensitive' };
    }

    // Buscar IDs dos usuários que atendem aos filtros
    let userIds: string[] = [];
    if (department !== 'all' || position !== 'all' || costCenter !== 'all' || client !== 'all') {
      const usersInFilter = await prisma.user.findMany({
        where: {
          role: 'EMPLOYEE',
          isActive: true,
          employee: employeeWhere
        },
        select: { id: true }
      });
      userIds = usersInFilter.map(u => u.id);
    }

    const [totalEmployees, presentUsers, allTodayRecords] = await Promise.all([
      prisma.user.count({ 
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE', 
          isActive: true,
          id: { in: userIds }
        } : {
          role: 'EMPLOYEE', 
          isActive: true,
          employee: {
            isNot: null
          }
        }
      }),
      prisma.timeRecord.findMany({
        where: {
          timestamp: { gte: dayStart, lt: dayEnd },
          type: { in: ['ENTRY', 'LUNCH_END'] },
          isValid: true,
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            employee: { isNot: null }
          }
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.timeRecord.findMany({
        where: {
          timestamp: { gte: dayStart, lt: dayEnd },
          isValid: true,
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            employee: { isNot: null }
          }
        },
        select: { userId: true, type: true },
      }),
    ]);

    const presentToday = presentUsers.length;
    const absentToday = Math.max(totalEmployees - presentToday, 0);
    const attendanceRate = totalEmployees > 0 ? Math.min(100, Math.max(0, Math.round((presentToday / totalEmployees) * 100))) : 0;

    // Calcular funcionários pendentes (que não bateram os 4 pontos)
    const recordsByUser = new Map<string, Set<string>>();
    allTodayRecords.forEach(record => {
      if (!recordsByUser.has(record.userId)) {
        recordsByUser.set(record.userId, new Set());
      }
      recordsByUser.get(record.userId)!.add(record.type);
    });

    let pendingToday = 0;
    recordsByUser.forEach((userRecords) => {
      const hasEntry = userRecords.has('ENTRY');
      const hasLunchStart = userRecords.has('LUNCH_START');
      const hasLunchEnd = userRecords.has('LUNCH_END');
      const hasExit = userRecords.has('EXIT');
      
      // Se não tem todos os 4 pontos, está pendente
      if (!(hasEntry && hasLunchStart && hasLunchEnd && hasExit)) {
        pendingToday++;
      }
    });

    res.json({
      success: true,
      data: {
        totalEmployees,
        presentToday,
        absentToday,
        pendingToday,
        pendingVacations: 0,
        pendingOvertime: 0,
        averageAttendance: attendanceRate,
        attendanceRate,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Endpoint geral - retorna dados básicos para todos os usuários
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    // Para funcionários, retorna dados básicos
    // Para RH/Admin, retorna dados administrativos
    const userRole = req.user?.role;
    
    if (userRole === 'EMPLOYEE') {
      // Funcionários não veem métricas administrativas
      res.json({
        success: true,
        data: {
          totalEmployees: 0,
          presentToday: 0,
          absentToday: 0,
          lateToday: 0,
          pendingVacations: 0,
          pendingOvertime: 0,
          attendanceRate: 0,
        },
      });
    } else {
      // RH e Admin veem métricas administrativas
      const { department, position, costCenter, client } = req.query;
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      // Construir filtros para funcionários
      const employeeWhere: any = {
        isNot: null
      };

      if (department && department !== 'all') {
        employeeWhere.department = { contains: department as string, mode: 'insensitive' };
      }
      if (position && position !== 'all') {
        employeeWhere.position = { contains: position as string, mode: 'insensitive' };
      }
      if (costCenter && costCenter !== 'all') {
        employeeWhere.costCenter = { contains: costCenter as string, mode: 'insensitive' };
      }
      if (client && client !== 'all') {
        employeeWhere.client = { contains: client as string, mode: 'insensitive' };
      }

      // Buscar IDs dos usuários que atendem aos filtros
      let userIds: string[] = [];
      if (department !== 'all' || position !== 'all' || costCenter !== 'all' || client !== 'all') {
        const usersInFilter = await prisma.user.findMany({
          where: {
            role: 'EMPLOYEE',
            isActive: true,
            employee: employeeWhere
          },
          select: { id: true }
        });
        userIds = usersInFilter.map(u => u.id);
      }

      const [totalEmployees, presentUsers, allTodayRecords] = await Promise.all([
        prisma.user.count({ 
          where: userIds.length > 0 ? {
            role: 'EMPLOYEE', 
            isActive: true,
            id: { in: userIds }
          } : {
            role: 'EMPLOYEE', 
            isActive: true,
            employee: {
              isNot: null
            }
          }
        }),
        prisma.timeRecord.findMany({
          where: {
            timestamp: { gte: dayStart, lt: dayEnd },
            type: { in: ['ENTRY', 'LUNCH_END'] },
            isValid: true,
            userId: userIds.length > 0 ? { in: userIds } : undefined,
            user: userIds.length > 0 ? undefined : {
              role: 'EMPLOYEE',
              isActive: true,
              employee: { isNot: null }
            }
          },
          select: { userId: true },
          distinct: ['userId'],
        }),
        prisma.timeRecord.findMany({
          where: {
            timestamp: { gte: dayStart, lt: dayEnd },
            isValid: true,
            userId: userIds.length > 0 ? { in: userIds } : undefined,
            user: userIds.length > 0 ? undefined : {
              role: 'EMPLOYEE',
              isActive: true,
              employee: { isNot: null }
            }
          },
          select: { userId: true, type: true },
        }),
      ]);

      const presentToday = presentUsers.length;
      const absentToday = Math.max(totalEmployees - presentToday, 0);
      const attendanceRate = totalEmployees > 0 ? Math.min(100, Math.max(0, Math.round((presentToday / totalEmployees) * 100))) : 0;

      // Calcular funcionários pendentes (que não bateram os 4 pontos)
      const recordsByUser = new Map<string, Set<string>>();
      allTodayRecords.forEach(record => {
        if (!recordsByUser.has(record.userId)) {
          recordsByUser.set(record.userId, new Set());
        }
        recordsByUser.get(record.userId)!.add(record.type);
      });

      let pendingToday = 0;
      recordsByUser.forEach((userRecords) => {
        const hasEntry = userRecords.has('ENTRY');
        const hasLunchStart = userRecords.has('LUNCH_START');
        const hasLunchEnd = userRecords.has('LUNCH_END');
        const hasExit = userRecords.has('EXIT');
        
        // Se não tem todos os 4 pontos, está pendente
        if (!(hasEntry && hasLunchStart && hasLunchEnd && hasExit)) {
          pendingToday++;
        }
      });

      res.json({
        success: true,
        data: {
          totalEmployees,
          presentToday,
          absentToday,
          pendingToday,
          pendingVacations: 0,
          pendingOvertime: 0,
          averageAttendance: attendanceRate,
          attendanceRate,
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
