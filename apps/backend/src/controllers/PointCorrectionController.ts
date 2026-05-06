import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// Schemas de validação
const createPointCorrectionSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  justification: z.string().min(20, 'Justificativa deve ter pelo menos 20 caracteres'),
  originalDate: z.string().transform((str) => new Date(str)),
  originalTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido (HH:MM)'),
  originalType: z.enum(['ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT']),
  correctedDate: z.string().transform((str) => new Date(str)),
  correctedTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido (HH:MM)'),
  correctedType: z.enum(['ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT']),
});

const approveRequestSchema = z.object({
  comment: z.string().min(1, 'Comentário é obrigatório'),
  isInternal: z.boolean().default(false),
});

const rejectRequestSchema = z.object({
  reason: z.string().min(1, 'Motivo da rejeição é obrigatório'),
  comment: z.string().min(1, 'Comentário é obrigatório'),
  isInternal: z.boolean().default(false),
});

export class PointCorrectionController {
  // Listar solicitações do funcionário
  async getMyRequests(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const { status } = req.query;

      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!employee) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      const whereClause: any = {
        employeeId: employee.id
      };

      if (status) {
        whereClause.status = status;
      }

      const requests = await prisma.pointCorrectionRequest.findMany({
        where: whereClause,
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          comments: {
            where: { isInternal: false }, // Apenas comentários visíveis para o funcionário
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(requests);
    } catch (error) {
      console.error('Erro ao buscar solicitações:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Criar nova solicitação
  async createRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const validatedData = createPointCorrectionSchema.parse(req.body);

      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!employee) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      // Combinar data e hora para criar timestamp
      const originalDate = new Date(validatedData.originalDate);
      const [originalHours, originalMinutes] = validatedData.originalTime.split(':');
      originalDate.setHours(parseInt(originalHours), parseInt(originalMinutes), 0, 0);

      const request = await prisma.pointCorrectionRequest.create({
        data: {
          employeeId: employee.id,
          title: validatedData.title,
          description: validatedData.justification, // Usar justification como description
          justification: validatedData.justification,
          originalDate: originalDate,
          originalTime: validatedData.originalTime,
          originalType: validatedData.originalType,
          correctedDate: validatedData.correctedDate,
          correctedTime: validatedData.correctedTime,
          correctedType: validatedData.correctedType,
          status: 'PENDING'
        },
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          comments: {
            where: { isInternal: false },
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      return res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Dados inválidos', 
          details: error.errors 
        });
      }
      console.error('Erro ao criar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Obter detalhes de uma solicitação
  async getRequestById(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!employee) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      const request = await prisma.pointCorrectionRequest.findFirst({
        where: {
          id: requestId,
          employeeId: employee.id
        },
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          comments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!request) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      return res.json(request);
    } catch (error) {
      console.error('Erro ao buscar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Atualizar solicitação (apenas se pendente)
  async updateRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!employee) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      const existingRequest = await prisma.pointCorrectionRequest.findFirst({
        where: {
          id: requestId,
          employeeId: employee.id,
          status: 'PENDING'
        }
      });

      if (!existingRequest) {
        return res.status(404).json({ error: 'Solicitação não encontrada ou não pode ser editada' });
      }

      const validatedData = createPointCorrectionSchema.parse(req.body);

      const updatedRequest = await prisma.pointCorrectionRequest.update({
        where: { id: requestId },
        data: {
          title: validatedData.title,
          description: validatedData.justification, // Usar justification como description
          justification: validatedData.justification,
          originalDate: validatedData.originalDate,
          originalTime: validatedData.originalTime,
          originalType: validatedData.originalType,
          correctedDate: validatedData.correctedDate,
          correctedTime: validatedData.correctedTime,
          correctedType: validatedData.correctedType
        },
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          comments: {
            where: { isInternal: false },
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      return res.json(updatedRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Dados inválidos', 
          details: error.errors 
        });
      }
      console.error('Erro ao atualizar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Cancelar solicitação
  async cancelRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!employee) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      const request = await prisma.pointCorrectionRequest.findFirst({
        where: {
          id: requestId,
          employeeId: employee.id,
          status: { in: ['PENDING', 'IN_REVIEW'] }
        }
      });

      if (!request) {
        return res.status(404).json({ error: 'Solicitação não encontrada ou não pode ser cancelada' });
      }

      await prisma.pointCorrectionRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' }
      });

      return res.json({ message: 'Solicitação cancelada com sucesso' });
    } catch (error) {
      console.error('Erro ao cancelar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Listar solicitações para aprovação (supervisores/RH)
  async getPendingApproval(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { status } = req.query;

      console.log('Buscando solicitações para aprovação, status:', status);

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const whereClause: any = {};

      // Filtrar por status se especificado
      if (status) {
        if (status === 'all') {
          // Se selecionou "Todos os status", mostrar todas
          console.log('Mostrando TODAS as solicitações');
        } else {
          // Filtrar por status específico
          whereClause.status = status as string;
          console.log('Filtrando por status específico:', status);
        }
      } else {
        // Se não especificado, mostrar apenas PENDENTES (padrão)
        whereClause.status = 'PENDING';
        console.log('Mostrando apenas PENDING (padrão)');
      }

      console.log('Where clause:', whereClause);

      const requests = await prisma.pointCorrectionRequest.findMany({
        where: whereClause,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              department: true,
              position: true,
              company: true,
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          comments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log('Requests encontradas:', requests.length);
      console.log('Primeira request:', requests[0]?.status);
      console.log('Todas as requests:', requests.map(r => ({ id: r.id, status: r.status, title: r.title })));

      return res.json(requests);
    } catch (error) {
      console.error('Erro ao buscar solicitações para aprovação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Aprovar solicitação
  async approveRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const validatedData = approveRequestSchema.parse(req.body);

      const request = await prisma.pointCorrectionRequest.findUnique({
        where: { id: requestId },
        include: {
          employee: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!request) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      if (request.status !== 'PENDING' && request.status !== 'IN_REVIEW') {
        return res.status(400).json({ error: 'Solicitação não pode ser aprovada' });
      }

      const updatedRequest = await prisma.pointCorrectionRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          approvedBy: userId,
          approvedAt: new Date()
        },
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          employee: {
            select: {
              id: true,
              employeeId: true,
              department: true,
              position: true,
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      // Adicionar comentário de aprovação e atualizar o ponto em uma transação
      await prisma.$transaction(async (tx) => {
        // Adicionar comentário de aprovação
        await tx.pointCorrectionComment.create({
          data: {
            requestId: requestId,
            userId: userId,
            comment: validatedData.comment,
            isInternal: validatedData.isInternal
          }
        });

        // Buscar o registro de ponto original para atualizar
        // O originalDate já vem como DateTime do Prisma, então podemos usar diretamente
        // Mas precisamos combinar com originalTime
        const originalDateObj = new Date(request.originalDate);
        const [originalHours, originalMinutes] = request.originalTime.split(':');
        
        // Construir timestamp exatamente como é salvo no banco (mesma lógica do TimeRecordController)
        // O timestamp é salvo como UTC mas representa o horário local
        const originalYear = originalDateObj.getFullYear();
        const originalMonth = originalDateObj.getMonth(); // getMonth retorna 0-11
        const originalDay = originalDateObj.getDate();
        const originalHoursNum = parseInt(originalHours);
        const originalMinutesNum = parseInt(originalMinutes);
        // Formato: YYYY-MM-DDTHH:mm:00
        const originalDateStr = `${originalYear}-${String(originalMonth + 1).padStart(2, '0')}-${String(originalDay).padStart(2, '0')}T${String(originalHoursNum).padStart(2, '0')}:${String(originalMinutesNum).padStart(2, '0')}:00`;
        const originalTimestamp = new Date(originalDateStr + 'Z'); // Adicionar Z para forçar UTC
        
        // Buscar o userId do employee para também buscar por userId
        const employee = await tx.employee.findUnique({
          where: { id: request.employeeId },
          select: { userId: true }
        });

        console.log(`Buscando registro de ponto para solicitação ${requestId}:`);
        console.log(`- EmployeeId: ${request.employeeId}`);
        console.log(`- UserId: ${employee?.userId || 'não encontrado'}`);
        console.log(`- Tipo original: ${request.originalType}`);
        console.log(`- Data original: ${request.originalDate}`);
        console.log(`- Hora original: ${request.originalTime}`);
        console.log(`- Timestamp original construído: ${originalTimestamp.toISOString()}`);

        // Primeiro, tentar buscar com uma janela pequena (1 minuto antes e depois) para encontrar o registro exato
        const exactWindowStart = new Date(originalTimestamp);
        exactWindowStart.setUTCMinutes(exactWindowStart.getUTCMinutes() - 1);
        exactWindowStart.setUTCSeconds(0);
        exactWindowStart.setUTCMilliseconds(0);
        const exactWindowEnd = new Date(originalTimestamp);
        exactWindowEnd.setUTCMinutes(exactWindowEnd.getUTCMinutes() + 1);
        exactWindowEnd.setUTCSeconds(59);
        exactWindowEnd.setUTCMilliseconds(999);

        console.log(`- Buscando na janela exata: ${exactWindowStart.toISOString()} até ${exactWindowEnd.toISOString()}`);

        // Buscar todos os registros na janela exata com o tipo correto
        let dayRecords = await tx.timeRecord.findMany({
          where: {
            employeeId: request.employeeId,
            type: request.originalType,
            timestamp: {
              gte: exactWindowStart,
              lte: exactWindowEnd
            }
          },
          orderBy: {
            timestamp: 'asc'
          }
        });

        console.log(`Registros encontrados na janela exata (por employeeId): ${dayRecords.length}`);

        // Se não encontrou, tentar buscar por userId também na janela exata
        if (dayRecords.length === 0 && employee) {
          console.log(`Tentando buscar por userId na janela exata: ${employee.userId}`);
          dayRecords = await tx.timeRecord.findMany({
            where: {
              userId: employee.userId,
              type: request.originalType,
              timestamp: {
                gte: exactWindowStart,
                lte: exactWindowEnd
              }
            },
            orderBy: {
              timestamp: 'asc'
            }
          });
          console.log(`Registros encontrados na janela exata (por userId): ${dayRecords.length}`);
        }

        // Se ainda não encontrou, buscar por dia inteiro
        if (dayRecords.length === 0) {
          const dayStart = new Date(originalTimestamp);
          dayStart.setUTCHours(0, 0, 0, 0);
          const dayEnd = new Date(originalTimestamp);
          dayEnd.setUTCHours(23, 59, 59, 999);
          
          console.log(`Tentando buscar todos os registros do dia: ${dayStart.toISOString()} até ${dayEnd.toISOString()}`);
          dayRecords = await tx.timeRecord.findMany({
            where: {
              employeeId: request.employeeId,
              type: request.originalType,
              timestamp: {
                gte: dayStart,
                lte: dayEnd
              }
            },
            orderBy: {
              timestamp: 'asc'
            }
          });
          console.log(`Registros encontrados no dia (por employeeId): ${dayRecords.length}`);
        }

        // Se ainda não encontrou, buscar por userId no dia inteiro
        if (dayRecords.length === 0 && employee) {
          const dayStart = new Date(originalTimestamp);
          dayStart.setUTCHours(0, 0, 0, 0);
          const dayEnd = new Date(originalTimestamp);
          dayEnd.setUTCHours(23, 59, 59, 999);
          
          console.log(`Tentando buscar por userId no dia inteiro...`);
          dayRecords = await tx.timeRecord.findMany({
            where: {
              userId: employee.userId,
              type: request.originalType,
              timestamp: {
                gte: dayStart,
                lte: dayEnd
              }
            },
            orderBy: {
              timestamp: 'asc'
            }
          });
          console.log(`Registros encontrados no dia (por userId): ${dayRecords.length}`);
        }

        // Se ainda não encontrou, buscar todos os registros do dia sem filtro de tipo
        if (dayRecords.length === 0) {
          const dayStart = new Date(originalTimestamp);
          dayStart.setUTCHours(0, 0, 0, 0);
          const dayEnd = new Date(originalTimestamp);
          dayEnd.setUTCHours(23, 59, 59, 999);
          
          console.log(`Tentando buscar todos os registros do dia sem filtro de tipo...`);
          dayRecords = await tx.timeRecord.findMany({
            where: {
              employeeId: request.employeeId,
              timestamp: {
                gte: dayStart,
                lte: dayEnd
              }
            },
            orderBy: {
              timestamp: 'asc'
            }
          });
          console.log(`Registros encontrados no dia (sem filtro de tipo): ${dayRecords.length}`);
        }

        // Se ainda não encontrou, buscar TODOS os registros do funcionário do tipo correto
        if (dayRecords.length === 0) {
          console.log(`Buscando TODOS os registros do funcionário do tipo ${request.originalType}...`);
          const allEmployeeRecords = await tx.timeRecord.findMany({
            where: {
              employeeId: request.employeeId,
              type: request.originalType
            },
            orderBy: {
              timestamp: 'desc'
            },
            take: 20 // Últimos 20 registros do tipo
          });
          console.log(`Total de registros do funcionário do tipo ${request.originalType} (últimos 20): ${allEmployeeRecords.length}`);
          allEmployeeRecords.forEach((r, idx) => {
            console.log(`  ${idx + 1}. ID: ${r.id}, Timestamp: ${r.timestamp.toISOString()}, Tipo: ${r.type}, Data: ${r.timestamp.toISOString().split('T')[0]}`);
          });
          
          // Se encontrou registros do tipo correto, usar o mais próximo do horário original
          if (allEmployeeRecords.length > 0) {
            console.log(`Usando o registro mais próximo do horário original...`);
            dayRecords = allEmployeeRecords;
          }
        }

        dayRecords.forEach((r, idx) => {
          console.log(`  ${idx + 1}. ID: ${r.id}, Timestamp: ${r.timestamp.toISOString()}, Tipo: ${r.type}, EmployeeId: ${r.employeeId}, UserId: ${r.userId}`);
        });

        // Encontrar o registro mais próximo do horário original
        let originalRecord = null;
        if (dayRecords.length > 0) {
          // Se houver apenas um, usar ele
          if (dayRecords.length === 1) {
            originalRecord = dayRecords[0];
            console.log(`✓ Usando o único registro encontrado: ${originalRecord.id}`);
          } else {
            // Se houver múltiplos, encontrar o mais próximo do horário original
            originalRecord = dayRecords.reduce((closest, current) => {
              const closestDiff = Math.abs(closest.timestamp.getTime() - originalTimestamp.getTime());
              const currentDiff = Math.abs(current.timestamp.getTime() - originalTimestamp.getTime());
              return currentDiff < closestDiff ? current : closest;
            });
            console.log(`✓ Usando o registro mais próximo do horário original: ${originalRecord.id}`);
          }
          
          // Log da diferença de tempo
          const timeDiff = Math.abs(originalRecord.timestamp.getTime() - originalTimestamp.getTime());
          const hoursDiff = timeDiff / (1000 * 60 * 60);
          console.log(`  Diferença de tempo: ${hoursDiff.toFixed(2)} horas (${(hoursDiff * 60).toFixed(0)} minutos)`);
          
          // Se a diferença for muito grande (mais de 24 horas), avisar mas ainda usar
          if (hoursDiff > 24) {
            console.warn(`⚠ ATENÇÃO: Diferença de tempo muito grande (${hoursDiff.toFixed(2)} horas). O registro pode não ser o correto.`);
          }
        }

        // Se não encontrou nenhum registro, não criar novo - apenas logar erro
        if (!originalRecord) {
          console.error(`✗ ERRO: Nenhum registro de ponto encontrado para atualizar!`);
          console.error(`  Isso significa que o ponto original não existe no banco de dados.`);
          console.error(`  Verifique se o ponto foi realmente batido na data/hora indicada.`);
          // Não criar novo registro - apenas retornar erro
          throw new Error(`Registro de ponto não encontrado para atualizar. Verifique se o ponto foi batido na data/hora original indicada na solicitação.`);
        }

        if (originalRecord) {
          console.log(`✓ Registro selecionado: ${originalRecord.id}`);
          console.log(`  Timestamp atual: ${originalRecord.timestamp.toISOString()}`);
          console.log(`  Diferença do original: ${Math.abs(originalRecord.timestamp.getTime() - originalTimestamp.getTime()) / 1000 / 60} minutos`);
          
          // Construir novo timestamp com a data/hora corrigida (mesma lógica do TimeRecordController)
          // O correctedDate vem como DateTime do Prisma, mas precisamos extrair a data sem conversão de timezone
          // Usar getUTCFullYear, getUTCMonth, getUTCDate para extrair a data em UTC
          const correctedDateObj = new Date(request.correctedDate);
          const correctedYear = correctedDateObj.getUTCFullYear();
          const correctedMonth = correctedDateObj.getUTCMonth(); // Retorna 0-11
          const correctedDay = correctedDateObj.getUTCDate();
          const [correctedHours, correctedMinutes] = request.correctedTime.split(':').map(Number);
          
          // Construir timestamp exatamente como é salvo no banco (mesma lógica do TimeRecordController)
          // Formato: YYYY-MM-DDTHH:mm:00Z
          const correctedDateStr = `${correctedYear}-${String(correctedMonth + 1).padStart(2, '0')}-${String(correctedDay).padStart(2, '0')}T${String(correctedHours).padStart(2, '0')}:${String(correctedMinutes).padStart(2, '0')}:00`;
          const correctedTimestamp = new Date(correctedDateStr + 'Z'); // Adicionar Z para forçar UTC

          console.log(`Atualizando registro:`);
          console.log(`  - Data corrigida (objeto): ${correctedDateObj.toISOString()}`);
          console.log(`  - Ano: ${correctedYear}, Mês: ${correctedMonth + 1}, Dia: ${correctedDay}`);
          console.log(`  - Hora corrigida: ${correctedHours}:${correctedMinutes}`);
          console.log(`  - Timestamp corrigido construído: ${correctedTimestamp.toISOString()}`);
          console.log(`  - Novo tipo: ${request.correctedType}`);

          // Atualizar o registro de ponto com os valores corrigidos
          const updatedRecord = await tx.timeRecord.update({
            where: { id: originalRecord.id },
            data: {
              timestamp: correctedTimestamp,
              type: request.correctedType,
              updatedAt: new Date()
            }
          });
          
          console.log(`✓ Registro atualizado com sucesso!`);
          console.log(`  Novo timestamp no banco: ${updatedRecord.timestamp.toISOString()}`);
        } else {
          console.error(`✗ Nenhum registro de ponto encontrado para atualizar!`);
          console.error(`  EmployeeId: ${request.employeeId}`);
          console.error(`  Tipo: ${request.originalType}`);
          console.error(`  Data: ${request.originalDate}`);
          console.error(`  Hora: ${request.originalTime}`);
        }
      });

      return res.json({ message: 'Solicitação aprovada com sucesso', request: updatedRequest });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Dados inválidos', 
          details: error.errors 
        });
      }
      console.error('Erro ao aprovar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Rejeitar solicitação
  async rejectRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const validatedData = rejectRequestSchema.parse(req.body);

      const request = await prisma.pointCorrectionRequest.findUnique({
        where: { id: requestId },
        include: {
          employee: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!request) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      if (request.status !== 'PENDING' && request.status !== 'IN_REVIEW') {
        return res.status(400).json({ error: 'Solicitação não pode ser rejeitada' });
      }

      const updatedRequest = await prisma.pointCorrectionRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          approvedBy: userId,
          approvedAt: new Date(),
          rejectionReason: validatedData.reason
        },
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          employee: {
            select: {
              id: true,
              employeeId: true,
              department: true,
              position: true,
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      // Adicionar comentário de rejeição
      await prisma.pointCorrectionComment.create({
        data: {
          requestId: requestId,
          userId: userId,
          comment: validatedData.comment,
          isInternal: validatedData.isInternal
        }
      });

      return res.json({ message: 'Solicitação rejeitada com sucesso', request: updatedRequest });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Dados inválidos', 
          details: error.errors 
        });
      }
      console.error('Erro ao rejeitar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}
