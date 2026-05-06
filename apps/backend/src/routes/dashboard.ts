import express from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = express.Router();

router.use(authenticate);

// Endpoint para métricas administrativas - agora disponível para todos os funcionários
router.get('/admin', authorize('EMPLOYEE'), async (req: AuthRequest, res, next) => {
  try {
    const { department, position, costCenter, client } = req.query;
    const today = new Date();
    // Usar UTC para comparar com timestamps salvos em UTC
    const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0));
    const dayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59));

    // Construir filtros para funcionários (excluindo administradores)
    const employeeWhere: any = {};

    if (department && department !== 'all') {
      employeeWhere.department = { contains: department as string, mode: 'insensitive' };
    }
    if (position && position !== 'all') {
      // Se há filtro de position, combinar com exclusão de administrador
      employeeWhere.position = { 
        AND: [
          { contains: position as string, mode: 'insensitive' },
          { not: 'Administrador' }
        ]
      };
    } else {
      // Se não há filtro de position, apenas excluir administrador
      employeeWhere.position = { not: 'Administrador' };
    }
    if (costCenter && costCenter !== 'all') {
      employeeWhere.costCenter = { contains: costCenter as string, mode: 'insensitive' };
    }
    if (client && client !== 'all') {
      employeeWhere.client = { contains: client as string, mode: 'insensitive' };
    }

    // Buscar IDs dos usuários que atendem aos filtros (excluindo administradores)
    let userIds: string[] = [];
    if (department !== 'all' || position !== 'all' || costCenter !== 'all' || client !== 'all') {
      const usersInFilter = await prisma.user.findMany({
        where: {
          role: 'EMPLOYEE',
          isActive: true,
          employee: {
            is: employeeWhere
          }
        },
        select: { id: true }
      });
      userIds = usersInFilter.map((u: any) => u.id);
    }

    const [totalEmployees, presentUsers, allTodayRecords, employeesWithoutTimeClock, absentUsers] = await Promise.all([
      prisma.user.count({ 
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE', 
          isActive: true,
          id: { in: userIds },
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } }
          ]
        } : {
          role: 'EMPLOYEE', 
          isActive: true,
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } }
          ]
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
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
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
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
          }
        },
        select: { userId: true, type: true },
      }),
      // Buscar funcionários que não precisam bater ponto (excluindo administradores)
      prisma.user.findMany({
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE',
          isActive: true,
          id: { in: userIds },
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } },
            { employee: { requiresTimeClock: false } }
          ]
        } : {
          role: 'EMPLOYEE',
          isActive: true,
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } },
            { employee: { requiresTimeClock: false } }
          ]
        },
        select: { id: true }
      }),
      // Buscar funcionários com faltas registradas hoje
      // Buscar TODAS as faltas ABSENCE_JUSTIFIED com approvedBy (registradas manualmente)
      // Depois vamos filtrar para excluir as que são de atestados médicos
      prisma.timeRecord.findMany({
        where: {
          timestamp: { 
            gte: dayStart, 
            lt: new Date(dayEnd.getTime() + 1) // Adicionar 1ms para incluir até o final do dia
          },
          type: 'ABSENCE_JUSTIFIED',
          approvedBy: { not: null },
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
          }
        },
        select: { 
          userId: true,
          timestamp: true,
          reason: true
        }
      })
    ]);

    // Filtrar faltas: excluir as que são de atestados médicos
    // Atestados médicos criam registros ABSENCE_JUSTIFIED quando aprovados
    // Faltas registradas manualmente têm approvedBy mas não têm atestado médico no mesmo dia
    const absentUserIdsSet = new Set<string>();
    
    if (absentUsers && Array.isArray(absentUsers)) {
      // Agrupar por userId para evitar queries duplicadas
      const userIdsToCheck = new Set(absentUsers.map((r: any) => r.userId));
      
      // Buscar todos os atestados médicos aprovados hoje de uma vez
      const medicalCerts = await prisma.medicalCertificate.findMany({
        where: {
          userId: { in: Array.from(userIdsToCheck) },
          status: 'APPROVED',
          startDate: { lte: dayEnd },
          endDate: { gte: dayStart }
        },
        select: {
          userId: true,
          startDate: true,
          endDate: true
        }
      });
      
      // Criar um Set de userIds que têm atestado médico hoje
      const usersWithMedicalCert = new Set<string>();
      for (const cert of medicalCerts) {
        const certStart = new Date(cert.startDate);
        const certEnd = new Date(cert.endDate);
        // Verificar se o atestado cobre o dia de hoje
        if (certStart <= dayEnd && certEnd >= dayStart) {
          usersWithMedicalCert.add(cert.userId);
        }
      }
      
      // Adicionar apenas faltas que NÃO são de atestados médicos
      for (const absence of absentUsers) {
        // Se não tem atestado médico, é uma falta registrada manualmente
        if (!usersWithMedicalCert.has(absence.userId)) {
          absentUserIdsSet.add(absence.userId);
        }
        // Se tem atestado médico mas o motivo contém "Falta registrada", também é manual
        else if (absence.reason && (absence.reason.includes('Falta registrada') || absence.reason.includes('registrada manualmente'))) {
          absentUserIdsSet.add(absence.userId);
        }
      }
    }
    
    const absentUserIds = absentUserIdsSet;

    // Funcionários que não precisam bater ponto são automaticamente considerados presentes
    // EXCETO se tiverem falta registrada
    const employeesWithoutTimeClockIds = employeesWithoutTimeClock
      .map((u: any) => u.id)
      .filter((id: string) => !absentUserIds.has(id));
    
    const presentUserIds = new Set([
      ...presentUsers.map((u: any) => u.userId).filter((id: string) => !absentUserIds.has(id)),
      ...employeesWithoutTimeClockIds
    ]);
    const presentToday = presentUserIds.size;
    
    // OTIMIZAÇÃO: Buscar todos os funcionários de uma vez (presentes + todos para ausentes)
    // Incluir também os pendentes para evitar query separada depois
    const allEmployeeIdsForQuery = Array.from(new Set([
      ...Array.from(presentUserIds),
      ...(userIds.length > 0 ? userIds : [])
    ]));

    const allEmployees = await prisma.user.findMany({
      where: allEmployeeIdsForQuery.length > 0 ? {
        id: { in: allEmployeeIdsForQuery },
        role: 'EMPLOYEE',
        isActive: true,
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } }
        ]
      } : {
        role: 'EMPLOYEE',
        isActive: true,
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true,
            requiresTimeClock: true
          }
        }
      }
    });

    // Processar em memória
    const presentEmployeesData = allEmployees.filter(emp => presentUserIds.has(emp.id));
    const absentEmployeesData = allEmployees.filter(emp => !presentUserIds.has(emp.id));

    const absentToday = Math.max(totalEmployees - presentToday, 0);
    const attendanceRate = totalEmployees > 0 ? Math.min(100, Math.max(0, Math.round((presentToday / totalEmployees) * 100))) : 0;

    // Calcular funcionários pendentes (que não bateram os 4 pontos)
    const recordsByUser = new Map<string, Set<string>>();
    allTodayRecords.forEach((record: any) => {
      if (!recordsByUser.has(record.userId)) {
        recordsByUser.set(record.userId, new Set());
      }
      recordsByUser.get(record.userId)!.add(record.type);
    });

    const pendingUserIds: string[] = [];
    recordsByUser.forEach((userRecords, userId) => {
      // Ignorar funcionários que não precisam bater ponto
      if (employeesWithoutTimeClockIds.includes(userId)) {
        return;
      }
      
      const hasEntry = userRecords.has('ENTRY');
      const hasLunchStart = userRecords.has('LUNCH_START');
      const hasLunchEnd = userRecords.has('LUNCH_END');
      const hasExit = userRecords.has('EXIT');
      
      // Se não tem todos os 4 pontos, está pendente
      if (!(hasEntry && hasLunchStart && hasLunchEnd && hasExit)) {
        pendingUserIds.push(userId);
      }
    });

    // OTIMIZAÇÃO: Filtrar pendentes dos dados já buscados em vez de fazer query separada
    const pendingEmployeesData = allEmployees.filter(emp => 
      pendingUserIds.includes(emp.id) && 
      emp.employee?.requiresTimeClock === true
    );

    const pendingToday = pendingUserIds.length;

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
        presentEmployees: presentEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        })),
        absentEmployees: absentEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        })),
        pendingEmployees: pendingEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        }))
      },
    });
  } catch (error) {
    next(error);
  }
});

