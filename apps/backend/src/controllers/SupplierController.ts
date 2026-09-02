import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { findIdsByUnaccentSearch } from '../lib/normalizeSearchText';

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function parseActive(value: unknown, defaultValue = true): boolean {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || String(value).trim() === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['sim', 's', 'true', '1', 'ativo', 'yes'].includes(normalized)) return true;
  if (['nao', 'não', 'n', 'false', '0', 'inativo', 'no'].includes(normalized)) return false;
  return defaultValue;
}

function composeAddress(parts: {
  street?: string | null;
  streetNumber?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  address?: string | null;
}): string | null {
  if (parts.address) return parts.address;
  const segments = [
    parts.street,
    parts.streetNumber ? `nº ${parts.streetNumber}` : null,
    parts.complement,
    parts.neighborhood
  ].filter(Boolean);
  return segments.length > 0 ? segments.join(', ') : null;
}

type SupplierInput = Record<string, unknown>;

function normalizeSupplierCategory(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['pessoa fisica', 'pf', 'fisica'].includes(normalized)) return 'Pessoa Física';
  if (['pessoa juridica', 'pj', 'juridica'].includes(normalized)) return 'Pessoa Jurídica';
  return null;
}

function buildSupplierData(body: SupplierInput) {
  const street = normalizeOptionalString(body.street);
  const streetNumber = normalizeOptionalString(body.streetNumber ?? body.number);
  const complement = normalizeOptionalString(body.complement);
  const neighborhood = normalizeOptionalString(body.neighborhood);
  const legacyAddress = normalizeOptionalString(body.address);

  return {
    partyType: normalizeOptionalString(body.partyType),
    tradeName: normalizeOptionalString(body.tradeName),
    name: normalizeOptionalString(body.name) || '',
    cnpj: normalizeOptionalString(body.cnpj),
    stateRegistration: normalizeOptionalString(body.stateRegistration),
    municipalRegistration: normalizeOptionalString(body.municipalRegistration),
    category: normalizeSupplierCategory(body.category),
    street,
    streetNumber,
    neighborhood,
    complement,
    poBox: normalizeOptionalString(body.poBox),
    email: normalizeOptionalString(body.email),
    phone: normalizeOptionalString(body.phone),
    fax: normalizeOptionalString(body.fax),
    mobile: normalizeOptionalString(body.mobile),
    address: composeAddress({ street, streetNumber, complement, neighborhood, address: legacyAddress }),
    city: normalizeOptionalString(body.city),
    state: normalizeOptionalString(body.state),
    zipCode: normalizeOptionalString(body.zipCode),
    contactName: normalizeOptionalString(body.contactName),
    notes: normalizeOptionalString(body.notes),
    bank: normalizeOptionalString(body.bank),
    agency: normalizeOptionalString(body.agency),
    account: normalizeOptionalString(body.account),
    accountDigit: normalizeOptionalString(body.accountDigit),
    pixKeyType: normalizeOptionalString(body.pixKeyType),
    pixKey: normalizeOptionalString(body.pixKey),
    isActive: parseActive(body.isActive)
  };
}

async function generateSupplierCode(): Promise<string> {
  const [code] = await reserveSupplierCodes(1);
  if (!code) throw createError('Não foi possível gerar o código do fornecedor', 500);
  return code;
}

