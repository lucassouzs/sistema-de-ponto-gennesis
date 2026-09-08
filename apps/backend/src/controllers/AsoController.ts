import { Response, NextFunction } from 'express';
import { AsoGrauRisco, AsoResultado } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { AsoService, AsoStatusValidade } from '../services/AsoService';

const asoService = new AsoService();

const STATUS_VALIDADE_VALUES: AsoStatusValidade[] = [
  'validos',
  'a_vencer',
  'a_vencer_30',
  'a_vencer_60',
  'vencidos',
  'validade_padrao',
];

function parseStatusValidade(value: unknown): AsoStatusValidade | undefined {
  if (!value) return undefined;
  const str = String(value);
  if (!STATUS_VALIDADE_VALUES.includes(str as AsoStatusValidade)) {
    throw createError('Filtro de validade inválido', 400);
  }
  return str as AsoStatusValidade;
}

export class AsoController {
  async listTipos(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.listTipos();
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async updateTipo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.updateTipo(req.params.id, {
        valorPadrao: req.body?.valorPadrao,
      });
      return res.json({ success: true, data, message: 'Tipo de ASO atualizado' });
    } catch (error) {
      return next(error);
    }
  }

  async listCargosRisco(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.listCargosRisco();
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async listCargosDisponiveis(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.listCargosDisponiveis();
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async cargosSemPeriodicidade(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.cargosSemPeriodicidade();
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async createCargoRisco(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { cargo, setor, grauRisco, periodicidadeMeses } = req.body;
      if (!cargo || !setor || grauRisco == null || periodicidadeMeses == null) {
        throw createError('Cargo, setor, grau de risco e periodicidade são obrigatórios', 400);
      }
      if (!Object.values(AsoGrauRisco).includes(grauRisco)) {
        throw createError('Grau de risco inválido', 400);
      }
      const data = await asoService.createCargoRisco({
        cargo,
        setor,
        grauRisco,
        periodicidadeMeses: Number(periodicidadeMeses),
      });
      return res.status(201).json({ success: true, data, message: 'Cargo de risco cadastrado' });
    } catch (error) {
      return next(error);
    }
  }

  async updateCargoRisco(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { cargo, setor, grauRisco, periodicidadeMeses } = req.body;
      if (grauRisco != null && !Object.values(AsoGrauRisco).includes(grauRisco)) {
        throw createError('Grau de risco inválido', 400);
      }
      const data = await asoService.updateCargoRisco(id, {
        ...(cargo !== undefined ? { cargo } : {}),
        ...(setor !== undefined ? { setor } : {}),
        ...(grauRisco !== undefined ? { grauRisco } : {}),
        ...(periodicidadeMeses !== undefined
          ? { periodicidadeMeses: Number(periodicidadeMeses) }
          : {}),
      });
      return res.json({ success: true, data, message: 'Cargo de risco atualizado' });
    } catch (error) {
      return next(error);
    }
  }

  async deleteCargoRisco(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.deleteCargoRisco(req.params.id);
      return res.json({ success: true, data, message: 'Cargo de risco removido' });
    } catch (error) {
      return next(error);
    }
  }

  async previewValidade(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { funcionarioId, dataExame } = req.query;
      if (!funcionarioId || !dataExame) {
        throw createError('funcionarioId e dataExame são obrigatórios', 400);
      }
      const data = await asoService.previewValidade(
        String(funcionarioId),
        String(dataExame)
      );
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async dashboard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ano = req.query.ano ? String(req.query.ano) : undefined;
      const mes = req.query.mes ? String(req.query.mes) : undefined;
      const data = await asoService.dashboardCounts({ ano, mes });
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async listRegistros(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        search,
        tipoAsoId,
        resultado,
        statusValidade,
        funcionarioId,
        department,
        position,
        ano,
        mes,
        page,
        limit,
      } = req.query;

      if (resultado && !Object.values(AsoResultado).includes(resultado as AsoResultado)) {
        throw createError('Resultado inválido', 400);
      }

      const data = await asoService.listRegistros({
        search: search ? String(search) : undefined,
        tipoAsoId: tipoAsoId ? String(tipoAsoId) : undefined,
        resultado: resultado as AsoResultado | undefined,
        statusValidade: parseStatusValidade(statusValidade),
        funcionarioId: funcionarioId ? String(funcionarioId) : undefined,
        department: department ? String(department) : undefined,
        position: position ? String(position) : undefined,
        ano: ano ? String(ano) : undefined,
        mes: mes ? String(mes) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });

      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async exportRegistros(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        search,
        tipoAsoId,
        resultado,
        statusValidade,
        funcionarioId,
        department,
        position,
        ano,
        mes,
      } = req.query;

      if (resultado && !Object.values(AsoResultado).includes(resultado as AsoResultado)) {
        throw createError('Resultado inválido', 400);
      }

      const data = await asoService.exportRegistros({
        search: search ? String(search) : undefined,
        tipoAsoId: tipoAsoId ? String(tipoAsoId) : undefined,
        resultado: resultado as AsoResultado | undefined,
        statusValidade: parseStatusValidade(statusValidade),
        funcionarioId: funcionarioId ? String(funcionarioId) : undefined,
        department: department ? String(department) : undefined,
        position: position ? String(position) : undefined,
        ano: ano ? String(ano) : undefined,
        mes: mes ? String(mes) : undefined,
      });

      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async listPorFuncionario(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, department, position, statusValidade } = req.query;
      const data = await asoService.listPorFuncionario({
        search: search ? String(search) : undefined,
        department: department ? String(department) : undefined,
        position: position ? String(position) : undefined,
        statusValidade: statusValidade
          ? (String(statusValidade) as AsoStatusValidade | 'sem_aso')
          : undefined,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async historicoFuncionario(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.historicoFuncionario(req.params.funcionarioId);
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async ultimoAsoFuncionario(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.ultimoAsoFuncionario(req.params.funcionarioId);
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async getRegistro(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.getRegistroById(req.params.id);
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  async createRegistro(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        funcionarioId,
        tipoAsoId,
        dataExame,
        resultado,
        medicoResponsavel,
        crmMedico,
        clinica,
        valor,
        anexoUrl,
        observacoes,
      } = req.body;

      if (!funcionarioId || !tipoAsoId || !dataExame || !resultado) {
        throw createError(
          'Funcionário, tipo de ASO, data do exame e resultado são obrigatórios',
          400
        );
      }

      const { data, warning } = await asoService.createRegistro({
        funcionarioId,
        tipoAsoId,
        dataExame,
        resultado,
        medicoResponsavel,
        crmMedico,
        clinica,
        valor,
        anexoUrl,
        observacoes,
        criadoPorId: req.user?.id,
      });

      return res.status(201).json({
        success: true,
        data,
        warning,
        message: data.validadePadrao
          ? 'ASO cadastrado. Validade calculada com 12 meses padrão (cargo sem periodicidade).'
          : 'ASO cadastrado com sucesso',
      });
    } catch (error) {
      return next(error);
    }
  }

  async updateRegistro(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.updateRegistro(req.params.id, req.body);
      return res.json({
        success: true,
        data,
        message: data.validadePadrao
          ? 'ASO atualizado. Validade com 12 meses padrão (cargo sem periodicidade).'
          : 'ASO atualizado com sucesso',
      });
    } catch (error) {
      return next(error);
    }
  }

  async deleteRegistro(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await asoService.deleteRegistro(req.params.id);
      return res.json({ success: true, data, message: 'ASO removido' });
    } catch (error) {
      return next(error);
    }
  }

  async importRegistros(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { registros } = req.body;
      if (!Array.isArray(registros) || registros.length === 0) {
        throw createError('Envie um array "registros" com ao menos um item', 400);
      }

      const data = await asoService.importRegistros(registros, req.user?.id);
      return res.json({
        success: true,
        data,
        message: `Importação concluída: ${data.created} criado(s), ${data.failed} erro(s).`,
      });
    } catch (error) {
      return next(error);
    }
  }
}