// Endpoint geral - retorna dados básicos para todos os funcionários
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    // Todos os funcionários veem métricas administrativas agora
    const { department, position, costCenter, client } = req.query;
    const today = new Date();
    // Usar UTC para comparar com timestamps salvos em UTC
    const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0));
    const dayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59));

    // Construir filtros para funcionários (excluindo administradores)
    const employeeWhere: any = {};

    if (department && department !== 'all') {
      employeeWhere.department = { contains: department as string, mode: 'insensitive' };
    }
    if (position && position !== 'all') {
      // Se há filtro de position, combinar com exclusão de administrador
      employeeWhere.position = { 
        AND: [
          { contains: position as string, mode: 'insensitive' },
          { not: 'Administrador' }
        ]
      };
    } else {
      // Se não há filtro de position, apenas excluir administrador
      employeeWhere.position = { not: 'Administrador' };
    }
    if (costCenter && costCenter !== 'all') {
      employeeWhere.costCenter = { contains: costCenter as string, mode: 'insensitive' };
    }
    if (client && client !== 'all') {
      employeeWhere.client = { contains: client as string, mode: 'insensitive' };
    }

    // Buscar IDs dos usuários que atendem aos filtros (excluindo administradores)
    let userIds: string[] = [];
    if (department !== 'all' || position !== 'all' || costCenter !== 'all' || client !== 'all') {
      const usersInFilter = await prisma.user.findMany({
        where: {
          role: 'EMPLOYEE',
          isActive: true,
          employee: {
            is: employeeWhere
          }
        },
        select: { id: true }
      });
      userIds = usersInFilter.map((u: any) => u.id);
    }

    const [totalEmployees, presentUsers, allTodayRecords, employeesWithoutTimeClock, absentUsers] = await Promise.all([
      prisma.user.count({ 
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE', 
          isActive: true,
          id: { in: userIds },
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } }
          ]
        } : {
          role: 'EMPLOYEE', 
          isActive: true,
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } }
          ]
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
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
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
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
          }
        },
        select: { userId: true, type: true },
      }),
      // Buscar funcionários que não precisam bater ponto (excluindo administradores)
      prisma.user.findMany({
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE',
          isActive: true,
          id: { in: userIds },
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } },
            { employee: { requiresTimeClock: false } }
          ]
        } : {
          role: 'EMPLOYEE',
          isActive: true,
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } },
            { employee: { requiresTimeClock: false } }
          ]
        },
        select: { id: true }
      }),
      // Buscar funcionários com faltas registradas hoje
      // Buscar TODAS as faltas ABSENCE_JUSTIFIED com approvedBy (registradas manualmente)
      // Depois vamos filtrar para excluir as que são de atestados médicos
      prisma.timeRecord.findMany({
        where: {
          timestamp: { 
            gte: dayStart, 
            lt: new Date(dayEnd.getTime() + 1) // Adicionar 1ms para incluir até o final do dia
          },
          type: 'ABSENCE_JUSTIFIED',
          approvedBy: { not: null },
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
          }
        },
        select: { 
          userId: true,
          timestamp: true,
          reason: true
        }
      })
    ]);

    // Filtrar faltas: excluir as que são de atestados médicos
    // Atestados médicos criam registros ABSENCE_JUSTIFIED quando aprovados
    // Faltas registradas manualmente têm approvedBy mas não têm atestado médico no mesmo dia
    const absentUserIdsSet = new Set<string>();
    
    if (absentUsers && Array.isArray(absentUsers)) {
      // Agrupar por userId para evitar queries duplicadas
      const userIdsToCheck = new Set(absentUsers.map((r: any) => r.userId));
      
      // Buscar todos os atestados médicos aprovados hoje de uma vez
      const medicalCerts = await prisma.medicalCertificate.findMany({
        where: {
          userId: { in: Array.from(userIdsToCheck) },
          status: 'APPROVED',
          startDate: { lte: dayEnd },
          endDate: { gte: dayStart }
        },
        select: {
          userId: true,
          startDate: true,
          endDate: true
        }
      });
      
      // Criar um Set de userIds que têm atestado médico hoje
      const usersWithMedicalCert = new Set<string>();
      for (const cert of medicalCerts) {
        const certStart = new Date(cert.startDate);
        const certEnd = new Date(cert.endDate);
        // Verificar se o atestado cobre o dia de hoje
        if (certStart <= dayEnd && certEnd >= dayStart) {
          usersWithMedicalCert.add(cert.userId);
        }
      }
      
      // Adicionar apenas faltas que NÃO são de atestados médicos
      for (const absence of absentUsers) {
        // Se não tem atestado médico, é uma falta registrada manualmente
        if (!usersWithMedicalCert.has(absence.userId)) {
          absentUserIdsSet.add(absence.userId);
        }
        // Se tem atestado médico mas o motivo contém "Falta registrada", também é manual
        else if (absence.reason && (absence.reason.includes('Falta registrada') || absence.reason.includes('registrada manualmente'))) {
          absentUserIdsSet.add(absence.userId);
        }
      }
    }
    
    const absentUserIds = absentUserIdsSet;

    // Funcionários que não precisam bater ponto são automaticamente considerados presentes
    // EXCETO se tiverem falta registrada
    const employeesWithoutTimeClockIds = employeesWithoutTimeClock
      .map((u: any) => u.id)
      .filter((id: string) => !absentUserIds.has(id));
    
    const presentUserIds = new Set([
      ...presentUsers.map((u: any) => u.userId).filter((id: string) => !absentUserIds.has(id)),
      ...employeesWithoutTimeClockIds
    ]);
    const presentToday = presentUserIds.size;
    
    // OTIMIZAÇÃO: Buscar todos os funcionários de uma vez (presentes + todos para ausentes)
    // Incluir também os pendentes para evitar query separada depois
    const allEmployeeIdsForQuery = Array.from(new Set([
      ...Array.from(presentUserIds),
      ...(userIds.length > 0 ? userIds : [])
    ]));

    const allEmployees = await prisma.user.findMany({
      where: allEmployeeIdsForQuery.length > 0 ? {
        id: { in: allEmployeeIdsForQuery },
        role: 'EMPLOYEE',
        isActive: true,
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } }
        ]
      } : {
        role: 'EMPLOYEE',
        isActive: true,
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true,
            requiresTimeClock: true
          }
        }
      }
    });

    // Processar em memória
    const presentEmployeesData = allEmployees.filter(emp => presentUserIds.has(emp.id));
    const absentEmployeesData = allEmployees.filter(emp => !presentUserIds.has(emp.id));

    const absentToday = Math.max(totalEmployees - presentToday, 0);
    const attendanceRate = totalEmployees > 0 ? Math.min(100, Math.max(0, Math.round((presentToday / totalEmployees) * 100))) : 0;

    // Calcular funcionários pendentes (que não bateram os 4 pontos)
    const recordsByUser = new Map<string, Set<string>>();
    allTodayRecords.forEach((record: any) => {
      if (!recordsByUser.has(record.userId)) {
        recordsByUser.set(record.userId, new Set());
      }
      recordsByUser.get(record.userId)!.add(record.type);
    });

    const pendingUserIds: string[] = [];
    recordsByUser.forEach((userRecords, userId) => {
      // Ignorar funcionários que não precisam bater ponto
      if (employeesWithoutTimeClockIds.includes(userId)) {
        return;
      }
      
      const hasEntry = userRecords.has('ENTRY');
      const hasLunchStart = userRecords.has('LUNCH_START');
      const hasLunchEnd = userRecords.has('LUNCH_END');
      const hasExit = userRecords.has('EXIT');
      
      // Se não tem todos os 4 pontos, está pendente
      if (!(hasEntry && hasLunchStart && hasLunchEnd && hasExit)) {
        pendingUserIds.push(userId);
      }
    });

    // OTIMIZAÇÃO: Filtrar pendentes dos dados já buscados em vez de fazer query separada
    const pendingEmployeesData = allEmployees.filter(emp => 
      pendingUserIds.includes(emp.id) && 
      emp.employee?.requiresTimeClock === true
    );

    const pendingToday = pendingUserIds.length;

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
        presentEmployees: presentEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        })),
        absentEmployees: absentEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        })),
        pendingEmployees: pendingEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        }))
      },
    });
  } catch (error) {
    next(error);
  }
});