/** Reserva N códigos numéricos sequenciais: 1, 2, 3, ... */
async function reserveSupplierCodes(count: number): Promise<string[]> {
  if (count <= 0) return [];

  const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(
      CASE
        WHEN code ~ '^[0-9]+$' THEN CAST(code AS INTEGER)
        WHEN code ~* '^FORN-[0-9]+-[0-9]+$' THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
      END
    ) AS max
    FROM suppliers
  `;

  let start = Number(result[0]?.max ?? 0);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    start += 1;
    codes.push(String(start));
  }
  return codes;
}

export class SupplierController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, isActive, page = 1, limit = 20 } = req.query;
      const where: Record<string, unknown> = {};
      if (search) {
        const ids = await findIdsByUnaccentSearch({
          from: Prisma.sql`suppliers`,
          columns: ['code', 'name', '"tradeName"', 'cnpj', '"partyType"', 'category', 'city'],
          search: String(search),
        });
        where.id = { in: ids && ids.length > 0 ? ids : ['__none__'] };
      }
      if (isActive !== undefined) where.isActive = isActive === 'true';
      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 2000);
      const pageNum = Math.max(1, Number(page) || 1);
      const skip = (pageNum - 1) * limitNum;
      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: [{ createdAt: 'asc' }]
        }),
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
      const parsed = buildSupplierData(req.body);
      if (!parsed.name) throw createError('Nome é obrigatório', 400);

      const finalCode = await generateSupplierCode();
      const existingCode = await prisma.supplier.findUnique({ where: { code: finalCode } });
      if (existingCode) throw createError('Código já existe', 400);

      if (parsed.cnpj) {
        const existingCnpj = await prisma.supplier.findUnique({ where: { cnpj: parsed.cnpj } });
        if (existingCnpj) throw createError('CPF/CNPJ já cadastrado', 400);
      }

      const supplier = await prisma.supplier.create({
        data: {
          code: finalCode,
          ...parsed
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
      const supplier = await prisma.supplier.findUnique({ where: { id } });
      if (!supplier) throw createError('Fornecedor não encontrado', 404);

      const parsed = buildSupplierData({ ...supplier, ...req.body });
      if (!parsed.name) throw createError('Nome é obrigatório', 400);

      if (req.body.code !== undefined) {
        const newCode = normalizeOptionalString(req.body.code);
        if (newCode && newCode !== supplier.code) {
          const existingCode = await prisma.supplier.findUnique({ where: { code: newCode } });
          if (existingCode) throw createError('Código já existe', 400);
        }
      }

      if (parsed.cnpj && parsed.cnpj !== supplier.cnpj) {
        const existingCnpj = await prisma.supplier.findUnique({ where: { cnpj: parsed.cnpj } });
        if (existingCnpj) throw createError('CPF/CNPJ já cadastrado', 400);
      }

      const data: Record<string, unknown> = { ...parsed };
      if (req.body.code !== undefined) data.code = normalizeOptionalString(req.body.code) || supplier.code;

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
      if (count > 0) {
        throw createError('Não é possível excluir fornecedor com ordens de compra vinculadas', 400);
      }
      await prisma.supplier.delete({ where: { id } });
      res.json({ success: true, message: 'Fornecedor excluído com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async importSuppliers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { suppliers } = req.body;

      if (!Array.isArray(suppliers) || suppliers.length === 0) {
        throw createError('Envie um array "suppliers" com ao menos um item', 400);
      }

      let created = 0;
      const errors: { index: number; message: string }[] = [];
      const reservedCodes = await reserveSupplierCodes(suppliers.length);

      for (let i = 0; i < suppliers.length; i++) {
        const row = suppliers[i] as SupplierInput;
        try {
          const parsed = buildSupplierData(row);

          if (!parsed.name) {
            errors.push({ index: i, message: 'Nome é obrigatório' });
            continue;
          }

          if (parsed.cnpj) {
            const existingCnpj = await prisma.supplier.findUnique({ where: { cnpj: parsed.cnpj } });
            if (existingCnpj) {
              errors.push({ index: i, message: `CPF/CNPJ já cadastrado: ${parsed.cnpj}` });
              continue;
            }
          }

          await prisma.supplier.create({
            data: {
              code: reservedCodes[i],
              ...parsed
            }
          });

          created += 1;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Erro ao importar linha';
          errors.push({ index: i, message });
        }
      }

      res.json({
        success: true,
        data: {
          created,
          failed: errors.length,
          errors
        },
        message: `Importação concluída: ${created} criado(s), ${errors.length} erro(s)`
      });
    } catch (error) {
      next(error);
    }
  }
}
