import { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import * as XLSX from 'xlsx';
import { uploadImport } from '../middleware/upload';

async function generateBudgetNatureCode(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `NAT-${currentYear}-`;
  const last = await prisma.budgetNature.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' }
  });
  let nextNumber = 1;
  if (last && last.code) {
    const lastNum = parseInt(last.code.replace(prefix, ''), 10);
    if (!isNaN(lastNum)) nextNumber = lastNum + 1;
  }
  return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
}

export class BudgetNatureController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, page = 1, limit = 100, isActive } = req.query;
      const where: any = {};
      if (search) {
        where.OR = [
          { code: { contains: search as string, mode: 'insensitive' } },
          { name: { contains: search as string, mode: 'insensitive' } }
        ];
      }
      if (isActive !== undefined) where.isActive = isActive === 'true';
      const limitNum = Math.min(Number(limit), 500);
      const skip = (Number(page) - 1) * limitNum;
      const [items, total] = await Promise.all([
        prisma.budgetNature.findMany({ where, skip, take: limitNum, orderBy: { name: 'asc' } }),
        prisma.budgetNature.count({ where })
      ]);
      res.json({
        success: true,
        data: items,
        pagination: { page: Number(page), limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await prisma.budgetNature.findUnique({ where: { id } });
      if (!item) throw createError('Natureza orçamentária não encontrada', 404);
      res.json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { code, name } = req.body;
      if (!name) throw createError('Nome é obrigatório', 400);
      const finalCode = code || await generateBudgetNatureCode();
      const existing = await prisma.budgetNature.findUnique({ where: { code: finalCode } });
      if (existing) throw createError('Código já existe', 400);
      const created = await prisma.budgetNature.create({
        data: {
          code: finalCode,
          name,
        }
      });
      res.status(201).json({ success: true, data: created, message: 'Natureza orçamentária criada' });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { code, name, isActive } = req.body;
      const item = await prisma.budgetNature.findUnique({ where: { id } });
      if (!item) throw createError('Natureza orçamentária não encontrada', 404);
      const data: any = {};
      if (code !== undefined) data.code = code || null;
      if (name !== undefined) data.name = name;
      if (isActive !== undefined) data.isActive = isActive;
      const updated = await prisma.budgetNature.update({ where: { id }, data });
      res.json({ success: true, data: updated, message: 'Atualizado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await prisma.budgetNature.findUnique({ where: { id } });
      if (!item) throw createError('Natureza orçamentária não encontrada', 404);
      await prisma.budgetNature.delete({ where: { id } });
      res.json({ success: true, message: 'Registro excluído' });
    } catch (error) {
      next(error);
    }
  }

  // Importar a partir de um arquivo Excel (.xlsx/.xls) ou CSV
  async importFile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw createError('Arquivo não enviado', 400);
      const file = req.file;
      const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');
      // For simplicity accept CSV as well, but use XLSX utils which handles CSV too
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

      if (!rows || rows.length === 0) {
        throw createError('Arquivo vazio ou sem dados válidos', 400);
      }

      const successes: any[] = [];
      const errors: any[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const line = i + 2;
        // Accept columns 'Código' or 'Code' and 'Natureza' or 'Name'
        const code = (row['Código'] || row['Code'] || row['codigo'] || row['code'] || '').toString().trim();
        const name = (row['Natureza'] || row['Nome'] || row['Name'] || row['name'] || '').toString().trim();

        if (!name) {
          errors.push({ linha: line, erro: 'Nome (Natureza) obrigatório' });
          continue;
        }

        // Check duplicates by code or name
        let exists = null;
        if (code) {
          exists = await prisma.budgetNature.findUnique({ where: { code } });
        }
        if (!exists) {
          const existingByName = await prisma.budgetNature.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
          if (existingByName) exists = existingByName;
        }

        if (exists) {
          errors.push({ linha: line, erro: 'Registro já existe', detalhe: { code, name } });
          continue;
        }

        try {
          const created = await prisma.budgetNature.create({
            data: {
              code: code || undefined,
              name
            }
          });
          successes.push({ linha: line, data: created });
        } catch (err: any) {
          errors.push({ linha: line, erro: err.message || 'Erro ao inserir' });
        }
      }

      return res.json({
        success: true,
        data: {
          total: rows.length,
          sucessos: successes.length,
          erros: errors.length,
          detalhes: { sucessos: successes, erros: errors }
        }
      });
    } catch (error) {
      return next(error);
    }
  }
}

