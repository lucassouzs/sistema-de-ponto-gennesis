import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getUserUnbCostCenterScope } from '../lib/unbCostCenterScope';
import { findIdsByUnaccentSearch } from '../lib/normalizeSearchText';

/**
 * Gera um código automático para o centro de custo no formato CC-YYYY-XXX
 * Exemplo: CC-2025-001, CC-2025-002, etc.
 */
async function generateCostCenterCode(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `CC-${currentYear}-`;

  // Buscar o último código do ano atual
  const lastCostCenter = await prisma.costCenter.findFirst({
    where: {
      code: {
        startsWith: prefix
      }
    },
    orderBy: {
      code: 'desc'
    }
  });

  let nextNumber = 1;

  if (lastCostCenter) {
    // Extrair o número do último código
    const lastNumber = parseInt(lastCostCenter.code.replace(prefix, ''), 10);
    if (!isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }

  // Garantir que o código gerado seja único (caso raro de colisão)
  let attempts = 0;
  const maxAttempts = 1000; // Limite de segurança

  while (attempts < maxAttempts) {
    // Formatar com 3 dígitos (001, 002, etc.)
    const formattedNumber = nextNumber.toString().padStart(3, '0');
    const generatedCode = `${prefix}${formattedNumber}`;

    // Verificar se o código já existe
    const existing = await prisma.costCenter.findUnique({
      where: { code: generatedCode }
    });

    if (!existing) {
      return generatedCode;
    }

    // Se existir, tentar o próximo número
    nextNumber++;
    attempts++;
  }

  // Fallback: usar timestamp se atingir o limite (caso extremamente raro)
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}${timestamp}`;
}

export class CostCenterController {
  /**
   * Listar todos os centros de custo
   */
  async getAllCostCenters(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, isActive, page = 1, limit = 20 } = req.query;

      const where: any = {};

      if (search) {
        const ids = await findIdsByUnaccentSearch({
          from: Prisma.sql`cost_centers`,
          columns: ['code', 'name', 'description'],
          search: String(search),
        });
        where.id = { in: ids && ids.length > 0 ? ids : ['__none__'] };
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const unbScope = req.user?.id
        ? await getUserUnbCostCenterScope(req.user.id, !!req.user.isAdmin)
        : null;
      if (unbScope !== null) {
        const allowed = new Set(unbScope);
        if (where.id?.in) {
          where.id = {
            in: (where.id.in as string[]).filter((id) => allowed.has(id)),
          };
          if ((where.id.in as string[]).length === 0) where.id = { in: ['__none__'] };
        } else {
          where.id = { in: unbScope.length > 0 ? unbScope : ['__none__'] };
        }
      }

      // Limitar o máximo de registros por página (até 2000 para listagens completas, ex.: análise de extrato)
      const limitNum = Math.min(Number(limit) || 20, 2000);
      const skip = (Number(page) - 1) * limitNum;

      const [costCenters, total] = await Promise.all([
        prisma.costCenter.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { code: 'asc' }
        }),
        prisma.costCenter.count({ where })
      ]);

      res.json({
        success: true,
        data: costCenters,
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter centro de custo por ID
   */
  async getCostCenterById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const costCenter = await prisma.costCenter.findUnique({
        where: { id }
      });

      if (!costCenter) {
        throw createError('Centro de custo não encontrado', 404);
      }

      res.json({
        success: true,
        data: costCenter
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar novo centro de custo
   */
  async createCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { code, name, description, state, polo, company, isActive } = req.body;

      if (!name) {
        throw createError('Nome é obrigatório', 400);
      }

      // Usar código fornecido se existir e for único; caso contrário gerar um código
      let finalCode: string | null = code && String(code).trim() !== '' ? String(code).trim() : null;

      if (finalCode) {
        const exists = await prisma.costCenter.findUnique({ where: { code: finalCode } });
        if (exists) {
          throw createError('Já existe um centro de custo com este código', 409);
        }
      } else {
        finalCode = await generateCostCenterCode();
      }

      const costCenter = await prisma.costCenter.create({
        data: {
          code: finalCode!,
          name,
          description: description || null,
          state: state || null,
          polo: polo || null,
          company: company || null,
          isActive: isActive !== undefined ? isActive : true
        }
      });

      res.status(201).json({
        success: true,
        data: costCenter,
        message: 'Centro de custo criado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar centro de custo
   */
  async updateCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { code, name, description, state, polo, company, isActive } = req.body;

      // Verificar se o centro de custo existe
      const existing = await prisma.costCenter.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Centro de custo não encontrado', 404);
      }

      // Se o código está sendo alterado, verificar se não existe outro com o mesmo código
      if (code && code !== existing.code) {
        const codeExists = await prisma.costCenter.findUnique({
          where: { code }
        });

        if (codeExists) {
          throw createError('Já existe um centro de custo com este código', 409);
        }
      }

      const costCenter = await prisma.costCenter.update({
        where: { id },
        data: {
          ...(code && { code }),
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(state !== undefined && { state }),
          ...(polo !== undefined && { polo }),
          ...(company !== undefined && { company }),
          ...(isActive !== undefined && { isActive })
        }
      });

      res.json({
        success: true,
        data: costCenter,
        message: 'Centro de custo atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletar centro de custo
   */
  async deleteCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Verificar se o centro de custo existe
      const existing = await prisma.costCenter.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Centro de custo não encontrado', 404);
      }

      // Verificar dependências antes de excluir e buscar detalhes
      const [projects, materialRequests] = await Promise.all([
        prisma.project.findMany({
          where: { costCenterId: id },
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            status: true,
            startDate: true,
            endDate: true,
            createdAt: true
          }
        }),
        prisma.materialRequest.findMany({
          where: { costCenterId: id },
          select: {
            id: true,
            requestNumber: true,
            status: true,
            requestedAt: true
          },
          take: 10 // Limitar a 10 para não sobrecarregar a mensagem
        })
      ]);

      // Se houver dependências, retornar erro informativo com detalhes
      if (projects.length > 0 || materialRequests.length > 0) {
        let message = `Não é possível excluir este centro de custo.\n\n`;
        message += `Este centro de custo está sendo utilizado por:\n\n`;

        if (projects.length > 0) {
          message += `📋 ${projects.length} ${projects.length === 1 ? 'Projeto' : 'Projetos'}:\n`;
          projects.forEach((project, index) => {
            const statusMap: Record<string, string> = {
              'ACTIVE': 'ATIVO',
              'PLANNING': 'PLANEJAMENTO',
              'SUSPENDED': 'SUSPENSO',
              'COMPLETED': 'CONCLUÍDO',
              'CANCELLED': 'CANCELADO'
            };
            const statusLabel = statusMap[project.status] || project.status;
            
            message += `   ${index + 1}. ${project.code} - ${project.name}\n`;
            if (project.description) {
              message += `      Descrição: ${project.description}\n`;
            }
            message += `      Status: ${statusLabel}\n`;
            if (project.startDate) {
              const startDate = new Date(project.startDate).toLocaleDateString('pt-BR');
              message += `      Início: ${startDate}\n`;
            }
            if (project.endDate) {
              const endDate = new Date(project.endDate).toLocaleDateString('pt-BR');
              message += `      Término: ${endDate}\n`;
            }
            message += `\n`;
          });
        }

        if (materialRequests.length > 0) {
          message += `📦 ${materialRequests.length} ${materialRequests.length === 1 ? 'Requisição de Material' : 'Requisições de Material'}:\n`;
          materialRequests.forEach((request, index) => {
            const date = new Date(request.requestedAt).toLocaleDateString('pt-BR');
            message += `   ${index + 1}. ${request.requestNumber} - ${request.status} (${date})\n`;
          });
          if (materialRequests.length === 10) {
            message += `   ... (mostrando apenas as 10 primeiras)\n`;
          }
          message += `\n`;
        }

        message += `💡 Para desativar este centro de custo, edite-o e desmarque a opção "Ativo".`;

        throw createError(message, 409);
      }

      // Se não houver dependências, permitir exclusão
      await prisma.costCenter.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Centro de custo deletado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Importar múltiplos centros de custo em massa
   */
  async importBulkCostCenters(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { costCenters } = req.body;

      if (!Array.isArray(costCenters) || costCenters.length === 0) {
        throw createError('Lista de centros de custo é obrigatória', 400);
      }

      const results = {
        sucessos: 0,
        erros: 0,
        detalhes: [] as Array<{ linha: number; codigo: string; nome: string; sucesso: boolean; erro?: string; aviso?: string }>
      };

      // Códigos já usados nesta importação (duplicata na planilha → gerar novo código para todos darem certo)
      const codigosUsadosNestaImportacao = new Set<string>();

      for (let i = 0; i < costCenters.length; i++) {
        const ccData = costCenters[i];
        const linha = i + 1;

        try {
          // Validações básicas
          if (!ccData.Nome || !ccData.Nome.trim()) {
            results.erros++;
            results.detalhes.push({
              linha,
              codigo: (ccData.Código || ccData.Codigo || ccData.code || ccData.Code || '').toString().trim() || '-',
              nome: ccData.Nome || '(sem nome)',
              sucesso: false,
              erro: 'Nome é obrigatório'
            });
            continue;
          }

          const name = ccData.Nome.trim();
          const description = ccData.Descrição ? ccData.Descrição.trim() : null;
          const state = ccData.Estado ? ccData.Estado.trim() : null;
          const polo = ccData.Polo ? ccData.Polo.trim() : null;
          const company = ccData.Empresa ? ccData.Empresa.trim() : null;
          const isActive = ccData.Status?.toLowerCase() === 'ativo' || ccData.Status === 'Ativo' || ccData.Status === true || ccData.Status === 'true' || ccData.Status === 1;

          // Apenas código precisa ser único; nome pode repetir
          // Código da planilha; se vazio ou duplicado (no banco ou na planilha), gerar um novo para a linha dar certo
          let finalCode: string | null = ccData.Código || ccData.Codigo || ccData.code || ccData.Code || null;
          if (finalCode != null && typeof finalCode !== 'string') finalCode = String(finalCode).trim() || null;
          if (finalCode != null && finalCode !== '') finalCode = String(finalCode).trim(); else finalCode = null;

          let aviso: string | undefined;
          if (finalCode) {
            const codigoJaNoBanco = await prisma.costCenter.findUnique({ where: { code: finalCode } });
            const codigoJaUsadoNestaPlanilha = codigosUsadosNestaImportacao.has(finalCode);
            if (codigoJaNoBanco || codigoJaUsadoNestaPlanilha) {
              aviso = 'Código duplicado; usado código gerado.';
              finalCode = await generateCostCenterCode();
            }
            codigosUsadosNestaImportacao.add(finalCode);
          } else {
            finalCode = await generateCostCenterCode();
          }

          // Criar centro de custo
          await prisma.costCenter.create({
            data: {
              code: finalCode,
              name,
              description,
              state,
              polo,
              company,
              isActive: isActive !== undefined ? isActive : true
            }
          });

          results.sucessos++;
          results.detalhes.push({
            linha,
            codigo: finalCode,
            nome: name,
            sucesso: true,
            ...(aviso && { aviso })
          });
        } catch (error: any) {
          results.erros++;
          results.detalhes.push({
            linha,
            codigo: (ccData.Código || ccData.Codigo || ccData.code || ccData.Code || '').toString().trim() || '-',
            nome: ccData.Nome || '(sem nome)',
            sucesso: false,
            erro: error.message || 'Erro ao criar centro de custo'
          });
        }
      }

      res.json({
        success: true,
        data: results,
        message: `${results.sucessos} centro(s) de custo importado(s) com sucesso, ${results.erros} erro(s)`
      });
    } catch (error) {
      next(error);
    }
  }
}

