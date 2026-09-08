import {
  SupportTicketCategory,
  SupportTicketChannel,
  SupportTicketStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

export type SupportTicketDto = {
  id: string;
  displayNumber: number;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  channel: SupportTicketChannel;
  subject: string;
  description: string;
  moduleHint: string | null;
  requesterId: string | null;
  requesterName: string | null;
  requesterPhone: string | null;
  requesterCpf: string | null;
  assigneeId: string | null;
  whatsAppConversationId: string | null;
  sourceChatId: string | null;
  attachmentUrl: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requester?: { id: string; name: string; email: string } | null;
  assignee?: { id: string; name: string; email: string } | null;
};

const userSelect = { id: true, name: true, email: true } as const;

function mapRow(row: {
  id: string;
  displayNumber: number;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  channel: SupportTicketChannel;
  subject: string;
  description: string;
  moduleHint: string | null;
  requesterId: string | null;
  requesterName: string | null;
  requesterPhone: string | null;
  requesterCpf: string | null;
  assigneeId: string | null;
  whatsAppConversationId: string | null;
  sourceChatId: string | null;
  attachmentUrl: string | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  requester?: { id: string; name: string; email: string } | null;
  assignee?: { id: string; name: string; email: string } | null;
}): SupportTicketDto {
  return {
    id: row.id,
    displayNumber: row.displayNumber,
    category: row.category,
    status: row.status,
    channel: row.channel,
    subject: row.subject,
    description: row.description,
    moduleHint: row.moduleHint,
    requesterId: row.requesterId,
    requesterName: row.requesterName,
    requesterPhone: row.requesterPhone,
    requesterCpf: row.requesterCpf,
    assigneeId: row.assigneeId,
    whatsAppConversationId: row.whatsAppConversationId,
    sourceChatId: row.sourceChatId,
    attachmentUrl: row.attachmentUrl,
    resolutionNote: row.resolutionNote,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    requester: row.requester ?? null,
    assignee: row.assignee ?? null,
  };
}

export const SUPPORT_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  PASSWORD_RESET: 'Esqueci a senha / primeiro acesso',
  SYSTEM_ERROR: 'Erro no sistema',
  PERMISSION: 'Sem permissão / menu',
  OTHER: 'Outro',
};

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em atendimento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Encerrado',
};

function subjectForCategory(category: SupportTicketCategory): string {
  return SUPPORT_CATEGORY_LABELS[category];
}

function parseCategory(value: unknown): SupportTicketCategory {
  const s = String(value ?? '').toUpperCase();
  if (s === 'PASSWORD_RESET' || s === 'SENHA' || s === '1') return 'PASSWORD_RESET';
  if (s === 'SYSTEM_ERROR' || s === 'ERRO' || s === '2') return 'SYSTEM_ERROR';
  if (s === 'PERMISSION' || s === 'PERMISSAO' || s === '3') return 'PERMISSION';
  return 'OTHER';
}

function parseStatus(value: unknown): SupportTicketStatus | null {
  const s = String(value ?? '').toUpperCase();
  if (s === 'OPEN') return 'OPEN';
  if (s === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (s === 'RESOLVED') return 'RESOLVED';
  if (s === 'CLOSED') return 'CLOSED';
  return null;
}

export class SupportTicketService {
  async create(input: {
    category: SupportTicketCategory | string;
    channel: SupportTicketChannel;
    description: string;
    subject?: string;
    moduleHint?: string | null;
    requesterId?: string | null;
    requesterName?: string | null;
    requesterPhone?: string | null;
    requesterCpf?: string | null;
    whatsAppConversationId?: string | null;
    sourceChatId?: string | null;
    attachmentUrl?: string | null;
  }): Promise<SupportTicketDto> {
    const category = parseCategory(input.category);
    const description = String(input.description ?? '').trim();
    if (!description) {
      throw new Error('Descrição é obrigatória');
    }

    const created = await prisma.$transaction(async (tx) => {
      const agg = await tx.supportTicket.aggregate({ _max: { displayNumber: true } });
      const nextDisplay = (agg._max.displayNumber ?? 0) + 1;
      return tx.supportTicket.create({
        data: {
          displayNumber: nextDisplay,
          category,
          channel: input.channel,
          subject: (input.subject?.trim() || subjectForCategory(category)).slice(0, 200),
          description: description.slice(0, 8000),
          moduleHint: input.moduleHint?.trim()?.slice(0, 200) || null,
          requesterId: input.requesterId || null,
          requesterName: input.requesterName?.trim()?.slice(0, 120) || null,
          requesterPhone: input.requesterPhone?.trim()?.slice(0, 30) || null,
          requesterCpf: input.requesterCpf?.replace(/\D/g, '').slice(0, 11) || null,
          whatsAppConversationId: input.whatsAppConversationId || null,
          sourceChatId: input.sourceChatId || null,
          attachmentUrl: input.attachmentUrl || null,
          status: 'OPEN',
        },
        include: { requester: { select: userSelect }, assignee: { select: userSelect } },
      });
    });

    return mapRow(created);
  }

  async listForTeam(params?: {
    status?: string;
    category?: string;
    q?: string;
  }): Promise<SupportTicketDto[]> {
    const where: Prisma.SupportTicketWhereInput = {};
    const status = parseStatus(params?.status);
    if (status) where.status = status;
    if (params?.category) {
      where.category = parseCategory(params.category);
    }
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { requesterName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await prisma.supportTicket.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { requester: { select: userSelect }, assignee: { select: userSelect } },
    });
    return rows.map(mapRow);
  }

  async listMine(requesterId: string): Promise<SupportTicketDto[]> {
    const rows = await prisma.supportTicket.findMany({
      where: { requesterId },
      orderBy: { createdAt: 'desc' },
      include: { requester: { select: userSelect }, assignee: { select: userSelect } },
    });
    return rows.map(mapRow);
  }

  async pendingCount(): Promise<number> {
    return prisma.supportTicket.count({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });
  }

  async getById(id: string): Promise<SupportTicketDto | null> {
    const row = await prisma.supportTicket.findUnique({
      where: { id },
      include: { requester: { select: userSelect }, assignee: { select: userSelect } },
    });
    return row ? mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      status?: SupportTicketStatus | string;
      assigneeId?: string | null;
      resolutionNote?: string | null;
    },
    actorId: string,
  ): Promise<SupportTicketDto> {
    const existing = await prisma.supportTicket.findUnique({ where: { id } });
    if (!existing) throw new Error('Chamado não encontrado');

    const status = input.status ? parseStatus(input.status) : null;
    const data: Prisma.SupportTicketUpdateInput = {};

    if (status) {
      data.status = status;
      if (status === 'RESOLVED') {
        data.resolvedAt = new Date();
      }
      if (status === 'CLOSED') {
        data.closedAt = new Date();
        if (!existing.resolvedAt) data.resolvedAt = new Date();
      }
    }

    if (input.assigneeId !== undefined) {
      data.assignee = input.assigneeId
        ? { connect: { id: input.assigneeId } }
        : { disconnect: true };
      if (input.assigneeId && !status) {
        data.status = 'IN_PROGRESS';
      }
    }

    if (input.resolutionNote !== undefined) {
      data.resolutionNote = input.resolutionNote?.trim()?.slice(0, 4000) || null;
    }

    if (Object.keys(data).length === 0) {
      throw new Error('Nada para atualizar');
    }

    void actorId;

    const updated = await prisma.supportTicket.update({
      where: { id },
      data,
      include: { requester: { select: userSelect }, assignee: { select: userSelect } },
    });
    return mapRow(updated);
  }
}

export const supportTicketService = new SupportTicketService();
