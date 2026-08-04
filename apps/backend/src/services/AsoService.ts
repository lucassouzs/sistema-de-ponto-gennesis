import { AsoGrauRisco, AsoResultado, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const DEFAULT_PERIODICIDADE_MESES = 12;

export type AsoStatusValidade =
  | 'validos'
  | 'a_vencer'
  | 'a_vencer_30'
  | 'a_vencer_60'
  | 'vencidos'
  | 'validade_padrao';

export type AsoListFilters = {
  search?: string;
  tipoAsoId?: string;
  resultado?: AsoResultado;
  statusValidade?: AsoStatusValidade;
  funcionarioId?: string;
  department?: string;
  position?: string;
  page?: number;
  limit?: number;
};

function addMonths(date: Date, months: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function todayDateOnly(): Date {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const raw = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) throw createError('Data inválida', 400);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Classifica a validade de uma data em relação a hoje (mesmas faixas usadas nos filtros/dashboard). */
function classifyValidade(dataValidade: Date, today: Date, in30: Date, in60: Date):
  | 'vencido'
  | 'a_vencer_30'
  | 'a_vencer_60'
  | 'valido' {
  if (dataValidade < today) return 'vencido';
  if (dataValidade <= in30) return 'a_vencer_30';
  if (dataValidade <= in60) return 'a_vencer_60';
  return 'valido';
}

export class AsoService {
  async listTipos() {
    return prisma.asoTipo.findMany({ orderBy: { nome: 'asc' } });
  }

  async listCargosRisco() {
    return prisma.cargoRisco.findMany({ orderBy: { cargo: 'asc' } });
  }

  /**
   * Cargos disponíveis para risco = mesmos do cadastro de funcionários (CARGOS),
   * com flag se já possuem registro em cargos_risco.
   * Inclui também cargos já usados em funcionários ativos que não estejam na lista fixa.
   */
  async listCargosDisponiveis() {
    const CARGOS_CADASTRO = [
      'Ajudante',
      'Almoxarife',
      'Analista',
      'Assistente',
      'Auxiliar',
      'Babá',
      'Bombeiro hidráulico',
      'Comprador jr',
      'Coordenador(a)',
      'Eletricista',
      'Eletrotécnico',
      'Encarregado',
      'Engenheiro',
      'Estagiário(a)',
      'Gerente',
      'Gesseiro',
      'Impermeabilizador',
      'Jovem aprendiz',
      'Marceneiro',
      'Mestre de obras',
      'Motorista',
      'Oficial de manutenção',
      'Orçamentista',
      'Pedreiro',
      'Pintor',
      'Servente',
      'Serviços administrativos',
      'Serviços gerais',
      'Supervisor',
      'Técnico',
      'Vidraceiro',
    ];

    const rows = await prisma.employee.findMany({
      where: {
        user: { isActive: true },
        position: { not: '' },
      },
      select: { position: true },
    });

    const uniqueByNorm = new Map<string, string>();
    for (const cargo of CARGOS_CADASTRO) {
      uniqueByNorm.set(cargo.trim().toLowerCase(), cargo);
    }
    for (const row of rows) {
      const cargo = String(row.position || '').trim();
      if (!cargo) continue;
      const key = cargo.toLowerCase();
      // Não inclui Administrador/Diretor na seleção (mesmo filtro do cadastro)
      if (key === 'administrador' || key === 'diretor') continue;
      if (!uniqueByNorm.has(key)) uniqueByNorm.set(key, cargo);
    }

    const cadastrados = await prisma.cargoRisco.findMany({ select: { cargo: true } });
    const cadastradosNorm = new Set(
      cadastrados.map((c) => c.cargo.trim().toLowerCase()).filter(Boolean)
    );

    return [...uniqueByNorm.values()]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((cargo) => ({
        cargo,
        jaCadastrado: cadastradosNorm.has(cargo.toLowerCase()),
      }));
  }

  private async assertCargoExisteEmFuncionariosAtivos(cargo: string) {
    const cargoNorm = cargo.trim().toLowerCase();
    if (!cargoNorm) throw createError('Cargo é obrigatório', 400);
    if (cargoNorm === 'administrador' || cargoNorm === 'diretor') {
      throw createError('Cargo inválido para controle de ASO', 400);
    }

    const CARGOS_CADASTRO = new Set(
      [
        'Ajudante',
        'Almoxarife',
        'Analista',
        'Assistente',
        'Auxiliar',
        'Babá',
        'Bombeiro hidráulico',
        'Comprador jr',
        'Coordenador(a)',
        'Eletricista',
        'Eletrotécnico',
        'Encarregado',
        'Engenheiro',
        'Estagiário(a)',
        'Gerente',
        'Gesseiro',
        'Impermeabilizador',
        'Jovem aprendiz',
        'Marceneiro',
        'Mestre de obras',
        'Motorista',
        'Oficial de manutenção',
        'Orçamentista',
        'Pedreiro',
        'Pintor',
        'Servente',
        'Serviços administrativos',
        'Serviços gerais',
        'Supervisor',
        'Técnico',
        'Vidraceiro',
      ].map((c) => c.toLowerCase())
    );

    if (CARGOS_CADASTRO.has(cargoNorm)) return;

    const employees = await prisma.employee.findMany({
      where: {
        user: { isActive: true },
        position: { not: '' },
      },
      select: { position: true },
    });

    const exists = employees.some(
      (e) => String(e.position || '').trim().toLowerCase() === cargoNorm
    );
    if (!exists) {
      throw createError(
        'Cargo inválido: selecione um cargo da lista do cadastro de funcionários',
        400
      );
    }
  }

  async createCargoRisco(data: {
    cargo: string;
    grauRisco: AsoGrauRisco;
    periodicidadeMeses: number;
  }) {
    const cargo = data.cargo.trim();
    if (!cargo) throw createError('Cargo é obrigatório', 400);
    if (!Number.isFinite(data.periodicidadeMeses) || data.periodicidadeMeses < 1) {
      throw createError('Periodicidade deve ser um número de meses >= 1', 400);
    }

    await this.assertCargoExisteEmFuncionariosAtivos(cargo);

    try {
      return await prisma.cargoRisco.create({
        data: {
          cargo,
          grauRisco: data.grauRisco,
          periodicidadeMeses: Math.floor(data.periodicidadeMeses),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw createError('Já existe periodicidade cadastrada para este cargo', 409);
      }
      throw error;
    }
  }

  async updateCargoRisco(
    id: string,
    data: Partial<{ cargo: string; grauRisco: AsoGrauRisco; periodicidadeMeses: number }>
  ) {
    const existing = await prisma.cargoRisco.findUnique({ where: { id } });
    if (!existing) throw createError('Cargo de risco não encontrado', 404);

    const cargo = data.cargo !== undefined ? data.cargo.trim() : undefined;
    if (cargo !== undefined && !cargo) throw createError('Cargo é obrigatório', 400);
    if (cargo !== undefined) {
      await this.assertCargoExisteEmFuncionariosAtivos(cargo);
    }
    if (
      data.periodicidadeMeses !== undefined &&
      (!Number.isFinite(data.periodicidadeMeses) || data.periodicidadeMeses < 1)
    ) {
      throw createError('Periodicidade deve ser um número de meses >= 1', 400);
    }

    try {
      return await prisma.cargoRisco.update({
        where: { id },
        data: {
          ...(cargo !== undefined ? { cargo } : {}),
          ...(data.grauRisco !== undefined ? { grauRisco: data.grauRisco } : {}),
          ...(data.periodicidadeMeses !== undefined
            ? { periodicidadeMeses: Math.floor(data.periodicidadeMeses) }
            : {}),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw createError('Já existe periodicidade cadastrada para este cargo', 409);
      }
      throw error;
    }
  }

  async deleteCargoRisco(id: string) {
    const existing = await prisma.cargoRisco.findUnique({ where: { id } });
    if (!existing) throw createError('Cargo de risco não encontrado', 404);
    await prisma.cargoRisco.delete({ where: { id } });
    return { id };
  }

  /**
   * Cargos de funcionários ativos que não possuem periodicidade cadastrada em cargos_risco
   * (usam os 12 meses padrão). Agrupado por cargo, com a lista de funcionários.
   */
  async cargosSemPeriodicidade() {
    const employees = await prisma.employee.findMany({
      where: { user: { isActive: true }, position: { not: '' } },
      select: {
        id: true,
        employeeId: true,
        position: true,
        department: true,
        user: { select: { name: true } },
      },
    });

    const cargosRisco = await prisma.cargoRisco.findMany({ select: { cargo: true } });
    const cadastradosNorm = new Set(
      cargosRisco.map((c) => c.cargo.trim().toLowerCase()).filter(Boolean)
    );

    const byCargo = new Map<
      string,
      { cargo: string; funcionarios: Array<{ id: string; nome: string; employeeId: string; department: string }> }
    >();

    for (const e of employees) {
      const cargo = String(e.position || '').trim();
      if (!cargo) continue;
      const key = cargo.toLowerCase();
      if (cadastradosNorm.has(key)) continue;
      if (!byCargo.has(key)) byCargo.set(key, { cargo, funcionarios: [] });
      byCargo.get(key)!.funcionarios.push({
        id: e.id,
        nome: e.user?.name || '',
        employeeId: e.employeeId,
        department: e.department,
      });
    }

    return [...byCargo.values()].sort((a, b) => a.cargo.localeCompare(b.cargo, 'pt-BR'));
  }

  /**
   * Resolve periodicidade pelo cargo do funcionário (match case-insensitive).
   * Sem cadastro → 12 meses + flag validadePadrao.
   */
  async resolvePeriodicidade(cargoFuncionario: string | null | undefined): Promise<{
    periodicidadeMeses: number;
    validadePadrao: boolean;
    cargoRiscoId: string | null;
    grauRisco: AsoGrauRisco | null;
  }> {
    const cargo = (cargoFuncionario || '').trim();
    if (!cargo) {
      return {
        periodicidadeMeses: DEFAULT_PERIODICIDADE_MESES,
        validadePadrao: true,
        cargoRiscoId: null,
        grauRisco: null,
      };
    }

    const all = await prisma.cargoRisco.findMany();
    const match = all.find((c) => c.cargo.trim().toLowerCase() === cargo.toLowerCase());
    if (!match) {
      return {
        periodicidadeMeses: DEFAULT_PERIODICIDADE_MESES,
        validadePadrao: true,
        cargoRiscoId: null,
        grauRisco: null,
      };
    }

    return {
      periodicidadeMeses: match.periodicidadeMeses,
      validadePadrao: false,
      cargoRiscoId: match.id,
      grauRisco: match.grauRisco,
    };
  }

  async previewValidade(funcionarioId: string, dataExame: string | Date) {
    const employee = await prisma.employee.findUnique({
      where: { id: funcionarioId },
      select: { id: true, position: true },
    });
    if (!employee) throw createError('Funcionário não encontrado', 404);

    const exame = parseDateOnly(dataExame);
    const resolved = await this.resolvePeriodicidade(employee.position);
    return {
      dataExame: exame.toISOString().slice(0, 10),
      dataValidade: addMonths(exame, resolved.periodicidadeMeses).toISOString().slice(0, 10),
      periodicidadeMeses: resolved.periodicidadeMeses,
      validadePadrao: resolved.validadePadrao,
      cargo: employee.position,
      grauRisco: resolved.grauRisco,
    };
  }

  private registroInclude = {
    tipoAso: true,
    funcionario: {
      select: {
        id: true,
        employeeId: true,
        position: true,
        department: true,
        user: { select: { id: true, name: true, cpf: true, isActive: true, email: true } },
      },
    },
    criadoPor: { select: { id: true, name: true } },
  } satisfies Prisma.AsoRegistroInclude;

  private buildRegistroWhere(filters: AsoListFilters): Prisma.AsoRegistroWhereInput {
    const where: Prisma.AsoRegistroWhereInput = {};

    if (filters.tipoAsoId) where.tipoAsoId = filters.tipoAsoId;
    if (filters.resultado) where.resultado = filters.resultado;
    if (filters.funcionarioId) where.funcionarioId = filters.funcionarioId;

    const todayUtc = todayDateOnly();
    const in30 = addDays(todayUtc, 30);
    const in60 = addDays(todayUtc, 60);

    switch (filters.statusValidade) {
      case 'vencidos':
        where.dataValidade = { lt: todayUtc };
        break;
      case 'a_vencer':
      case 'a_vencer_30':
        where.dataValidade = { gte: todayUtc, lte: in30 };
        break;
      case 'a_vencer_60':
        where.dataValidade = { gte: todayUtc, lte: in60 };
        break;
      case 'validos':
        where.dataValidade = { gt: in30 };
        break;
      case 'validade_padrao':
        where.validadePadrao = true;
        break;
      default:
        break;
    }

    const funcionarioFilters: Prisma.EmployeeWhereInput = {};
    if (filters.department?.trim()) {
      funcionarioFilters.department = { equals: filters.department.trim(), mode: 'insensitive' };
    }
    if (filters.position?.trim()) {
      funcionarioFilters.position = { equals: filters.position.trim(), mode: 'insensitive' };
    }
    if (Object.keys(funcionarioFilters).length > 0) {
      where.funcionario = funcionarioFilters;
    }

    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { medicoResponsavel: { contains: q, mode: 'insensitive' } },
        { clinica: { contains: q, mode: 'insensitive' } },
        { crmMedico: { contains: q, mode: 'insensitive' } },
        { observacoes: { contains: q, mode: 'insensitive' } },
        {
          funcionario: {
            OR: [
              { employeeId: { contains: q, mode: 'insensitive' } },
              { position: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } },
              { user: { name: { contains: q, mode: 'insensitive' } } },
              { user: { cpf: { contains: q, mode: 'insensitive' } } },
            ],
          },
        },
        { tipoAso: { nome: { contains: q, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  async listRegistros(filters: AsoListFilters = {}) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const where = this.buildRegistroWhere(filters);

    const [total, items] = await Promise.all([
      prisma.asoRegistro.count({ where }),
      prisma.asoRegistro.findMany({
        where,
        include: this.registroInclude,
        orderBy: [{ dataValidade: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** Mesmos filtros de listRegistros, mas sem paginação (limite de segurança de 5000) — usado na exportação Excel. */
  async exportRegistros(filters: AsoListFilters = {}) {
    const where = this.buildRegistroWhere(filters);
    return prisma.asoRegistro.findMany({
      where,
      include: this.registroInclude,
      orderBy: [{ dataValidade: 'asc' }, { createdAt: 'desc' }],
      take: 5000,
    });
  }

  async getRegistroById(id: string) {
    const registro = await prisma.asoRegistro.findUnique({
      where: { id },
      include: this.registroInclude,
    });
    if (!registro) throw createError('Registro de ASO não encontrado', 404);
    return registro;
  }

  async createRegistro(input: {
    funcionarioId: string;
    tipoAsoId: string;
    dataExame: string | Date;
    resultado: AsoResultado;
    medicoResponsavel: string;
    crmMedico: string;
    clinica: string;
    anexoUrl?: string | null;
    observacoes?: string | null;
    criadoPorId?: string | null;
  }) {
    const employee = await prisma.employee.findUnique({
      where: { id: input.funcionarioId },
      select: { id: true, position: true },
    });
    if (!employee) throw createError('Funcionário não encontrado', 404);

    const tipo = await prisma.asoTipo.findUnique({ where: { id: input.tipoAsoId } });
    if (!tipo) throw createError('Tipo de ASO inválido', 400);

    const medicoResponsavel = input.medicoResponsavel?.trim();
    const crmMedico = input.crmMedico?.trim();
    const clinica = input.clinica?.trim();
    if (!medicoResponsavel || !crmMedico || !clinica) {
      throw createError('Médico, CRM e clínica são obrigatórios', 400);
    }
    if (!Object.values(AsoResultado).includes(input.resultado)) {
      throw createError('Resultado inválido', 400);
    }

    const dataExame = parseDateOnly(input.dataExame);
    const resolved = await this.resolvePeriodicidade(employee.position);
    const dataValidade = addMonths(dataExame, resolved.periodicidadeMeses);

    const todayUtc = todayDateOnly();
    const conflito = await prisma.asoRegistro.findFirst({
      where: {
        funcionarioId: employee.id,
        tipoAsoId: tipo.id,
        dataValidade: { gte: todayUtc },
      },
      orderBy: { dataValidade: 'desc' },
    });

    const data = await prisma.asoRegistro.create({
      data: {
        funcionarioId: employee.id,
        tipoAsoId: tipo.id,
        dataExame,
        dataValidade,
        resultado: input.resultado,
        medicoResponsavel,
        crmMedico,
        clinica,
        anexoUrl: input.anexoUrl?.trim() || null,
        observacoes: input.observacoes?.trim() || null,
        validadePadrao: resolved.validadePadrao,
        periodicidadeUsada: resolved.periodicidadeMeses,
        criadoPorId: input.criadoPorId || null,
      },
      include: this.registroInclude,
    });

    return {
      data,
      warning: conflito
        ? `Já existe ASO vigente do mesmo tipo (${tipo.nome}) válido até ${conflito.dataValidade
            .toISOString()
            .slice(0, 10)
            .split('-')
            .reverse()
            .join('/')}. Verifique se este novo registro é realmente necessário.`
        : undefined,
    };
  }

  async updateRegistro(
    id: string,
    input: Partial<{
      funcionarioId: string;
      tipoAsoId: string;
      dataExame: string | Date;
      resultado: AsoResultado;
      medicoResponsavel: string;
      crmMedico: string;
      clinica: string;
      anexoUrl: string | null;
      observacoes: string | null;
      recalcularValidade: boolean;
    }>
  ) {
    const existing = await prisma.asoRegistro.findUnique({ where: { id } });
    if (!existing) throw createError('Registro de ASO não encontrado', 404);

    let funcionarioId = existing.funcionarioId;
    if (input.funcionarioId) {
      const employee = await prisma.employee.findUnique({
        where: { id: input.funcionarioId },
        select: { id: true },
      });
      if (!employee) throw createError('Funcionário não encontrado', 404);
      funcionarioId = employee.id;
    }

    if (input.tipoAsoId) {
      const tipo = await prisma.asoTipo.findUnique({ where: { id: input.tipoAsoId } });
      if (!tipo) throw createError('Tipo de ASO inválido', 400);
    }

    if (input.resultado && !Object.values(AsoResultado).includes(input.resultado)) {
      throw createError('Resultado inválido', 400);
    }

    const shouldRecalc =
      input.recalcularValidade !== false &&
      (input.dataExame !== undefined || input.funcionarioId !== undefined);

    let dataExame = existing.dataExame;
    let dataValidade = existing.dataValidade;
    let validadePadrao = existing.validadePadrao;
    let periodicidadeUsada = existing.periodicidadeUsada;

    if (input.dataExame !== undefined) {
      dataExame = parseDateOnly(input.dataExame);
    }

    if (shouldRecalc) {
      const employee = await prisma.employee.findUnique({
        where: { id: funcionarioId },
        select: { position: true },
      });
      const resolved = await this.resolvePeriodicidade(employee?.position);
      dataValidade = addMonths(dataExame, resolved.periodicidadeMeses);
      validadePadrao = resolved.validadePadrao;
      periodicidadeUsada = resolved.periodicidadeMeses;
    }

    return prisma.asoRegistro.update({
      where: { id },
      data: {
        funcionarioId,
        ...(input.tipoAsoId ? { tipoAsoId: input.tipoAsoId } : {}),
        dataExame,
        dataValidade,
        validadePadrao,
        periodicidadeUsada,
        ...(input.resultado ? { resultado: input.resultado } : {}),
        ...(input.medicoResponsavel !== undefined
          ? { medicoResponsavel: input.medicoResponsavel.trim() }
          : {}),
        ...(input.crmMedico !== undefined ? { crmMedico: input.crmMedico.trim() } : {}),
        ...(input.clinica !== undefined ? { clinica: input.clinica.trim() } : {}),
        ...(input.anexoUrl !== undefined
          ? { anexoUrl: input.anexoUrl?.trim() || null }
          : {}),
        ...(input.observacoes !== undefined
          ? { observacoes: input.observacoes?.trim() || null }
          : {}),
      },
      include: this.registroInclude,
    });
  }

  async setAnexo(id: string, anexoUrl: string) {
    const existing = await prisma.asoRegistro.findUnique({ where: { id } });
    if (!existing) throw createError('Registro de ASO não encontrado', 404);
    return prisma.asoRegistro.update({
      where: { id },
      data: { anexoUrl },
      include: this.registroInclude,
    });
  }

  async deleteRegistro(id: string) {
    const existing = await prisma.asoRegistro.findUnique({ where: { id } });
    if (!existing) throw createError('Registro de ASO não encontrado', 404);
    await prisma.asoRegistro.delete({ where: { id } });
    return { id };
  }

  async dashboardCounts() {
    const todayUtc = todayDateOnly();
    const in30 = addDays(todayUtc, 30);
    const in60 = addDays(todayUtc, 60);

    const [total, vencidos, aVencer30, aVencer60, validadePadrao, activeEmployees, cargosRisco] =
      await Promise.all([
        prisma.asoRegistro.count(),
        prisma.asoRegistro.count({ where: { dataValidade: { lt: todayUtc } } }),
        prisma.asoRegistro.count({ where: { dataValidade: { gte: todayUtc, lte: in30 } } }),
        prisma.asoRegistro.count({ where: { dataValidade: { gte: todayUtc, lte: in60 } } }),
        prisma.asoRegistro.count({ where: { validadePadrao: true } }),
        prisma.employee.findMany({
          where: { user: { isActive: true } },
          select: { id: true, position: true },
        }),
        prisma.cargoRisco.findMany({ select: { cargo: true } }),
      ]);

    const activeIds = activeEmployees.map((e) => e.id);

    const registrosAtivos = activeIds.length
      ? await prisma.asoRegistro.findMany({
          where: { funcionarioId: { in: activeIds } },
          select: { funcionarioId: true, dataValidade: true, dataExame: true },
          orderBy: [{ dataValidade: 'desc' }, { dataExame: 'desc' }],
        })
      : [];

    const latestByFuncionario = new Map<string, Date>();
    for (const r of registrosAtivos) {
      if (!latestByFuncionario.has(r.funcionarioId)) {
        latestByFuncionario.set(r.funcionarioId, r.dataValidade);
      }
    }

    let comAsoValido = 0;
    for (const validade of latestByFuncionario.values()) {
      if (validade >= todayUtc) comAsoValido++;
    }

    const ativos = activeIds.length;
    const percentual = ativos > 0 ? Math.round((comAsoValido / ativos) * 1000) / 10 : 0;

    const cargosRiscoNorm = new Set(
      cargosRisco.map((c) => c.cargo.trim().toLowerCase()).filter(Boolean)
    );
    const cargosSemPeriodicidadeSet = new Set<string>();
    for (const e of activeEmployees) {
      const cargo = String(e.position || '').trim();
      if (!cargo) continue;
      const key = cargo.toLowerCase();
      if (!cargosRiscoNorm.has(key)) cargosSemPeriodicidadeSet.add(key);
    }

    return {
      total,
      vencidos,
      aVencer30,
      aVencer60,
      validadePadrao,
      cobertura: { ativos, comAsoValido, percentual },
      cargosSemPeriodicidade: cargosSemPeriodicidadeSet.size,
    };
  }

  /** Lista funcionários ativos com o resumo do último ASO — usado na aba "Por funcionário". */
  async listPorFuncionario(
    filters: {
      search?: string;
      department?: string;
      position?: string;
      statusValidade?: AsoStatusValidade | 'sem_aso';
    } = {}
  ) {
    const where: Prisma.EmployeeWhereInput = { user: { isActive: true } };
    if (filters.department?.trim()) {
      where.department = { equals: filters.department.trim(), mode: 'insensitive' };
    }
    if (filters.position?.trim()) {
      where.position = { equals: filters.position.trim(), mode: 'insensitive' };
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { employeeId: { contains: q, mode: 'insensitive' } },
        { position: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { user: { cpf: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const employees = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeId: true,
        position: true,
        department: true,
        user: { select: { name: true, cpf: true } },
      },
    });

    const ids = employees.map((e) => e.id);
    const registros = ids.length
      ? await prisma.asoRegistro.findMany({
          where: { funcionarioId: { in: ids } },
          include: { tipoAso: true },
          orderBy: [{ dataValidade: 'desc' }, { dataExame: 'desc' }],
        })
      : [];

    const latestByFuncionario = new Map<string, (typeof registros)[number]>();
    for (const r of registros) {
      if (!latestByFuncionario.has(r.funcionarioId)) {
        latestByFuncionario.set(r.funcionarioId, r);
      }
    }

    const cargosRisco = await prisma.cargoRisco.findMany({ select: { cargo: true } });
    const cargosRiscoNorm = new Set(
      cargosRisco.map((c) => c.cargo.trim().toLowerCase()).filter(Boolean)
    );

    const todayUtc = todayDateOnly();
    const in30 = addDays(todayUtc, 30);
    const in60 = addDays(todayUtc, 60);

    let items = employees.map((e) => {
      const ultimoAso = latestByFuncionario.get(e.id) || null;
      let statusValidade: AsoStatusValidade | 'sem_aso' = 'sem_aso';
      if (ultimoAso) {
        const classe = classifyValidade(ultimoAso.dataValidade, todayUtc, in30, in60);
        statusValidade = classe === 'vencido' ? 'vencidos' : classe === 'valido' ? 'validos' : classe;
      }
      const hasPeriodicidadeCargo = cargosRiscoNorm.has(String(e.position || '').trim().toLowerCase());

      return {
        funcionarioId: e.id,
        employeeId: e.employeeId,
        nome: e.user?.name || '',
        cpf: e.user?.cpf || '',
        position: e.position,
        department: e.department,
        ultimoAso: ultimoAso
          ? {
              id: ultimoAso.id,
              tipoAsoId: ultimoAso.tipoAsoId,
              tipoAso: ultimoAso.tipoAso,
              dataExame: ultimoAso.dataExame,
              dataValidade: ultimoAso.dataValidade,
            }
          : null,
        statusValidade,
        hasPeriodicidadeCargo,
      };
    });

    if (filters.statusValidade) {
      items = items.filter((i) => i.statusValidade === filters.statusValidade);
    }

    items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return items;
  }

  async historicoFuncionario(funcionarioId: string) {
    const employee = await prisma.employee.findUnique({
      where: { id: funcionarioId },
      select: {
        id: true,
        employeeId: true,
        position: true,
        department: true,
        user: { select: { name: true, cpf: true } },
      },
    });
    if (!employee) throw createError('Funcionário não encontrado', 404);

    const registros = await prisma.asoRegistro.findMany({
      where: { funcionarioId },
      include: this.registroInclude,
      orderBy: { dataExame: 'desc' },
    });

    return { funcionario: employee, registros };
  }

  async ultimoAsoFuncionario(funcionarioId: string) {
    const employee = await prisma.employee.findUnique({
      where: { id: funcionarioId },
      select: { id: true },
    });
    if (!employee) throw createError('Funcionário não encontrado', 404);

    const registro = await prisma.asoRegistro.findFirst({
      where: { funcionarioId },
      orderBy: [{ dataValidade: 'desc' }, { dataExame: 'desc' }],
    });

    if (!registro) return null;

    return {
      tipoAsoId: registro.tipoAsoId,
      medicoResponsavel: registro.medicoResponsavel,
      crmMedico: registro.crmMedico,
      clinica: registro.clinica,
      dataExame: registro.dataExame,
      dataValidade: registro.dataValidade,
    };
  }

  private normalizeImportKey(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private digitsOnly(value: string): string {
    return value.replace(/\D/g, '');
  }

  async importRegistros(
    items: Array<{
      matricula?: string;
      cpf?: string;
      funcionarioNome?: string;
      tipoAsoNome: string;
      dataExame: string;
      resultado: AsoResultado;
      medicoResponsavel: string;
      crmMedico: string;
      clinica: string;
      anexoUrl?: string | null;
      observacoes?: string | null;
    }>,
    criadoPorId?: string | null
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw createError('Envie um array "registros" com ao menos um item', 400);
    }

    const tipos = await prisma.asoTipo.findMany();
    const tipoByName = new Map(tipos.map((t) => [this.normalizeImportKey(t.nome), t]));

    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        employeeId: true,
        user: { select: { name: true, cpf: true } },
      },
    });

    const byMatricula = new Map<string, string>();
    const byCpf = new Map<string, string>();
    const byName = new Map<string, string[]>();

    for (const e of employees) {
      if (e.employeeId) byMatricula.set(this.normalizeImportKey(e.employeeId), e.id);
      const cpfDigits = this.digitsOnly(e.user?.cpf || '');
      if (cpfDigits.length >= 11) byCpf.set(cpfDigits, e.id);
      const nameKey = this.normalizeImportKey(e.user?.name || '');
      if (nameKey) {
        const list = byName.get(nameKey) || [];
        list.push(e.id);
        byName.set(nameKey, list);
      }
    }

    const resolveEmployee = (row: {
      matricula?: string;
      cpf?: string;
      funcionarioNome?: string;
    }) => {
      const matricula = row.matricula?.trim();
      if (matricula) {
        const id = byMatricula.get(this.normalizeImportKey(matricula));
        if (id) return id;
      }

      const cpfDigits = row.cpf ? this.digitsOnly(row.cpf) : '';
      if (cpfDigits.length >= 11) {
        const id = byCpf.get(cpfDigits);
        if (id) return id;
      }

      const nome = row.funcionarioNome?.trim();
      if (nome) {
        const ids = byName.get(this.normalizeImportKey(nome)) || [];
        if (ids.length === 1) return ids[0];
        if (ids.length > 1) {
          throw createError(
            `Mais de um funcionário com o nome "${nome}". Informe Matrícula ou CPF.`,
            400
          );
        }
      }

      const hint = matricula || cpfDigits || nome || '?';
      throw createError(`Funcionário não encontrado (${hint})`, 404);
    };

    let created = 0;
    const errors: { index: number; message: string }[] = [];
    const warnings: { index: number; message: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      try {
        if (!row?.tipoAsoNome?.trim()) throw createError('Tipo de ASO é obrigatório', 400);
        if (!row?.dataExame) throw createError('Data do exame é obrigatória', 400);
        if (!row?.resultado) throw createError('Resultado é obrigatório', 400);

        const tipo = tipoByName.get(this.normalizeImportKey(row.tipoAsoNome));
        if (!tipo) {
          throw createError(`Tipo de ASO não encontrado: ${row.tipoAsoNome}`, 400);
        }

        const funcionarioId = resolveEmployee(row);
        const { warning } = await this.createRegistro({
          funcionarioId,
          tipoAsoId: tipo.id,
          dataExame: row.dataExame,
          resultado: row.resultado,
          medicoResponsavel: row.medicoResponsavel,
          crmMedico: row.crmMedico,
          clinica: row.clinica,
          anexoUrl: row.anexoUrl,
          observacoes: row.observacoes,
          criadoPorId,
        });

        created += 1;
        if (warning) warnings.push({ index: i, message: warning });
      } catch (err) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Erro ao importar linha';
        errors.push({ index: i, message });
      }
    }

    return {
      created,
      failed: errors.length,
      errors,
      warnings,
      total: items.length,
    };
  }
}