// Endpoint para retornar todos os módulos disponíveis no sistema
router.get('/modules', authorize('EMPLOYEE'), async (req: AuthRequest, res, next) => {
  try {
    // Buscar dados do usuário para verificar posição e departamento
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        employee: {
          select: {
            position: true,
            department: true
          }
        }
      }
    });

    const userPosition = user?.employee?.position || '';
    const userDepartment = user?.employee?.department || '';
    const isAdministrator = userPosition === 'Administrador';
    const isDepartmentPessoal = userDepartment === 'DEPARTAMENTO PESSOAL';
    const isDepartmentProjetos = userDepartment === 'PROJETOS';
    const isDepartmentCompras = userDepartment === 'COMPRAS';

    const modules = [
      {
        id: 'dashboard',
        name: 'Dashboard',
        description: 'Visão geral do sistema com métricas e estatísticas',
        icon: 'LayoutDashboard',
        href: '/ponto/dashboard',
        category: 'Principal',
        permissions: ['EMPLOYEE']
      },
      {
        id: 'time-records',
        name: 'Registros de Ponto',
        description: 'Bater ponto e gerenciar registros de frequência',
        icon: 'FolderClock',
        href: '/ponto',
        category: 'Registros de Ponto',
        permissions: ['EMPLOYEE']
      },
      {
        id: 'employees',
        name: 'Funcionários',
        description: 'Cadastrar, editar e gerenciar funcionários',
        icon: 'Users',
        href: '/ponto/funcionarios',
        category: 'Funcionários',
        permissions: ['ADMIN', 'DEPARTAMENTO_PESSOAL']
      },
      {
        id: 'birthdays',
        name: 'Aniversariantes',
        description: 'Ver aniversariantes do mês',
        icon: 'CalendarDays',
        href: '/ponto/aniversariantes',
        category: 'Funcionários',
        permissions: ['ADMIN', 'DEPARTAMENTO_PESSOAL']
      },
      {
        id: 'payroll',
        name: 'Folha de Pagamento',
        description: 'Gestão completa de folha de pagamento',
        icon: 'FileSpreadsheet',
        href: '/ponto/folha-pagamento',
        category: 'Folha de Pagamento',
        permissions: ['ADMIN', 'DEPARTAMENTO_PESSOAL']
      },
      {
        id: 'financial',
        name: 'Financeiro',
        description: 'Gerar borderô e CNAB400 para pagamentos',
        icon: 'DollarSign',
        href: '/ponto/financeiro',
        category: 'Financeiro',
        permissions: ['ADMIN']
      },
      {
        id: 'medical-certificates',
        name: 'Registrar Ausência',
        description: 'Enviar e acompanhar atestados médicos e ausências',
        icon: 'BookPlus',
        href: '/ponto/atestados',
        category: 'Ausências',
        permissions: ['EMPLOYEE']
      },
      {
        id: 'manage-medical-certificates',
        name: 'Gerenciar Ausências',
        description: 'Aprovar e gerenciar todas as ausências dos funcionários',
        icon: 'BookText',
        href: '/ponto/gerenciar-atestados',
        category: 'Ausências',
        permissions: ['ADMIN', 'DEPARTAMENTO_PESSOAL']
      },
      {
        id: 'point-corrections',
        name: 'Alterações de ponto',
        description: 'Solicitar e acompanhar alterações de marcação do ponto',
        icon: 'FileText',
        href: '/ponto/solicitacoes',
        category: 'Alterações de ponto',
        permissions: ['EMPLOYEE']
      },
      {
        id: 'manage-point-corrections',
        name: 'Gerenciar alterações de ponto',
        description: 'Analisar e aprovar alterações de marcação dos colaboradores',
        icon: 'FileText',
        href: '/ponto/gerenciar-solicitacoes',
        category: 'Alterações de ponto',
        permissions: ['ADMIN', 'PROJETOS']
      },
      {
        id: 'vacations',
        name: 'Solicitar Férias',
        description: 'Solicitar e acompanhar férias',
        icon: 'ImagePlus',
        href: '/ponto/ferias',
        category: 'Férias',
        permissions: ['EMPLOYEE']
      },
      {
        id: 'manage-vacations',
        name: 'Gerenciar Férias',
        description: 'Gerenciar férias de todos os funcionários',
        icon: 'BookImage',
        href: '/ponto/gerenciar-ferias',
        category: 'Férias',
        permissions: ['ADMIN', 'DEPARTAMENTO_PESSOAL']
      },
      {
        id: 'holidays',
        name: 'Gerenciar Feriados',
        description: 'Gerenciar calendário de feriados',
        icon: 'CalendarDays',
        href: '/ponto/gerenciar-feriados',
        category: 'Férias',
        permissions: ['ADMIN', 'DEPARTAMENTO_PESSOAL']
      },
      {
        id: 'bank-hours',
        name: 'Banco de Horas',
        description: 'Controle de banco de horas dos funcionários',
        icon: 'FolderClock',
        href: '/ponto/banco-horas',
        category: 'Relatórios',
        permissions: ['ADMIN', 'DEPARTAMENTO_PESSOAL']
      },
      {
        id: 'allocation',
        name: 'Alocação',
        description: 'Relatório de alocação de funcionários',
        icon: 'Users',
        href: '/relatorios/alocacao',
        category: 'Relatórios',
        permissions: ['ADMIN']
      },
      {
        id: 'material-requests',
        name: 'Solicitar Materiais',
        description: 'Solicitar materiais para compra (Engenharia)',
        icon: 'ShoppingCart',
        href: '/ponto/solicitar-materiais',
        category: 'Engenharia',
        permissions: ['EMPLOYEE', 'ADMIN']
      },
      {
        id: 'manage-material-requests',
        name: 'Gerenciar Requisições de Materiais',
        description: 'Aprovar e gerenciar requisições de materiais (Compras)',
        icon: 'Package',
        href: '/ponto/gerenciar-materiais',
        category: 'Engenharia',
        permissions: ['ADMIN', 'COMPRAS']
      },
      {
        id: 'chat',
        name: 'Chat entre Setores',
        description: 'Comunicação entre setores',
        icon: 'MessageSquare',
        href: '#',
        category: 'Comunicação',
        permissions: ['EMPLOYEE']
      }
    ];

    // Função para verificar se o usuário tem permissão para ver o módulo
    const hasPermission = (modulePermissions: string[]): boolean => {
      // Se o módulo permite EMPLOYEE, todos têm acesso
      if (modulePermissions.includes('EMPLOYEE')) {
        return true;
      }
      
      // Verificar se é administrador
      if (isAdministrator && modulePermissions.includes('ADMIN')) {
        return true;
      }
      
      // Verificar departamento
      if (isDepartmentPessoal && modulePermissions.includes('DEPARTAMENTO_PESSOAL')) {
        return true;
      }
      
      if (isDepartmentProjetos && modulePermissions.includes('PROJETOS')) {
        return true;
      }
      
      if (isDepartmentCompras && modulePermissions.includes('COMPRAS')) {
        return true;
      }
      
      return false;
    };

    // Filtrar módulos baseado nas permissões do usuário
    const filteredModules = modules.filter(module => hasPermission(module.permissions));

    // Agrupar módulos por categoria
    const modulesByCategory = filteredModules.reduce((acc, module) => {
      if (!acc[module.category]) {
        acc[module.category] = [];
      }
      acc[module.category].push(module);
      return acc;
    }, {} as Record<string, typeof modules>);

    res.json({
      success: true,
      data: {
        modules: filteredModules,
        modulesByCategory,
        totalModules: filteredModules.length
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
