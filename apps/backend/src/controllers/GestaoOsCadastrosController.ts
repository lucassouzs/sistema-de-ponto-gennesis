import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { gestaoOsCadastrosService } from '../services/GestaoOsCadastrosService';

export class GestaoOsCadastrosController {
  // Empresas
  async listCompanies(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.listCompanies();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.createCompany(req.body ?? {});
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.updateCompany(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createBranch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.createBranch(req.body ?? {});
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateBranch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.updateBranch(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Locais / ativos
  async locationTreeAdmin(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
      const data = await gestaoOsCadastrosService.getLocationTreeAdmin(companyId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createBuilding(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.createBuilding(req.body ?? {});
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateBuilding(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.updateBuilding(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createSector(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.createSector(req.body ?? {});
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateSector(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.updateSector(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createPlace(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.createPlace(req.body ?? {});
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updatePlace(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.updatePlace(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createAsset(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.createAsset(req.body ?? {});
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateAsset(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.updateAsset(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async assetQr(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.getAssetQrCode(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async resolveQr(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const token = typeof req.query.token === 'string' ? req.query.token : req.params.token;
      const data = await gestaoOsCadastrosService.getAssetByQrToken(token);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Prestadores
  async listProviders(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
      const data = await gestaoOsCadastrosService.listProviders(companyId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createProvider(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.createProvider(req.body ?? {});
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateProvider(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.updateProvider(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Categorias
  async listCategories(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
      const data = await gestaoOsCadastrosService.listCategories(companyId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createCategory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.createCategory(req.body ?? {});
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateCategory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.updateCategory(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Memberships
  async listMemberships(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
      const data = await gestaoOsCadastrosService.listMemberships(companyId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async upsertMembership(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.upsertMembership(req.body ?? {});
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateMembership(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.updateMembership(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async listUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.listUsersForMembership();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getSettings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.getSettings();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsCadastrosService.updateSettings(req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const gestaoOsCadastrosController = new GestaoOsCadastrosController();
