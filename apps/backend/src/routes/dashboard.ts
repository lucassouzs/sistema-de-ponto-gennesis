import express from 'express';
import { authenticate } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [totalEmployees, presentUsers, lateToday] = await Promise.all([
      prisma.user.count({ where: { role: { in: ['EMPLOYEE'] }, isActive: true } }),
      prisma.timeRecord.findMany({
        where: {
          timestamp: { gte: dayStart, lt: dayEnd },
          type: { in: ['ENTRY', 'LUNCH_END'] },
          isValid: true,
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.timeRecord.count({
        where: {
          type: 'ENTRY',
          timestamp: { gte: dayStart, lt: dayEnd },
          reason: { contains: 'atraso', mode: 'insensitive' },
        },
      }),
    ]);

    const presentToday = presentUsers.length;
    const absentToday = Math.max(totalEmployees - presentToday, 0);
    const attendanceRate = totalEmployees > 0 ? Math.min(100, Math.max(0, Math.round((presentToday / totalEmployees) * 100))) : 0;

    res.json({
      success: true,
      data: {
        totalEmployees,
        presentToday,
        absentToday,
        lateToday,
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

export default router;
