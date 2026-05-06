import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

async function generateSupplierCode(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `FORN-${currentYear}-`;
  const lastSupplier = await prisma.supplier.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' }
  });
  let nextNumber = 1;
  if (lastSupplier) {
    const lastNum = parseInt(lastSupplier.code.replace(prefix, ''), 10);
    if (!isNaN(lastNum)) nextNumber = lastNum + 1;
  }
  return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
}

export class SupplierController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, isActive, page = 1, limit = 500 } = req.query;
      const where: any = {};
      if (search) {
        where.OR = [
          { code: { contains: search as string, mode: 'insensitive' } },
          { name: { contains: search as string, mode: 'insensitive' } },
          { cnpj: { contains: search as string, mode: 'insensitive' } }
        ];
      }
      if (isActive !== undefined) where.isActive = isActive === 'true';
      const limitNum = Math.min(Math.max(Number(limit) || 500, 1), 500);
      const pageNum = Math.max(1, Number(page) || 1);
      const skip = (pageNum - 1) * limitNum;
      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({ where, skip, take: limitNum, orderBy: { name: 'asc' } }),
        prisma.supplier.count({ where })
      ]);
      res.json({
        success: true,
        data: suppliers,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const supplier = await prisma.supplier.findUnique({ where: { id } });
      if (!supplier) throw createError('Fornecedor não encontrado', 404);
      res.json({ success: true, data: supplier });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        code,
        name,
        cnpj,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        contactName,
        notes,
        bank,
        agency,
        account,
        accountDigit
      } = req.body;
      if (!name) throw createError('Nome é obrigatório', 400);
      const finalCode = code || await generateSupplierCode();
      const existingCode = await prisma.supplier.findUnique({ where: { code: finalCode } });
      if (existingCode) throw createError('Código já existe', 400);
      if (cnpj) {
        const existingCnpj = await prisma.supplier.findUnique({ where: { cnpj } });
        if (existingCnpj) throw createError('CNPJ já cadastrado', 400);
      }
      const supplier = await prisma.supplier.create({
        data: {
          code: finalCode,
          name,
          cnpj: cnpj || null,
          email: email || null,
          phone: phone || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
          contactName: contactName || null,
          notes: notes || null,
          bank: bank || null,
          agency: agency || null,
          account: account || null,
          accountDigit: accountDigit || null
        }
      });
      res.status(201).json({ success: true, data: supplier, message: 'Fornecedor criado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        code,
        name,
        cnpj,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        contactName,
        notes,
        isActive,
        bank,
        agency,
        account,
        accountDigit
      } = req.body;
      const supplier = await prisma.supplier.findUnique({ where: { id } });
      if (!supplier) throw createError('Fornecedor não encontrado', 404);
      const data: any = {};
      if (name !== undefined) data.name = name;
      if (code !== undefined) data.code = code;
      if (cnpj !== undefined) data.cnpj = cnpj || null;
      if (email !== undefined) data.email = email || null;
      if (phone !== undefined) data.phone = phone || null;
      if (address !== undefined) data.address = address || null;
      if (city !== undefined) data.city = city || null;
      if (state !== undefined) data.state = state || null;
      if (zipCode !== undefined) data.zipCode = zipCode || null;
      if (contactName !== undefined) data.contactName = contactName || null;
      if (notes !== undefined) data.notes = notes || null;
      if (isActive !== undefined) data.isActive = isActive;
      if (bank !== undefined) data.bank = bank || null;
      if (agency !== undefined) data.agency = agency || null;
      if (account !== undefined) data.account = account || null;
      if (accountDigit !== undefined) data.accountDigit = accountDigit || null;
      const updated = await prisma.supplier.update({ where: { id }, data });
      res.json({ success: true, data: updated, message: 'Fornecedor atualizado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const supplier = await prisma.supplier.findUnique({ where: { id } });
      if (!supplier) throw createError('Fornecedor não encontrado', 404);
      const count = await prisma.purchaseOrder.count({ where: { supplierId: id } });
      if (count > 0) throw createError('Não é possível excluir fornecedor com ordens de compra vinculadas', 400);
      await prisma.supplier.delete({ where: { id } });
      res.json({ success: true, message: 'Fornecedor excluído com sucesso' });
    } catch (error) {
      next(error);
    }
  }
}
